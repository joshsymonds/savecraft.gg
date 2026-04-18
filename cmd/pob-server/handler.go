package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
)

// pobRespTypeError is the PoB JSON-lines protocol error type.
const pobRespTypeError = "error"

// Server is the PoB HTTP server.
type Server struct {
	pool   *Pool
	cache  *BuildCache
	apiKey string
	client *http.Client // for outbound requests (URL resolution); nil uses DefaultClient
	log    *slog.Logger

	// gemNames is a lazy-populated cache of PoB's canonical gem names,
	// fetched once from wrapper.lua's list_gems accessor. Used to
	// compute fuzzy suggestions when a swap_gem / add_gem op fails.
	// Once-populated and process-lifetime stable (PoB gem data doesn't
	// change without a plugin/data bump). If the first fetch fails,
	// enrichment gracefully falls through — no worse than today.
	gemNamesOnce sync.Once
	gemNames     []string
}

// CalcRequest is the JSON body for POST /calc.
type CalcRequest struct {
	BuildCode string `json:"buildCode"` // base64 PoB build code
	BuildXML  string `json:"buildXml"`  // raw XML (alternative to buildCode)
}

type calcLuaRequest struct {
	Type     string   `json:"type"`
	XML      string   `json:"xml"`
	StatKeys []string `json:"statKeys,omitempty"`
}

// calcResponse wraps the PoB result with a buildId for caching.
type calcResponse struct {
	BuildID string          `json:"buildId"`
	PobData json.RawMessage `json:"data"`
}

// maxRequestBodySize limits incoming POST bodies to 2 MB.
const maxRequestBodySize = 2 * 1024 * 1024

func (srv *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if srv.apiKey == "" {
			next(writer, request)
			return
		}
		auth := request.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") ||
			subtle.ConstantTimeCompare([]byte(auth[7:]), []byte(srv.apiKey)) != 1 {
			http.Error(writer, `{"error": "unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(writer, request)
	}
}

func (srv *Server) handleCalc(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(writer, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodySize)

	var req CalcRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		http.Error(writer, `{"error": "invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	// Determine the build XML
	var xml string
	switch {
	case req.BuildXML != "":
		xml = req.BuildXML
	case req.BuildCode != "":
		var err error
		xml, err = DecodeBuildCode(req.BuildCode)
		if err != nil {
			jsonError(writer, "invalid build code: "+err.Error(), http.StatusBadRequest)
			return
		}
	default:
		jsonError(writer, "either buildCode or buildXml is required", http.StatusBadRequest)
		return
	}

	srv.calcAndRespond(writer, request, xml, "", "")
}

func (srv *Server) handleHealth(writer http.ResponseWriter, _ *http.Request) {
	idle, busy, poolMax := srv.pool.Stats()
	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(map[string]any{
		"status": "ok",
		"pool": map[string]int{
			"idle": idle,
			"busy": busy,
			"max":  poolMax,
		},
		"cacheSize": srv.cache.Len(),
	})
}

// ResolveRequest is the JSON body for POST /resolve.
type ResolveRequest struct {
	URL string `json:"url"`
}

func (srv *Server) handleResolve(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}

	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodySize)

	var req ResolveRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		jsonError(writer, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.URL == "" {
		jsonError(writer, "url is required", http.StatusBadRequest)
		return
	}

	result, err := resolveBuildURL(req.URL, srv.cache.store, srv.httpClient())
	if err != nil {
		if errors.Is(err, ErrBuildNotFound) {
			jsonError(writer, "build not found", http.StatusNotFound)
			return
		}
		srv.log.Error("resolve error", "url", req.URL, "err", err)
		// Surface user-friendly error messages (e.g. "build not found at ...")
		// but don't leak internal details like hostnames or connection errors.
		msg := err.Error()
		if strings.Contains(msg, "build not found at") ||
			strings.Contains(msg, "unsupported host") ||
			strings.Contains(msg, "invalid URL") {
			jsonError(writer, msg, http.StatusUnprocessableEntity)
		} else {
			jsonError(writer, "failed to resolve build from URL", http.StatusUnprocessableEntity)
		}
		return
	}

	// If already cached (internal URL), return stored summary
	if result.cached && result.summary != "" {
		data := json.RawMessage(result.summary)
		sections := parseSections(request)
		filtered, filterErr := filterSections(data, sections)
		if filterErr != nil {
			srv.log.Warn("section filter failed, returning unfiltered", "err", filterErr)
			filtered = data
		}

		idJSON, _ := json.Marshal(result.buildID)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]json.RawMessage{
			"buildId": idJSON,
			"data":    filtered,
		})
		return
	}

	// External URL: calc through PoB, persist, return
	srv.calcAndRespond(writer, request, result.xml, result.sourceURL, "")
}

