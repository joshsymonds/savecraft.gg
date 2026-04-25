package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"strings"
	"sync"
)

// pobRespTypeError is the PoB JSON-lines protocol error type.
const pobRespTypeError = "error"

// Server is the PoB HTTP server.
type Server struct {
	pool     *Pool
	cache    *BuildCache
	apiKey   string
	client   *http.Client // for outbound requests (URL resolution); nil uses DefaultClient
	modIndex *ModSourceIndex
	log      *slog.Logger

	// PowerReportEnabled controls whether /resolve and /modify responses
	// auto-attach a top-N "what should I take next" report. Default off so
	// existing handler tests (which use minimal mock subprocesses) don't
	// have to provide the extra extract+perturb canned responses; main.go
	// flips this on in production.
	PowerReportEnabled bool

	// gemNames caches PoB's canonical gem names, fetched from
	// wrapper.lua's list_gems accessor. Used to compute fuzzy
	// suggestions when a swap_gem / add_gem op fails. Populated once
	// per server instance on first need; gem data is process-lifetime
	// stable (changes only via a plugin/data bump, which requires a
	// pob-server redeploy). If the first fetch fails, subsequent
	// fetches retry — unlike sync.Once, which would permanently pin
	// an empty slice on a transient failure.
	gemNamesMu     sync.Mutex
	gemNames       []string
	gemNamesLoaded bool
}

// CalcRequest is the JSON body for POST /calc.
type CalcRequest struct {
	BuildCode string `json:"buildCode"` // base64 PoB build code
	BuildXML  string `json:"buildXml"`  // raw XML (alternative to buildCode)
}

type calcLuaRequest struct {
	Type          string   `json:"type"`
	XML           string   `json:"xml"`
	LoadedBuildID string   `json:"loadedBuildId,omitempty"`
	StatKeys      []string `json:"statKeys,omitempty"`
}

// calcResponse wraps the PoB result with a buildId for caching.
type calcResponse struct {
	BuildID     string             `json:"buildId"`
	PobData     json.RawMessage    `json:"data"`
	PowerReport *powerReportResult `json:"power_report,omitempty"`
}

// powerReportResult is the inline equivalent of /nearby's per-metric output —
// one ranked list of unallocated nodes by the leading non-zero metric. The
// shape mirrors nearbyMetricResult so MCP consumers that already understand
// nearby can read this without a second schema.
type powerReportResult struct {
	Metric   string             `json:"metric"`
	Baseline float64            `json:"baseline"`
	Limit    int                `json:"limit"`
	Radius   int                `json:"radius"`
	Nodes    []nearbyRankedNode `json:"nodes"`
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
		filtered, written := srv.applySectionFilter(writer, data, parseSections(request))
		if written {
			return
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
//
// /resolve has no buildID at acquire time (the content-hash is computed after
// the calc completes), so this uses generic Acquire and pins the process to
// the resulting buildID before release. Subsequent calls on the same buildID
// hit affinity.
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
		Type:          "calc",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
		StatKeys:      parseStatKeys(request),
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

	// Pin the process to this buildID so follow-up calls (modify, nearby,
	// audit, compare) hit affinity instead of paying a cold load.
	srv.pool.Pin(proc, buildID)
	// Record what's loaded so the next request on this process can skip
	// the XML reload via the loadedBuildId protocol field.
	proc.SetLastLoadedBuildID(buildID)

	// Filter sections based on query parameter
	filtered, written := srv.applySectionFilter(writer, pobResp.Data, parseSections(request))
	if written {
		return
	}

	// Inline power report: top-N "what should I take next" nodes ranked
	// by the leading non-zero metric. Failure here logs and degrades to
	// nil — never fails the parent response.
	powerReport := srv.attachPowerReport(proc, buildID, xml, extractSummaryFloats(pobResp.Data))

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID:     buildID,
		PobData:     filtered,
		PowerReport: powerReport,
	})
}

// extractSummaryFloats pulls the top-level `summary` object out of the
// wrapper.lua response and decodes it as a numeric map for the inline
// power report's leading-metric pick. Returns nil on parse failure —
// callers handle that by skipping the inline call.
func extractSummaryFloats(data json.RawMessage) map[string]float64 {
	var parsed struct {
		Summary map[string]json.RawMessage `json:"summary"`
	}
	if json.Unmarshal(data, &parsed) != nil || parsed.Summary == nil {
		return nil
	}
	out := make(map[string]float64, len(parsed.Summary))
	for key, raw := range parsed.Summary {
		var n float64
		if json.Unmarshal(raw, &n) == nil {
			out[key] = n
		}
	}
	return out
}

