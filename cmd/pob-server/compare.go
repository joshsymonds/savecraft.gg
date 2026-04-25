package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"sort"
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
//
// Diffs is computed across the SUCCESSFUL builds only (errored slots
// excluded). It's omitted entirely when fewer than 2 builds succeeded —
// no meaningful "leader" or "range" exists for a single data point.
type CompareResponse struct {
	Builds []compareBuildEntry `json:"builds"`
	Diffs  *compareDiffs       `json:"diffs,omitempty"`
}

// compareDiffs groups all diff dimensions (summary + tree today; gear,
// skills, buy-similar in follow-up tasks). The shape is "diff-typed,
// per-key" so consumers iterate uniformly: every dimension's entries
// carry perBuild arrays or set-op results, never a 2-build-only field.
type compareDiffs struct {
	Summary map[string]compareStatDiff `json:"summary,omitempty"`
	Tree    *compareTreeDiff           `json:"tree,omitempty"`
}

// compareTreeDiff carries the set-op result of the regular-tree
// allocated-node lists across the SUCCESSFUL builds.
//
// AllocatedOnlyIn is keyed by buildId; the value is the list of nodes
// allocated in EXACTLY that build and no other (set difference: A \
// (union of all others)). A node allocated in two of three builds
// appears in NEITHER allocatedOnlyIn entry — it's not unique to either,
// but also not common to all.
//
// Common is the intersection: nodes allocated in EVERY successful
// build. Sorted ascending.
//
// The diff is omitted (nil) when any successful build's response
// lacked allocated_node_ids — partial data would produce misleading set
// ops. (e.g. "build B has no node 5" looks the same as "build B's data
// is missing".)
type compareTreeDiff struct {
	AllocatedOnlyIn map[string][]int `json:"allocatedOnlyIn"`
	Common          []int            `json:"common"`
}

// compareStatDiff is one row of the summary-stat diff table. perBuild is
// indexed parallel to the SUCCESSFUL subset of CompareResponse.Builds —
// when a build slot has an error, it contributes nothing here.
//
// Leader is the index (within perBuild) of the build with the highest
// value. Ties resolve to the lowest index. When all values are zero, the
// row is still emitted (range=0, leader=0) so consumers don't see
// surprising omissions for boring stats.
//
// Range is `(max - min) / max` when max > 0, else 0. Expressed as a
// fraction (0..1) so consumers can render percentages without unit
// confusion.
type compareStatDiff struct {
	PerBuild []float64 `json:"perBuild"`
	Leader   int       `json:"leader"`
	Range    float64   `json:"range"`
}

