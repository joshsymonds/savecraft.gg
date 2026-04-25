package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// CompareRequest is the JSON body for POST /compare.
type CompareRequest struct {
	Builds []string `json:"builds"`
	Labels []string `json:"labels,omitempty"`
}

// CompareResponse is the per-build keyed payload returned from /compare.
// Each entry mirrors the same shape regardless of arity (N=2 vs N=3 vs
// N>3) so consumers don't branch on count — they iterate.
type CompareResponse struct {
	Builds []compareBuildEntry `json:"builds"`
}

// compareBuildEntry is one slot in the perBuild array. On success it
// carries id + label + character + summary. On per-build failure it
// carries label + error and leaves the other fields nil; the response is
// still 200 if at least one build succeeded.
type compareBuildEntry struct {
	ID        string         `json:"id,omitempty"`
	Label     string         `json:"label"`
	Character map[string]any `json:"character,omitempty"`
	Summary   map[string]any `json:"summary,omitempty"`
	Error     string         `json:"error,omitempty"`
}

// buildIDPattern matches the 32-char lowercase hex shape that
// cache.Put produces. Used to distinguish buildIds from URLs in the
// /compare input array without parsing the URL form.
var buildIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

func (srv *Server) handleCompare(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}
	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodySize)

	var req CompareRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		jsonError(writer, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if len(req.Builds) == 0 {
		jsonError(writer, "builds array is required", http.StatusBadRequest)
		return
	}
	if len(req.Builds) < 2 {
		jsonError(writer, "compare needs at least 2 builds", http.StatusBadRequest)
		return
	}

	resp := CompareResponse{Builds: make([]compareBuildEntry, len(req.Builds))}
	successes := 0
	for i, input := range req.Builds {
		entry := srv.compareOneBuild(input, labelFor(req.Labels, i, input))
		resp.Builds[i] = entry
		if entry.Error == "" {
			successes++
		}
	}

	// Total failure → 502 (we proxied to the build pipeline and got
	// nothing). Partial success → 200 with per-slot errors. This
	// distinction lets clients show "all builds failed" vs "this
	// specific build failed; here are the others."
	status := http.StatusOK
	if successes == 0 {
		status = http.StatusBadGateway
	}
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(resp)
}

// compareOneBuild resolves a single builds[i] entry — either an existing
// buildId or a URL — to a calc'd summary. On any failure it returns an
// entry with Error set and the other fields zero-valued.
func (srv *Server) compareOneBuild(input, label string) compareBuildEntry {
	xml, buildID, err := srv.fetchCompareInputXML(input)
	if err != nil {
		return compareBuildEntry{Label: label, Error: err.Error()}
	}

	// If the build is already cached AND has a stored summary, skip the
	// calc round-trip. (Today /resolve persists data into store after
	// calc, so a cached build_id usually has summary; URLs don't.)
	if cachedData, ok := srv.tryCachedSummary(buildID); ok {
		entry := compareBuildEntry{ID: buildID, Label: label}
		hydrateEntryFromData(&entry, cachedData)
		return entry
	}

	// Cold path: acquire process, calc, persist.
	proc, err := srv.pool.AcquireForBuild(buildID)
	if err != nil {
		return compareBuildEntry{Label: label, Error: "failed to acquire PoB process: " + err.Error()}
	}
	defer srv.pool.Release(proc)

	resp, err := proc.Send(calcLuaRequest{
		Type:          "calc",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
	})
	if err != nil {
		return compareBuildEntry{Label: label, Error: "PoB calc transport error"}
	}

	var pobResp struct {
		Type    string          `json:"type"`
		Message string          `json:"message,omitempty"`
		Data    json.RawMessage `json:"data,omitempty"`
	}
	if err := json.Unmarshal(resp, &pobResp); err != nil {
		return compareBuildEntry{Label: label, Error: "invalid PoB response"}
	}
	if pobResp.Type == pobRespTypeError {
		return compareBuildEntry{Label: label, Error: "PoB calc failed: " + pobResp.Message}
	}

	// Persist + pin so subsequent /compare or /modify on this build
	// stays warm. buildID may be empty if input was a URL → resolve a
	// fresh content hash.
	if buildID == "" {
		buildID = srv.cache.Put(xml)
	}
	if srv.cache.store != nil {
		_ = srv.cache.store.Put(buildID, xml, string(pobResp.Data), "", "")
	}
	srv.pool.Pin(proc, buildID)
	proc.SetLastLoadedBuildID(buildID)

	entry := compareBuildEntry{ID: buildID, Label: label}
	hydrateEntryFromData(&entry, pobResp.Data)
	return entry
}

// fetchCompareInputXML returns the XML and (if known) the buildId for an
// input that's either a URL or a buildId. Cache lookup for buildIds;
// resolveBuildURL for URLs.
func (srv *Server) fetchCompareInputXML(input string) (xml string, buildID string, err error) {
	if buildIDPattern.MatchString(input) {
		got, err := srv.cache.Get(input)
		if err != nil {
			if errors.Is(err, ErrBuildNotFound) {
				return "", "", errors.New("build not found")
			}
			return "", "", errors.New("cache lookup failed")
		}
		return got, input, nil
	}

	// URL path. Validate so we don't pass garbage to resolveBuildURL.
	if _, parseErr := url.ParseRequestURI(input); parseErr != nil {
		return "", "", errors.New("input is neither a buildId nor a URL")
	}
	result, err := resolveBuildURL(input, srv.cache.store, srv.httpClient())
	if err != nil {
		// Don't leak internal errors; surface user-friendly messages.
		msg := err.Error()
		if strings.Contains(msg, "build not found at") ||
			strings.Contains(msg, "unsupported host") ||
			strings.Contains(msg, "invalid URL") {
			return "", "", errors.New(msg)
		}
		return "", "", errors.New("URL resolution failed")
	}
	return result.xml, result.buildID, nil
}

// tryCachedSummary returns the persisted summary JSON for a buildId if
// available. Used for /compare's fast path — already-resolved builds
// skip the calc round-trip.
func (srv *Server) tryCachedSummary(buildID string) (json.RawMessage, bool) {
	if buildID == "" || srv.cache.store == nil {
		return nil, false
	}
	_, summary, err := srv.cache.store.Get(buildID)
	if err != nil || summary == "" {
		return nil, false
	}
	return json.RawMessage(summary), true
}

// hydrateEntryFromData unpacks the wrapper.lua-shaped data into the
// per-build entry's character and summary fields. Top-level fields
// only — the diff dimensions (sections, etc.) come from later tasks.
func hydrateEntryFromData(entry *compareBuildEntry, data json.RawMessage) {
	var parsed struct {
		Character map[string]any `json:"character"`
		Summary   map[string]any `json:"summary"`
	}
	if json.Unmarshal(data, &parsed) != nil {
		return
	}
	entry.Character = parsed.Character
	entry.Summary = parsed.Summary
}

// labelFor returns labels[i] when present, else an auto-generated label
// from the input. Auto-generation: first 8 chars for buildIds; URL host
// for URLs; full input as fallback.
func labelFor(labels []string, i int, input string) string {
	if i < len(labels) && labels[i] != "" {
		return labels[i]
	}
	if buildIDPattern.MatchString(input) {
		return input[:8]
	}
	if u, err := url.Parse(input); err == nil && u.Host != "" {
		return u.Host
	}
	return input
}