// ModifyRequest is the JSON body for POST /modify.
type ModifyRequest struct {
	BuildID    string            `json:"buildId"`
	Operations []json.RawMessage `json:"operations"`
}

type modifyLuaRequest struct {
	Type          string            `json:"type"`
	XML           string            `json:"xml"`
	LoadedBuildID string            `json:"loadedBuildId,omitempty"`
	Operations    []json.RawMessage `json:"operations"`
	StatKeys      []string          `json:"statKeys,omitempty"`
	PreSummary    json.RawMessage   `json:"preSummary,omitempty"`
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
//
// /modify acquires by parentID (the input buildID) so the affinity-pinned
// process handles the request directly. After modify produces a new
// content-hash buildID, SwapAffinity transfers the pin from parentID to the
// new ID — old buildID's pin is dropped, new buildID inherits the same
// process.
func (srv *Server) modifyAndRespond(
	writer http.ResponseWriter,
	request *http.Request,
	xml, parentID string,
	operations []json.RawMessage,
	preSummary json.RawMessage,
) {
	proc, err := srv.pool.AcquireForBuild(parentID)
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
		Type:          "modify",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
		Operations:    operations,
		StatKeys:      parseStatKeys(request),
		PreSummary:    preSummary,
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

	// Transfer the affinity pin from parentID → newID so subsequent calls on
	// the modified build hit the same process. If parentID had no pin (cold
	// /modify), Pin establishes one on newID instead.
	if newID != parentID {
		if srv.pool.LookupAffinity(parentID) == proc {
			srv.pool.SwapAffinity(parentID, newID)
		} else {
			srv.pool.Pin(proc, newID)
		}
	}
	// The wrapper now has the modified build loaded; record its ID so
	// follow-up requests can skip reload.
	proc.SetLastLoadedBuildID(newID)

	// Filter sections based on query parameter
	filtered, written := srv.applySectionFilter(writer, pobResp.Data, parseSections(request))
	if written {
		return
	}

	// Inline power report on the modified build. modifiedXML carries the
	// post-operations XML so the inline extract runs against the new state.
	powerReport := srv.attachPowerReport(proc, newID, modifiedXML, extractSummaryFloats(pobResp.Data))

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID:     newID,
		PobData:     filtered,
		PowerReport: powerReport,
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
	Type          string   `json:"type"`
	XML           string   `json:"xml"`
	LoadedBuildID string   `json:"loadedBuildId,omitempty"`
	Radius        int      `json:"radius"`
	Stats         []string `json:"stats"`
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

	proc, err := srv.pool.AcquireForBuild(req.BuildID)
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
	// Wrapper now has req.BuildID loaded (whether the load just happened or was
	// skipped via affinity). Record so subsequent calls on this process can
	// skip-reload via the loadedBuildId protocol field.
	proc.SetLastLoadedBuildID(req.BuildID)

	// Filter Go-side. Only candidates that pass the predicate get a real
	// perturbation calc.
	var passing []*nearbyCandidate
	for i := range extractEnvelope.Data.Candidates {
		candidate := &extractEnvelope.Data.Candidates[i]
		if nearbyShouldEvaluate(candidate, req.Radius) {
			passing = append(passing, candidate)
		}
	}

	deltasByID, ok := srv.runNearbyPerturb(writer, proc, req.BuildID, passing, statKeys)
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
		Type:          "nearby_extract",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
		Radius:        radius,
		Stats:         statKeys,
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
//
// When the SQLite store is enabled, runNearbyPerturb consults the
// (build_id, node_id, metric) delta cache before sending. Candidate nodes
// whose every requested metric is cached are skipped; only nodes with at
// least one missing metric get perturbed (and the response then refreshes
// the cache for that whole node). Builds are content-addressed, so cached
// values are deterministic.
func (srv *Server) runNearbyPerturb(
	writer http.ResponseWriter,
	proc *Process,
	buildID string,
	passing []*nearbyCandidate,
	statKeys []string,
) (map[int]map[string]float64, bool) {
	if len(passing) == 0 {
		return nil, true
	}

	// Mod-source index pre-filter: drop candidates that provably can't
	// affect the LEADING metric. Filtered candidates contribute nothing to
	// the result (delta = 0 by construction) and skip both perturbation
	// and the cache write.
	passing = srv.filterByModIndex(passing, statKeys)
	if len(passing) == 0 {
		return nil, true
	}

	// Cache pre-check: split candidates into fully-cached vs needs-perturb.
	cachedHits, perturb := srv.splitNearbyByCacheLocked(buildID, passing, statKeys)

	// Send perturb only for the candidates with at least one cache miss.
	var freshDeltas map[int]map[string]float64
	if len(perturb) > 0 {
		ids := make([]int, len(perturb))
		for i, candidate := range perturb {
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
		freshDeltas = envelope.Data.Deltas

		// Refresh the cache with the fresh perturbation results.
		if srv.cache.store != nil && buildID != "" && len(freshDeltas) > 0 {
			if err := srv.cache.store.PutDeltasBatch(buildID, freshDeltas); err != nil {
				srv.log.Warn("delta cache write failed", "err", err)
			}
		}
	}

	// Merge cached + fresh; fresh wins on collision (it's the most recent
	// computation, so any cache row that disagrees is stale).
	merged := mergeDeltaMaps(cachedHits, freshDeltas)
	return merged, true
}

// filterByModIndex drops candidates whose stat strings provably cannot
// affect the leading metric (statKeys[0]). When the index isn't wired up
// or the leading metric is derived/unknown, all candidates pass through.
// The leading metric is the rank metric; downstream stats are reported as
// context but don't drive ranking, so over-filtering on the lead is OK.
func (srv *Server) filterByModIndex(passing []*nearbyCandidate, statKeys []string) []*nearbyCandidate {
	if srv.modIndex == nil || len(statKeys) == 0 {
		return passing
	}
	leading := statKeys[0]
	out := make([]*nearbyCandidate, 0, len(passing))
	for _, candidate := range passing {
		if srv.modIndex.NodeAffectsMetric(candidate.Stats, candidate.Type, leading) {
			out = append(out, candidate)
		}
	}
	return out
}

// splitNearbyByCacheLocked queries the delta cache for every
// (candidate × statKeys) pair and returns the hits map plus the subset of
// candidates that have at least one cache miss. When the store isn't
// enabled or buildID is empty, the cache is bypassed and all candidates
// fall through to perturb.
func (srv *Server) splitNearbyByCacheLocked(
	buildID string, passing []*nearbyCandidate, statKeys []string,
) (hits map[int]map[string]float64, perturb []*nearbyCandidate) {
	if srv.cache.store == nil || buildID == "" || len(statKeys) == 0 {
		return nil, passing
	}
	lookups := make([]deltaLookup, 0, len(passing)*len(statKeys))
	for _, candidate := range passing {
		for _, metric := range statKeys {
			lookups = append(lookups, deltaLookup{NodeID: candidate.ID, Metric: metric})
		}
	}
	got, _, err := srv.cache.store.GetDeltasBatch(buildID, lookups)
	if err != nil {
		srv.log.Warn("delta cache read failed; bypassing", "err", err)
		return nil, passing
	}

	perturb = make([]*nearbyCandidate, 0, len(passing))
	for _, candidate := range passing {
		full := true
		for _, metric := range statKeys {
			if _, ok := got[candidate.ID][metric]; !ok {
				full = false
				break
			}
		}
		if !full {
			perturb = append(perturb, candidate)
		}
	}
	return got, perturb
}

// mergeDeltaMaps combines cached hits and fresh perturbation deltas. Fresh
// values overwrite cached values when both exist for the same (node, metric).
func mergeDeltaMaps(cached, fresh map[int]map[string]float64) map[int]map[string]float64 {
	if len(cached) == 0 && len(fresh) == 0 {
		return nil
	}
	out := make(map[int]map[string]float64, len(cached)+len(fresh))
	for nodeID, byMetric := range cached {
		out[nodeID] = make(map[string]float64, len(byMetric))
		maps.Copy(out[nodeID], byMetric)
	}
	for nodeID, byMetric := range fresh {
		if out[nodeID] == nil {
			out[nodeID] = make(map[string]float64, len(byMetric))
		}
		maps.Copy(out[nodeID], byMetric)
	}
	return out
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
		filtered, written := srv.applySectionFilter(writer, json.RawMessage(summary), parseSections(request))
		if written {
			return
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

// sectionTaxonomy maps each new flat section name to the list of
// underlying wrapper.lua section keys it aggregates. The Lua side keeps
// emitting the original 15-name structure (offense / ailments / defense /
// resistances / ehp / recovery / charges / limits / minion_offense /
// minion_defense / socket_groups / items / keystones / tree / config);
// the Go remap collapses that into the public-facing 6-name surface.
//
// Stat-dict aggregation (offense, defense): underlying sections are
// merged into a single flat object — keys union, _extra_keys arrays
// concatenated.
//
// Composite aggregation (gear, tree): each underlying section is exposed
// as a sub-key (gear.items, gear.socket_groups, tree.keystones) instead
// of being merged, since their shapes (object vs array) don't compose.
//
// summary lives at the top level (not inside `sections`); it has no
// underlying keys to aggregate.
//
// Pre-launch: any name not in this map is rejected with a clear error
// pointing at the valid set.
var sectionTaxonomy = []sectionDef{
	{
		ID:          "summary",
		Name:        "Summary",
		Description: "Top-line character stats: DPS, Life, ES, Mana, resistances, attributes",
		// summary is at the top level, not aggregated from underlying sections
	},
	{
		ID:          "offense",
		Name:        "Offense",
		Description: "Damage, DPS, ailments, minion offense, charges, limits",
		Aggregate:   []string{"offense", "ailments", "minion_offense", "charges", "limits"},
		Style:       sectionStyleStatDict,
	},
	{
		ID:          "defense",
		Name:        "Defense",
		Description: "Armour, evasion, energy shield, resistances, EHP, recovery, minion defense",
		Aggregate:   []string{"defense", "resistances", "ehp", "recovery", "minion_defense"},
		Style:       sectionStyleStatDict,
	},
	{
		ID:          "gear",
		Name:        "Gear",
		Description: "Equipped items by slot and skill socket groups",
		Aggregate:   []string{"items", "socket_groups"},
		Style:       sectionStyleComposite,
	},
	{
		ID:          "tree",
		Name:        "Tree",
		Description: "Allocated passive points, keystones, tree summary",
		Aggregate:   []string{"tree", "keystones"},
		Style:       sectionStyleComposite,
	},
	{
		ID:          "config",
		Name:        "Configuration",
		Description: "Active configuration overrides (conditions, enemy settings, combat state)",
		Aggregate:   []string{"config"},
		Style:       sectionStyleComposite,
	},
}

type sectionStyle int

const (
	sectionStyleStatDict  sectionStyle = iota // merge stat-dicts; concat _extra_keys
	sectionStyleComposite                     // expose underlying keys as sub-keys
)

type sectionDef struct {
	ID          string
	Name        string
	Description string
	Aggregate   []string
	Style       sectionStyle
}

// validSectionNames is the set of names accepted by parseSections.
func validSectionNames() []string {
	out := make([]string, 0, len(sectionTaxonomy))
	for _, def := range sectionTaxonomy {
		out = append(out, def.ID)
	}
	return out
}

// ErrUnknownSection signals that the caller requested a section name that
// isn't in the public taxonomy. Handlers turn this into a 400 instead of
// the generic 500-with-fallback path that data-parse failures take.
var ErrUnknownSection = errors.New("unknown section name")

// applySectionFilter is the standard "validate → filter → 400-on-bad-name,
// fall-back-on-data-error" wrapper used by every handler that surfaces
// `sections=…` to the public API. Returns the filtered data and a bool
// indicating whether the response was already written (true → caller
// should return immediately).
func (srv *Server) applySectionFilter(
	writer http.ResponseWriter,
	data json.RawMessage,
	sections []string,
) (json.RawMessage, bool) {
	filtered, err := filterSections(data, sections)
	if err == nil {
		return filtered, false
	}
	if errors.Is(err, ErrUnknownSection) {
		jsonError(writer, err.Error(), http.StatusBadRequest)
		return nil, true
	}
	// Data-parse failure: log, fall through to unfiltered output to keep
	// /resolve and /modify usable on a malformed wrapper.lua response.
	srv.log.Warn("section filter failed, returning unfiltered", "err", err)
	return data, false
}

// filterSections rewrites the wrapper.lua-shaped response to expose the
// public 6-name section taxonomy. When sections is nil, the `sections`
// key is dropped (summary-only default). When sections is non-nil, each
// requested name is aggregated from its underlying Lua keys; unknown or
// retired names trigger an error.
//
// section_index is always replaced with the canonical 6-entry list,
// regardless of what wrapper.lua emitted, so callers always see the new
// taxonomy.
func filterSections(data json.RawMessage, sections []string) (json.RawMessage, error) {
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(data, &parsed); err != nil {
		return data, fmt.Errorf("unmarshal data: %w", err)
	}

	// Always overwrite section_index with the canonical 6-name list.
	indexJSON, err := json.Marshal(buildSectionIndex())
	if err != nil {
		return data, fmt.Errorf("marshal section_index: %w", err)
	}
	parsed["section_index"] = indexJSON

	if sections == nil {
		delete(parsed, "sections")
		result, err := json.Marshal(parsed)
		if err != nil {
			return data, fmt.Errorf("marshal response: %w", err)
		}
		return result, nil
	}

	// Validate every requested name. Old/unknown names → all-or-nothing
	// rejection (the request is out of contract).
	if err := validateSectionNames(sections); err != nil {
		return data, err
	}

	rawSections, err := extractRawSections(parsed)
	if err != nil {
		return data, err
	}

	aggregated, err := aggregateSections(rawSections, sections)
	if err != nil {
		return data, err
	}

	aggregatedJSON, err := json.Marshal(aggregated)
	if err != nil {
		return data, fmt.Errorf("marshal aggregated sections: %w", err)
	}
	parsed["sections"] = aggregatedJSON
	result, err := json.Marshal(parsed)
	if err != nil {
		return data, fmt.Errorf("marshal response: %w", err)
	}
	return result, nil
}

func buildSectionIndex() []map[string]string {
	out := make([]map[string]string, 0, len(sectionTaxonomy))
	for _, def := range sectionTaxonomy {
		out = append(out, map[string]string{
			"id":          def.ID,
			"name":        def.Name,
			"description": def.Description,
		})
	}
	return out
}

func validateSectionNames(requested []string) error {
	known := make(map[string]bool, len(sectionTaxonomy))
	for _, def := range sectionTaxonomy {
		known[def.ID] = true
	}
	for _, name := range requested {
		if !known[name] {
			return fmt.Errorf(
				"%w %q — valid: %s",
				ErrUnknownSection,
				name,
				strings.Join(validSectionNames(), ", "),
			)
		}
	}
	return nil
}

func extractRawSections(parsed map[string]json.RawMessage) (map[string]json.RawMessage, error) {
	raw, ok := parsed["sections"]
	if !ok {
		return map[string]json.RawMessage{}, nil
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("unmarshal sections: %w", err)
	}
	return out, nil
}

// aggregateSections produces the requested public-facing sections from
// the wrapper.lua raw map. Returns a sections object keyed by the new
// public names.
func aggregateSections(
	raw map[string]json.RawMessage,
	requested []string,
) (map[string]json.RawMessage, error) {
	defByID := make(map[string]sectionDef, len(sectionTaxonomy))
	for _, def := range sectionTaxonomy {
		defByID[def.ID] = def
	}

	out := make(map[string]json.RawMessage, len(requested))
	for _, name := range requested {
		def := defByID[name]
		// summary has no underlying aggregation; it's served from the
		// top-level summary key, not the sections object. Skip silently
		// when requested — the caller still gets `summary` at the top
		// level (filterSections never strips it).
		if name == "summary" {
			continue
		}
		switch def.Style {
		case sectionStyleStatDict:
			merged, err := mergeStatDicts(raw, def.Aggregate)
			if err != nil {
				return nil, fmt.Errorf("aggregate %q: %w", name, err)
			}
			mergedJSON, err := json.Marshal(merged)
			if err != nil {
				return nil, fmt.Errorf("marshal %q: %w", name, err)
			}
			out[name] = mergedJSON
		case sectionStyleComposite:
			composed := composeSubKeys(name, raw, def.Aggregate)
			composedJSON, err := json.Marshal(composed)
			if err != nil {
				return nil, fmt.Errorf("marshal %q: %w", name, err)
			}
			out[name] = composedJSON
		}
	}
	return out, nil
}

// mergeStatDicts unions multiple stat-dict sections (offense, ailments,
// etc.) into a single flat object. Numeric/scalar keys collide rarely
// (PoB stat keys are unique across these old sections); when they do,
// the last source wins. The _extra_keys arrays from each source are
// concatenated.
func mergeStatDicts(
	raw map[string]json.RawMessage,
	sources []string,
) (map[string]json.RawMessage, error) {
	out := make(map[string]json.RawMessage)
	var extraKeys []string

	for _, source := range sources {
		rawSrc, ok := raw[source]
		if !ok {
			continue
		}
		var srcMap map[string]json.RawMessage
		if err := json.Unmarshal(rawSrc, &srcMap); err != nil {
			return nil, fmt.Errorf("unmarshal %q: %w", source, err)
		}
		// Pull _extra_keys aside; merge other keys verbatim.
		if rawExtras, ok := srcMap["_extra_keys"]; ok {
			var extras []string
			if err := json.Unmarshal(rawExtras, &extras); err == nil {
				extraKeys = append(extraKeys, extras...)
			}
			delete(srcMap, "_extra_keys")
		}
		maps.Copy(out, srcMap)
	}
	if len(extraKeys) > 0 {
		extrasJSON, err := json.Marshal(extraKeys)
		if err != nil {
			return nil, fmt.Errorf("marshal _extra_keys: %w", err)
		}
		out["_extra_keys"] = extrasJSON
	}
	return out, nil
}

// composeSubKeys exposes each underlying source as a sub-key on the new
// section, with one ergonomic hoist: when a source's name matches its
// containing section's name (config inside config, tree inside tree),
// that source's object fields are merged directly onto the section
// instead of nested under the duplicate name. So:
//
//	config (sources: ["config"])      → {conditionLowLife: true, ...}
//	tree   (sources: ["tree", "keystones"]) → {version, allocated_nodes, ..., keystones: [...]}
//	gear   (sources: ["items", "socket_groups"]) → {items: {...}, socket_groups: [...]}
//
// The hoist rule applies to any single-source-name-matches-section case
// without special-casing config or tree by name.
func composeSubKeys(
	sectionName string,
	raw map[string]json.RawMessage,
	sources []string,
) map[string]json.RawMessage {
	out := make(map[string]json.RawMessage)
	for _, source := range sources {
		rawSrc, ok := raw[source]
		if !ok {
			continue
		}
		if source == sectionName {
			// Hoist: dissolve the source object's fields onto the
			// section. If the source value isn't an object, fall through
			// to the default sub-key behavior so we don't lose data.
			var fields map[string]json.RawMessage
			if json.Unmarshal(rawSrc, &fields) == nil {
				maps.Copy(out, fields)
				continue
			}
		}
		out[source] = rawSrc
	}
	return out
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
// the given Lua process on first call. Concurrent-safe via the mutex.
// Retries on every call until one succeeds, so a transient Lua
// failure doesn't permanently disable fuzzy enrichment — once
// populated, the list is served from cache for the rest of the
// process lifetime.
func (srv *Server) getGemNames(proc *Process) []string {
	srv.gemNamesMu.Lock()
	defer srv.gemNamesMu.Unlock()
	if srv.gemNamesLoaded {
		return srv.gemNames
	}
	resp, err := proc.Send(listGemsLuaRequest{Type: "list_gems"})
	if err != nil {
		srv.log.Warn("list_gems fetch failed (will retry on next miss)", "err", err)
		return nil
	}
	var parsed listGemsLuaResponse
	if err := json.Unmarshal(resp, &parsed); err != nil {
		srv.log.Warn("list_gems response parse failed", "err", err)
		return nil
	}
	if parsed.Type != "result" {
		srv.log.Warn("list_gems returned non-result", "type", parsed.Type)
		return nil
	}
	srv.gemNames = parsed.Data.Gems
	srv.gemNamesLoaded = true
	return srv.gemNames
}

func jsonError(writer http.ResponseWriter, msg string, code int) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(code)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": msg})
}