// calcAndRespond acquires a PoB process, runs calc, persists, and writes the JSON response.
func (srv *Server) calcAndRespond(
	writer http.ResponseWriter,
	request *http.Request,
	xml, sourceURL, parentID string,
) {
	proc, err := srv.pool.Acquire()
	if err != nil {
		if errors.Is(err, ErrPoolExhausted) {
			jsonError(
				writer,
				"all PoB processes are busy, try again later",
				http.StatusServiceUnavailable,
			)
			return
		}
		srv.log.Error("pool acquire error", "err", err)
		jsonError(writer, "failed to acquire PoB process", http.StatusInternalServerError)
		return
	}
	defer srv.pool.Release(proc)

	response, err := proc.Send(calcLuaRequest{
		Type:     "calc",
		XML:      xml,
		StatKeys: parseStatKeys(request),
	})
	if err != nil {
		srv.log.Error("process send error", "err", err)
		jsonError(
			writer,
			"PoB process error — check server logs for details",
			http.StatusInternalServerError,
		)
		return
	}

	var pobResp struct {
		Type    string          `json:"type"`
		Message string          `json:"message,omitempty"`
		Data    json.RawMessage `json:"data,omitempty"`
	}
	if err := json.Unmarshal(response, &pobResp); err != nil {
		srv.log.Error("failed to parse PoB response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return
	}
	if pobResp.Type == pobRespTypeError {
		srv.log.Error("PoB calc error", "message", pobResp.Message)
		jsonError(
			writer,
			"PoB calculation failed",
			http.StatusUnprocessableEntity,
		)
		return
	}

	buildID := srv.cache.Put(xml)
	if srv.cache.store != nil {
		// Store full unfiltered data in SQLite
		if err := srv.cache.store.Put(
			buildID, xml, string(pobResp.Data), sourceURL, parentID,
		); err != nil {
			srv.log.Warn("store put failed", "id", buildID, "err", err)
		}
	}

	// Filter sections based on query parameter
	responseData := pobResp.Data
	sections := parseSections(request)
	filtered, err := filterSections(responseData, sections)
	if err != nil {
		srv.log.Warn("section filter failed, returning unfiltered", "err", err)
		filtered = responseData
	}

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID: buildID,
		PobData: filtered,
	})
}

// ModifyRequest is the JSON body for POST /modify.
type ModifyRequest struct {
	BuildID    string            `json:"buildId"`
	Operations []json.RawMessage `json:"operations"`
}

type modifyLuaRequest struct {
	Type       string            `json:"type"`
	XML        string            `json:"xml"`
	Operations []json.RawMessage `json:"operations"`
	StatKeys   []string          `json:"statKeys,omitempty"`
	PreSummary json.RawMessage   `json:"preSummary,omitempty"`
}