// compareBuildEntry is one slot in the perBuild array. On success it
// carries id + label + character + summary. On per-build failure it
// carries label + error and leaves the other fields nil; the response is
// still 200 if at least one build succeeded.
//
// allocatedNodes is hidden from the wire (lowercase, no JSON tag) and
// holds the regular-tree allocated node ID list extracted from
// data.sections.tree.allocated_node_ids. Used only for diff computation;
// consumers see the per-build node list under diffs.tree, not on each
// build entry directly.
type compareBuildEntry struct {
	ID        string         `json:"id,omitempty"`
	Label     string         `json:"label"`
	Character map[string]any `json:"character,omitempty"`
	Summary   map[string]any `json:"summary,omitempty"`
	Error     string         `json:"error,omitempty"`

	allocatedNodes []int
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

	// Diffs only meaningful with ≥2 successful slots. Computed across
	// the successful subset; errored slots don't contribute.
	if successes >= 2 {
		resp.Diffs = computeCompareDiffs(resp.Builds)
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
// per-build entry's public + diff-input fields. character + summary go
// on the wire; allocatedNodes feeds the tree diff but is not exposed
// per-build (consumers see set-op results under diffs.tree instead).
func hydrateEntryFromData(entry *compareBuildEntry, data json.RawMessage) {
	var parsed struct {
		Character map[string]any `json:"character"`
		Summary   map[string]any `json:"summary"`
		Sections  struct {
			Tree struct {
				AllocatedNodeIDs []int `json:"allocated_node_ids"`
			} `json:"tree"`
		} `json:"sections"`
	}
	if json.Unmarshal(data, &parsed) != nil {
		return
	}
	entry.Character = parsed.Character
	entry.Summary = parsed.Summary
	entry.allocatedNodes = parsed.Sections.Tree.AllocatedNodeIDs
}

// computeCompareDiffs walks the SUCCESSFUL build entries and assembles
// the diff dimensions from their per-build payload. Today only the
// summary dimension is populated; tree, gear, skills, and buy-similar
// follow as separate tasks.
//
// Stat-level rule: a stat appears in the diff only when EVERY successful
// build has a numeric value for it. Mixed-presence stats are dropped to
// avoid misleading "leader" calls based on partial data.
func computeCompareDiffs(entries []compareBuildEntry) *compareDiffs {
	successful := make([]compareBuildEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Error == "" {
			successful = append(successful, entry)
		}
	}
	if len(successful) < 2 {
		return nil
	}

	summary := computeSummaryDiff(successful)
	tree := computeTreeDiff(successful)
	if len(summary) == 0 && tree == nil {
		return nil
	}
	return &compareDiffs{Summary: summary, Tree: tree}
}

// computeTreeDiff produces the per-build allocated-node set ops. Returns
// nil when ANY successful build's allocatedNodes is nil — partial data
// would make "common" misleading (a node missing from one build looks
// the same as that build's data not arriving). All-or-nothing keeps the
// semantics honest.
func computeTreeDiff(successful []compareBuildEntry) *compareTreeDiff {
	if len(successful) < 2 {
		return nil
	}
	for _, entry := range successful {
		if entry.allocatedNodes == nil {
			return nil
		}
	}

	// Build a set per build for fast membership tests.
	sets := make([]map[int]bool, len(successful))
	for i, entry := range successful {
		set := make(map[int]bool, len(entry.allocatedNodes))
		for _, id := range entry.allocatedNodes {
			set[id] = true
		}
		sets[i] = set
	}

	// common = intersection across all builds. Iterate the first build's
	// set and keep nodes present in every other.
	var common []int
	for id := range sets[0] {
		present := true
		for j := 1; j < len(sets); j++ {
			if !sets[j][id] {
				present = false
				break
			}
		}
		if present {
			common = append(common, id)
		}
	}
	sort.Ints(common)

	// allocatedOnlyIn[buildID] = nodes in this build but NO others.
	allocatedOnlyIn := make(map[string][]int, len(successful))
	for i, entry := range successful {
		var only []int
		for _, id := range entry.allocatedNodes {
			unique := true
			for j, otherSet := range sets {
				if i == j {
					continue
				}
				if otherSet[id] {
					unique = false
					break
				}
			}
			if unique {
				only = append(only, id)
			}
		}
		sort.Ints(only)
		// Initialize to empty slice (not nil) so the JSON wire shape is
		// `[]` instead of `null` for build with no unique nodes — easier
		// for consumers to iterate.
		if only == nil {
			only = []int{}
		}
		allocatedOnlyIn[entry.ID] = only
	}

	if common == nil {
		common = []int{}
	}
	return &compareTreeDiff{AllocatedOnlyIn: allocatedOnlyIn, Common: common}
}

// computeSummaryDiff builds the per-stat diff table. Iterates the first
// build's summary keys and includes a stat only when all subsequent
// builds also have a numeric value for it.
func computeSummaryDiff(successful []compareBuildEntry) map[string]compareStatDiff {
	out := make(map[string]compareStatDiff)
	if len(successful) == 0 {
		return out
	}
	for key := range successful[0].Summary {
		perBuild, ok := collectStatValues(successful, key)
		if !ok {
			continue
		}
		out[key] = statDiff(perBuild)
	}
	return out
}

// collectStatValues returns the per-build numeric value for `key`. When
// any build is missing the key or has a non-numeric value, returns
// ok=false — that stat is excluded from the diff.
func collectStatValues(successful []compareBuildEntry, key string) ([]float64, bool) {
	out := make([]float64, len(successful))
	for i, entry := range successful {
		raw, ok := entry.Summary[key]
		if !ok {
			return nil, false
		}
		// Summary values arrive as decoded JSON — usually float64 for
		// numbers; we accept that and skip booleans / strings / nested.
		v, ok := raw.(float64)
		if !ok {
			return nil, false
		}
		out[i] = v
	}
	return out, true
}

// statDiff computes Leader and Range for a per-build value slice. Tied
// max → lowest index wins. All-zero → range=0, leader=0.
func statDiff(perBuild []float64) compareStatDiff {
	maxVal := perBuild[0]
	minVal := perBuild[0]
	leader := 0
	for i := 1; i < len(perBuild); i++ {
		if perBuild[i] > maxVal {
			maxVal = perBuild[i]
			leader = i
		}
		if perBuild[i] < minVal {
			minVal = perBuild[i]
		}
	}
	rng := 0.0
	if maxVal > 0 {
		rng = (maxVal - minVal) / maxVal
	}
	return compareStatDiff{PerBuild: perBuild, Leader: leader, Range: rng}
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