type modifyLuaResponse struct {
	Type    string          `json:"type"`
	Message string          `json:"message,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
	XML     string          `json:"xml,omitempty"`
}

func (srv *Server) handleModify(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}

	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodySize)

	var req ModifyRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		jsonError(writer, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.BuildID == "" {
		jsonError(writer, "buildId is required", http.StatusBadRequest)
		return
	}
	if len(req.Operations) == 0 {
		jsonError(writer, "at least one operation is required", http.StatusBadRequest)
		return
	}
	transformedOps, err := validateAndTransformModifyOperations(req.Operations)
	if err != nil {
		jsonError(writer, err.Error(), http.StatusBadRequest)
		return
	}
	req.Operations = transformedOps

	// Look up the original build XML
	xml, err := srv.cache.Get(req.BuildID)
	if err != nil {
		if errors.Is(err, ErrBuildNotFound) {
			jsonError(writer, "build not found", http.StatusNotFound)
			return
		}
		srv.log.Error("cache get error", "id", req.BuildID, "err", err)
		jsonError(writer, "failed to retrieve build", http.StatusInternalServerError)
		return
	}

	// Extract the stored summary for delta computation. This avoids a
	// redundant PoB calc pass in the Lua wrapper — the pre-modify summary
	// is passed in instead of being recomputed.
	var preSummary json.RawMessage
	if srv.cache.store != nil {
		if _, storedData, err := srv.cache.store.Get(req.BuildID); err == nil {
			preSummary = extractSummary([]byte(storedData))
		}
	}

	srv.modifyAndRespond(writer, request, xml, req.BuildID, req.Operations, preSummary)
}

// extractSummary pulls the "summary" object from a stored PoB data JSON blob.
// Returns nil if parsing fails or summary is absent.
func extractSummary(data []byte) json.RawMessage {
	var parsed struct {
		Summary json.RawMessage `json:"summary"`
	}
	if json.Unmarshal(data, &parsed) != nil || parsed.Summary == nil {
		return nil
	}
	return parsed.Summary
}

// modifyAndRespond sends a modify request to PoB, persists the result, and writes the response.
func (srv *Server) modifyAndRespond(
	writer http.ResponseWriter,
	request *http.Request,
	xml, parentID string,
	operations []json.RawMessage,
	preSummary json.RawMessage,
) {
	proc, err := srv.pool.Acquire()
	if err != nil {
		if errors.Is(err, ErrPoolExhausted) {
			jsonError(
				writer,
				"all PoB processes are busy, try again later",
				http.StatusServiceUnavailable,
			)
			return
		}
		srv.log.Error("pool acquire error", "err", err)
		jsonError(writer, "failed to acquire PoB process", http.StatusInternalServerError)
		return
	}
	defer srv.pool.Release(proc)

	response, err := proc.Send(modifyLuaRequest{
		Type:       "modify",
		XML:        xml,
		Operations: operations,
		StatKeys:   parseStatKeys(request),
		PreSummary: preSummary,
	})
	if err != nil {
		srv.log.Error("process send error", "err", err)
		jsonError(
			writer,
			"PoB process error — check server logs for details",
			http.StatusInternalServerError,
		)
		return
	}

	var pobResp modifyLuaResponse
	if err := json.Unmarshal(response, &pobResp); err != nil {
		srv.log.Error("failed to parse PoB response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return
	}
	if pobResp.Type == pobRespTypeError {
		srv.log.Error("PoB modify error", "message", pobResp.Message)
		message := pobResp.Message
		if message == "" {
			message = "PoB modification failed"
		}
		if enriched, ok := enrichGemNotFoundError(message, srv.getGemNames(proc)); ok {
			message = enriched
		}
		jsonError(writer, message, http.StatusUnprocessableEntity)
		return
	}

	modifiedXML := pobResp.XML
	if modifiedXML == "" {
		modifiedXML = xml
	}
	newID := srv.cache.Put(modifiedXML)
	if srv.cache.store != nil {
		if err := srv.cache.store.Put(
			newID, modifiedXML, string(pobResp.Data), "", parentID,
		); err != nil {
			srv.log.Warn("store put failed", "id", newID, "err", err)
		}
	}

	// Filter sections based on query parameter
	responseData := pobResp.Data
	sections := parseSections(request)
	filtered, err := filterSections(responseData, sections)
	if err != nil {
		srv.log.Warn("section filter failed, returning unfiltered", "err", err)
		filtered = responseData
	}

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID: newID,
		PobData: filtered,
	})
}

// NearbyRequest is the JSON body for POST /nearby.
type NearbyRequest struct {
	BuildID    string   `json:"buildId"`
	Metrics    []string `json:"metrics"`
	Radius     int      `json:"radius"`
	Limit      int      `json:"limit"`
	DeltaStats []string `json:"deltaStats"`
	Sort       string   `json:"sort"`
}

// nearbyExtractLuaRequest asks wrapper.lua to load the build, recalc, and
// emit raw candidate property bags for every node within radius. The Go
// side filters and ranks; Lua does not run any algorithm.
type nearbyExtractLuaRequest struct {
	Type   string   `json:"type"`
	XML    string   `json:"xml"`
	Radius int      `json:"radius"`
	Stats  []string `json:"stats"`
}

// nearbyExtractData is the response payload from handleNearbyExtract.
// Baseline carries the precomputed calc values for each requested stat so
// the Go-side rank step can compute deltas without an extra round-trip.
type nearbyExtractData struct {
	Baseline   map[string]float64 `json:"baseline"`
	Candidates []nearbyCandidate  `json:"candidates"`
}

// nearbyPerturbLuaRequest asks wrapper.lua to perturb the listed node ids
// (each via calcFunc(addNodes)) on the build that's already loaded into
// the same PoB process from the prior nearby_extract call. Returns deltas
// keyed by stringified node id.
type nearbyPerturbLuaRequest struct {
	Type    string   `json:"type"`
	NodeIDs []int    `json:"nodeIds"`
	Stats   []string `json:"stats"`
}

// nearbyPerturbData is the response payload from handleNearbyPerturb.
// Deltas is keyed by stringified node id (Lua serializes integer keys as
// strings via tostring); Go decodes back to int via the json package.
type nearbyPerturbData struct {
	Deltas map[int]map[string]float64 `json:"deltas"`
}

// nearbyMetricResult is one entry in the per-metric ranked output array
// returned by /nearby. Wire shape unchanged from before the conversion.
type nearbyMetricResult struct {
	Metric   string             `json:"metric"`
	Baseline float64            `json:"baseline"`
	Limit    int                `json:"limit"`
	Radius   int                `json:"radius"`
	Nodes    []nearbyRankedNode `json:"nodes"`
}

// parseNearbyRequest decodes, validates, and applies defaults/clamping to a nearby request.
func parseNearbyRequest(w http.ResponseWriter, r *http.Request) (NearbyRequest, string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	var req NearbyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return req, "invalid JSON body"
	}
	if req.BuildID == "" {
		return req, "buildId is required"
	}
	if len(req.Metrics) == 0 {
		return req, "at least one metric is required"
	}

	// Apply defaults and clamp to safe maximums
	if req.Radius <= 0 {
		req.Radius = 5
	} else if req.Radius > 15 {
		req.Radius = 15
	}
	if req.Limit <= 0 {
		req.Limit = 10
	} else if req.Limit > 50 {
		req.Limit = 50
	}
	if len(req.Metrics) > 10 {
		req.Metrics = req.Metrics[:10]
	}
	if len(req.DeltaStats) == 0 {
		req.DeltaStats = []string{"Life", "CombinedDPS", "EnergyShield"}
	}
	switch req.Sort {
	case "":
		req.Sort = nearbySortDesc
	case nearbySortAsc, nearbySortDesc:
	default:
		return req, "sort must be 'asc' or 'desc'"
	}

	return req, ""
}

// Nearby display-type constants for the wire response (lowercased PoB types).
const (
	nearbyDispNotable  = "notable"
	nearbyDispKeystone = "keystone"
	nearbyDispNormal   = "normal"
)

// /nearby sort-order constants.
const (
	nearbySortAsc  = "asc"
	nearbySortDesc = "desc"
)

// nearbyDisplayType maps PoB's raw type strings to the lowercased display
// strings used in the wire response. Unknown types fall through as "normal".
func nearbyDisplayType(rawType string) string {
	switch rawType {
	case nodeTypeNotable:
		return nearbyDispNotable
	case nodeTypeKeystone:
		return nearbyDispKeystone
	default:
		return nearbyDispNormal
	}
}

// nearbyExtractEnvelope is the named type for wrapper.lua's nearby_extract
// response (named so musttag can verify the inner Data type's tags).
type nearbyExtractEnvelope struct {
	Type    string            `json:"type"`
	Message string            `json:"message,omitempty"`
	Data    nearbyExtractData `json:"data,omitempty"`
}

// nearbyPerturbEnvelope is the named type for wrapper.lua's nearby_perturb
// response.
type nearbyPerturbEnvelope struct {
	Type    string            `json:"type"`
	Message string            `json:"message,omitempty"`
	Data    nearbyPerturbData `json:"data,omitempty"`
}

func (srv *Server) handleNearby(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}

	req, validationErr := parseNearbyRequest(writer, request)
	if validationErr != "" {
		jsonError(writer, validationErr, http.StatusBadRequest)
		return
	}

	xml, err := srv.cache.Get(req.BuildID)
	if err != nil {
		if errors.Is(err, ErrBuildNotFound) {
			jsonError(writer, "build not found", http.StatusNotFound)
			return
		}
		srv.log.Error("cache get error", "id", req.BuildID, "err", err)
		jsonError(writer, "failed to retrieve build", http.StatusInternalServerError)
		return
	}

	proc, err := srv.pool.Acquire()
	if err != nil {
		if errors.Is(err, ErrPoolExhausted) {
			jsonError(writer, "all PoB processes are busy, try again later", http.StatusServiceUnavailable)
			return
		}
		srv.log.Error("pool acquire error", "err", err)
		jsonError(writer, "failed to acquire PoB process", http.StatusInternalServerError)
		return
	}
	defer srv.pool.Release(proc)

	// Stat keys for both baseline (Send 1) and perturb deltas (Send 2).
	// collectStatKeys deduplicates metrics + deltaStats while preserving
	// metrics order — the canonical order for everything downstream.
	statKeys := collectStatKeys(req.Metrics, req.DeltaStats)

	extractEnvelope, ok := srv.runNearbyExtract(writer, proc, xml, req.Radius, statKeys)
	if !ok {
		return
	}

	// Filter Go-side. Only candidates that pass the predicate get a real
	// perturbation calc.
	var passing []*nearbyCandidate
	for i := range extractEnvelope.Data.Candidates {
		candidate := &extractEnvelope.Data.Candidates[i]
		if nearbyShouldEvaluate(candidate, req.Radius) {
			passing = append(passing, candidate)
		}
	}

	deltasByID, ok := srv.runNearbyPerturb(writer, proc, passing, statKeys)
	if !ok {
		return
	}

	// Build rank inputs and assemble per-metric results.
	rankInputs := nearbyBuildRankInputs(passing, deltasByID)
	results := make([]nearbyMetricResult, 0, len(req.Metrics))
	for _, metric := range req.Metrics {
		results = append(results, nearbyMetricResult{
			Metric:   metric,
			Baseline: extractEnvelope.Data.Baseline[metric],
			Limit:    req.Limit,
			Radius:   req.Radius,
			Nodes:    nearbyRank(rankInputs, metric, req.Sort, req.Limit),
		})
	}

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(results)
}

// runNearbyExtract sends the nearby_extract request and unmarshals the
// response. Writes a jsonError and returns ok=false on any failure.
func (srv *Server) runNearbyExtract(
	writer http.ResponseWriter,
	proc *Process,
	xml string,
	radius int,
	statKeys []string,
) (nearbyExtractEnvelope, bool) {
	var envelope nearbyExtractEnvelope
	raw, sendErr := proc.Send(nearbyExtractLuaRequest{
		Type:   "nearby_extract",
		XML:    xml,
		Radius: radius,
		Stats:  statKeys,
	})
	if sendErr != nil {
		srv.log.Error("process send error", "err", sendErr)
		jsonError(writer, "PoB process error — check server logs for details", http.StatusInternalServerError)
		return envelope, false
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		srv.log.Error("failed to parse extract response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return envelope, false
	}
	if envelope.Type == pobRespTypeError {
		srv.log.Error("PoB nearby_extract error", "message", envelope.Message)
		jsonError(writer, "PoB nearby search failed", http.StatusUnprocessableEntity)
		return envelope, false
	}
	return envelope, true
}

// runNearbyPerturb sends the nearby_perturb request for the given candidate
// list. Returns deltas by node id, or nil + ok=true when there are no
// candidates to perturb (no second Send needed). Writes a jsonError and
// returns ok=false on any failure.
func (srv *Server) runNearbyPerturb(
	writer http.ResponseWriter,
	proc *Process,
	passing []*nearbyCandidate,
	statKeys []string,
) (map[int]map[string]float64, bool) {
	if len(passing) == 0 {
		return nil, true
	}
	ids := make([]int, len(passing))
	for i, candidate := range passing {
		ids[i] = candidate.ID
	}
	raw, sendErr := proc.Send(nearbyPerturbLuaRequest{
		Type:    "nearby_perturb",
		NodeIDs: ids,
		Stats:   statKeys,
	})
	if sendErr != nil {
		srv.log.Error("process send error", "err", sendErr)
		jsonError(writer, "PoB process error — check server logs for details", http.StatusInternalServerError)
		return nil, false
	}
	var envelope nearbyPerturbEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		srv.log.Error("failed to parse perturb response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return nil, false
	}
	if envelope.Type == pobRespTypeError {
		srv.log.Error("PoB nearby_perturb error", "message", envelope.Message)
		jsonError(writer, "PoB nearby search failed", http.StatusUnprocessableEntity)
		return nil, false
	}
	return envelope.Data.Deltas, true
}

// nearbyBuildRankInputs converts filtered candidates and their per-id deltas
// into the rank-input shape, lowercasing the type for the wire response and
// dereferencing the optional path_dist pointer.
func nearbyBuildRankInputs(
	passing []*nearbyCandidate,
	deltasByID map[int]map[string]float64,
) []nearbyRankInput {
	out := make([]nearbyRankInput, 0, len(passing))
	for _, candidate := range passing {
		path := candidate.Path
		if path == nil {
			path = []string{}
		}
		stats := candidate.Stats
		if stats == nil {
			stats = []string{}
		}
		pathCost := 0
		if candidate.PathDist != nil {
			pathCost = *candidate.PathDist
		}
		out = append(out, nearbyRankInput{
			Name:     candidate.Name,
			Type:     nearbyDisplayType(candidate.Type),
			Stats:    stats,
			PathCost: pathCost,
			Path:     path,
			Deltas:   deltasByID[candidate.ID],
		})
	}
	return out
}

// httpClient returns the server's HTTP client, defaulting to http.DefaultClient.
func (srv *Server) httpClient() *http.Client {
	if srv.client != nil {
		return srv.client
	}
	return http.DefaultClient
}

func (srv *Server) handleGetBuild(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}

	// Parse /build/{id} or /build/{id}/summary from the path.
	path := strings.TrimPrefix(request.URL.Path, "/build/")
	if path == "" || path == request.URL.Path {
		jsonError(writer, "build ID required", http.StatusBadRequest)
		return
	}

	var id string
	var wantSummary bool
	if after, found := strings.CutSuffix(path, "/summary"); found {
		id = after
		wantSummary = true
	} else {
		id = path
	}

	xml, summary, err := srv.cache.store.Get(id)
	if errors.Is(err, ErrBuildNotFound) {
		jsonError(writer, "build not found", http.StatusNotFound)
		return
	}
	if err != nil {
		srv.log.Error("store get error", "id", id, "err", err)
		jsonError(writer, "failed to retrieve build", http.StatusInternalServerError)
		return
	}

	if wantSummary {
		// Filter sections based on query parameter
		data := json.RawMessage(summary)
		sections := parseSections(request)
		filtered, filterErr := filterSections(data, sections)
		if filterErr != nil {
			srv.log.Warn("section filter failed, returning unfiltered", "err", filterErr)
			filtered = data
		}

		idJSON, _ := json.Marshal(id)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]json.RawMessage{
			"buildId": idJSON,
			"data":    filtered,
		})
		return
	}

	// Return build code or XML based on Accept header
	accept := request.Header.Get("Accept")
	if strings.Contains(accept, "application/x-pob-code") {
		code, encErr := EncodeBuildCode(xml)
		if encErr != nil {
			srv.log.Error("encode build code error", "id", id, "err", encErr)
			jsonError(writer, "failed to encode build code", http.StatusInternalServerError)
			return
		}
		writer.Header().Set("Content-Type", "text/plain")
		_, _ = writer.Write([]byte(code))
		return
	}

	writer.Header().Set("Content-Type", "application/xml")
	_, _ = writer.Write([]byte(xml))
}

// parseCSVParam reads a comma-separated query parameter and returns
// the trimmed, non-empty values. Returns nil if the parameter is absent.
func parseCSVParam(r *http.Request, param string) []string {
	raw := r.URL.Query().Get(param)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func parseStatKeys(r *http.Request) []string {
	keys := parseCSVParam(r, "stat_keys")
	if len(keys) > 50 {
		keys = keys[:50]
	}
	return keys
}
func parseSections(r *http.Request) []string { return parseCSVParam(r, "sections") }

// filterSections modifies the PoB data JSON to control which sections are
// included in the response. If sections is nil, the "sections" key is removed
// entirely (summary-only response). If sections is non-nil, only the listed
// keys are kept within the "sections" object.
func filterSections(data json.RawMessage, sections []string) (json.RawMessage, error) {
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		return data, fmt.Errorf("unmarshal data: %w", err)
	}

	if sections == nil {
		delete(parsed, "sections")
		result, err := json.Marshal(parsed)
		if err != nil {
			return data, fmt.Errorf("marshal response: %w", err)
		}
		return result, nil
	}

	return filterRequestedSections(parsed, data, sections)
}

// filterRequestedSections keeps only the named keys in the "sections" object.
func filterRequestedSections(
	parsed map[string]json.RawMessage,
	original json.RawMessage,
	sections []string,
) (json.RawMessage, error) {
	var allSections map[string]json.RawMessage
	if raw, ok := parsed["sections"]; ok {
		if err := json.Unmarshal(raw, &allSections); err != nil {
			return original, fmt.Errorf("unmarshal sections: %w", err)
		}
	}
	filtered := make(map[string]json.RawMessage)
	for _, name := range sections {
		if val, ok := allSections[name]; ok {
			filtered[name] = val
		}
	}
	filteredJSON, err := json.Marshal(filtered)
	if err != nil {
		return original, fmt.Errorf("marshal filtered sections: %w", err)
	}
	parsed["sections"] = filteredJSON
	result, err := json.Marshal(parsed)
	if err != nil {
		return original, fmt.Errorf("marshal response: %w", err)
	}
	return result, nil
}

// listGemsLuaRequest is the JSON-lines payload for wrapper.lua's
// list_gems accessor.
type listGemsLuaRequest struct {
	Type string `json:"type"`
}

// listGemsLuaResponse is the shape returned by wrapper.lua for a
// list_gems request.
type listGemsLuaResponse struct {
	Type string `json:"type"`
	Data struct {
		Gems []string `json:"gems"`
	} `json:"data"`
}

// getGemNames returns the cached list of PoB gem names, fetching from
// the given Lua process on first call. Safe for concurrent use via
// sync.Once. On fetch failure the cache stays empty and subsequent
// callers get an empty slice — fuzzy suggestions are best-effort.
func (srv *Server) getGemNames(proc *Process) []string {
	srv.gemNamesOnce.Do(func() {
		resp, err := proc.Send(listGemsLuaRequest{Type: "list_gems"})
		if err != nil {
			srv.log.Warn("list_gems fetch failed", "err", err)
			return
		}
		var parsed listGemsLuaResponse
		if err := json.Unmarshal(resp, &parsed); err != nil {
			srv.log.Warn("list_gems response parse failed", "err", err)
			return
		}
		if parsed.Type != "result" {
			srv.log.Warn("list_gems returned non-result", "type", parsed.Type)
			return
		}
		srv.gemNames = parsed.Data.Gems
	})
	return srv.gemNames
}

func jsonError(writer http.ResponseWriter, msg string, code int) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(code)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": msg})
}
