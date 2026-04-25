package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// CompareRequest is the JSON body for POST /compare.
//
// BuySimilar opts the response into a `buySimilar` array of trade-URL
// recommendations covering gear slots where one build has an item the
// other lacks (or has a different one). League selects the trade
// realm; defaults to "Standard" when omitted.
type CompareRequest struct {
	Builds     []string `json:"builds"`
	Labels     []string `json:"labels,omitempty"`
	BuySimilar bool     `json:"buySimilar,omitempty"`
	League     string   `json:"league,omitempty"`
}

// CompareResponse is the per-build keyed payload returned from /compare.
// Each entry mirrors the same shape regardless of arity (N=2 vs N=3 vs
// N>3) so consumers don't branch on count — they iterate.
//
// Diffs is computed across the SUCCESSFUL builds only (errored slots
// excluded). It's omitted entirely when fewer than 2 builds succeeded —
// no meaningful "leader" or "range" exists for a single data point.
type CompareResponse struct {
	Builds     []compareBuildEntry      `json:"builds"`
	Diffs      *compareDiffs            `json:"diffs,omitempty"`
	BuySimilar []compareBuySimilarEntry `json:"buySimilar,omitempty"`
}

// compareBuySimilarEntry is one trade-URL recommendation. fromBuildId
// has the item; toBuildId either lacks it or has a different one in
// the same slot. The tradeUrl is a direct pathofexile.com/trade search
// pre-filled with the source's item name.
//
// Only emitted when CompareRequest.BuySimilar is true. Multi-build
// fanout: every (from, to) pair where source has a slot item and
// target's slot item differs gets its own entry — at N=3 with three
// distinct Helmets, that's 6 entries (each pair both directions); at
// N=3 where two share an item and one differs, that's 4 entries.
type compareBuySimilarEntry struct {
	FromBuildID string `json:"fromBuildId"`
	ToBuildID   string `json:"toBuildId"`
	Slot        string `json:"slot"`
	ItemName    string `json:"itemName"`
	TradeURL    string `json:"tradeUrl"`
}

// compareDiffs groups all diff dimensions (summary + tree + gear +
// skills today; buy-similar in a follow-up task). The shape is
// "diff-typed, per-key" so consumers iterate uniformly: every
// dimension's entries carry perBuild arrays or set-op results, never a
// 2-build-only field.
type compareDiffs struct {
	Summary map[string]compareStatDiff `json:"summary,omitempty"`
	Tree    *compareTreeDiff           `json:"tree,omitempty"`
	Gear    map[string]compareSlotDiff `json:"gear,omitempty"`
	Skills  []compareSocketGroupDiff   `json:"skills,omitempty"`
}

// compareSocketGroupDiff is one entry in the skills diff. Groups are
// matched across builds by label (case-sensitive); each match shows the
// gem-name list per build, with `same` true iff every entry has gems
// AND every entry's gem set is identical.
//
// PerBuild entries are []string — empty when a build doesn't have this
// labeled group. JSON encodes empty as `[]`, not `null`, so view code
// can iterate uniformly.
type compareSocketGroupDiff struct {
	Label    string     `json:"label"`
	PerBuild [][]string `json:"perBuild"`
	Same     bool       `json:"same"`
}

// compareSlotDiff is one entry in the gear diff — one equipment slot's
// view across the SUCCESSFUL builds.
//
// PerBuild values are pointers so JSON null marshaling distinguishes
// "build has nothing equipped in this slot" (nil pointer) from "build
// equipped Atziri's Foible." Same is true iff every entry is non-nil
// AND every name matches.
type compareSlotDiff struct {
	PerBuild []*string `json:"perBuild"`
	Same     bool      `json:"same"`
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
// allocatedNodes, itemsBySlot, and socketGroups are hidden from the wire
// (lowercase, no JSON tag) and feed diff computation. Consumers see
// set-op / per-slot / per-group results under diffs.tree, diffs.gear,
// and diffs.skills instead of raw per-build payloads.
type compareBuildEntry struct {
	ID        string         `json:"id,omitempty"`
	Label     string         `json:"label"`
	Character map[string]any `json:"character,omitempty"`
	Summary   map[string]any `json:"summary,omitempty"`
	Error     string         `json:"error,omitempty"`

	allocatedNodes []int
	itemsBySlot    map[string]string
	socketGroups   []socketGroupSummary
}

// socketGroupSummary is the minimal per-group shape used for the skills
// diff. Gems are stored sorted ascending by name so set comparison is
// just slice equality — gem ORDER inside a group doesn't change the
// gameplay (a Cyclone+Brutality+Pulverise setup behaves the same as
// Pulverise+Brutality+Cyclone).
type socketGroupSummary struct {
	Label string
	Gems  []string
}

// buildIDPattern matches the 32-char lowercase hex shape that
// cache.Put produces. Used to distinguish buildIds from URLs in the
// /compare input array without parsing the URL form.
var buildIDPattern = regexp.MustCompile(`^[a-f0-9]{32}$`)

// maxCompareBuilds caps the array size to keep one /compare request from
// monopolising the pool past the MCP-side timeout. Matches the production
// pool size — even a max-size request can run all builds in parallel
// after perf-2's parallelization, so wall time is bounded at ~1× per-build.
const maxCompareBuilds = 8

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
	if len(req.Builds) > maxCompareBuilds {
		jsonError(writer, "compare accepts at most 8 builds per request", http.StatusBadRequest)
		return
	}

	// Run per-build calc in parallel. Pool affinity still works under
	// fan-out — each worker pins its own build_id. Cap concurrency at
	// `pool.maxSize - 1` (with a floor of 1) so /compare never claims
	// the entire pool and starves /resolve / /modify / /audit / /nearby
	// with ErrPoolExhausted during a max-size compare. Per-build errors
	// live on entry.Error; the goroutines themselves never return one.
	resp := CompareResponse{Builds: make([]compareBuildEntry, len(req.Builds))}
	compareSlots := max(1, srv.pool.maxSize-1)
	concurrency := min(len(req.Builds), compareSlots)
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	for i, input := range req.Builds {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			resp.Builds[i] = srv.compareOneBuild(input, labelFor(req.Labels, i, input))
		}()
	}
	wg.Wait()

	successes := 0
	for _, entry := range resp.Builds {
		if entry.Error == "" {
			successes++
		}
	}

	// Diffs only meaningful with ≥2 successful slots. Computed across
	// the successful subset; errored slots don't contribute.
	if successes >= 2 {
		resp.Diffs = computeCompareDiffs(resp.Builds)
		if req.BuySimilar {
			resp.BuySimilar = computeBuySimilar(resp.Builds, req.League)
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
// per-build entry's public + diff-input fields. character + summary go
// on the wire; allocatedNodes feeds the tree diff and itemsBySlot feeds
// the gear diff — neither is exposed per-build, consumers see results
// under diffs.tree and diffs.gear instead.
func hydrateEntryFromData(entry *compareBuildEntry, data json.RawMessage) {
	var parsed struct {
		Character map[string]any `json:"character"`
		Summary   map[string]any `json:"summary"`
		Sections  struct {
			Tree struct {
				AllocatedNodeIDs []int `json:"allocatedNodeIds"`
			} `json:"tree"`
			// Items is slot → object; we only need the name for the v1
			// diff (matches the shape from wrapper.lua serializeItems).
			Items map[string]struct {
				Name string `json:"name"`
			} `json:"items"`
			// SocketGroups is an ordered array of skill setups (label +
			// gem list). v1 diff matches by label, ignores gem order.
			SocketGroups []struct {
				Label string `json:"label"`
				Gems  []struct {
					Name string `json:"name"`
				} `json:"gems"`
			} `json:"socketGroups"`
		} `json:"sections"`
	}
	if json.Unmarshal(data, &parsed) != nil {
		return
	}
	entry.Character = parsed.Character
	entry.Summary = parsed.Summary
	entry.allocatedNodes = parsed.Sections.Tree.AllocatedNodeIDs

	if len(parsed.Sections.Items) > 0 {
		entry.itemsBySlot = make(map[string]string, len(parsed.Sections.Items))
		for slot, item := range parsed.Sections.Items {
			if item.Name != "" {
				entry.itemsBySlot[slot] = item.Name
			}
		}
	}

	if len(parsed.Sections.SocketGroups) > 0 {
		entry.socketGroups = make([]socketGroupSummary, 0, len(parsed.Sections.SocketGroups))
		for _, group := range parsed.Sections.SocketGroups {
			gemNames := make([]string, 0, len(group.Gems))
			for _, gem := range group.Gems {
				if gem.Name != "" {
					gemNames = append(gemNames, gem.Name)
				}
			}
			sort.Strings(gemNames)
			entry.socketGroups = append(entry.socketGroups, socketGroupSummary{
				Label: group.Label,
				Gems:  gemNames,
			})
		}
	}
}

// computeCompareDiffs walks the SUCCESSFUL build entries and assembles
// all four diff dimensions (summary, tree, gear, skills) from their
// per-build payload. Buy-similar is computed separately by the caller
// when CompareRequest.BuySimilar is true.
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
	gear := computeGearDiff(successful)
	skills := computeSkillsDiff(successful)
	if len(summary) == 0 && tree == nil && len(gear) == 0 && len(skills) == 0 {
		return nil
	}
	return &compareDiffs{Summary: summary, Tree: tree, Gear: gear, Skills: skills}
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
	sets := buildAllocatedNodeSets(successful)
	common := commonAllocatedNodes(sets)
	allocatedOnlyIn := uniqueAllocatedNodesPerBuild(successful, sets)
	return &compareTreeDiff{AllocatedOnlyIn: allocatedOnlyIn, Common: common}
}

// buildAllocatedNodeSets returns one node-id set per successful build
// for fast intersection / unique-membership checks.
func buildAllocatedNodeSets(successful []compareBuildEntry) []map[int]bool {
	sets := make([]map[int]bool, len(successful))
	for i, entry := range successful {
		set := make(map[int]bool, len(entry.allocatedNodes))
		for _, id := range entry.allocatedNodes {
			set[id] = true
		}
		sets[i] = set
	}
	return sets
}

// commonAllocatedNodes returns the sorted intersection of every
// per-build allocated set. Empty slice (not nil) when no node appears in
// every build, so the JSON wire shape stays `[]`.
func commonAllocatedNodes(sets []map[int]bool) []int {
	if len(sets) == 0 {
		return []int{}
	}
	var common []int
	for id := range sets[0] {
		if presentInAll(id, sets[1:]) {
			common = append(common, id)
		}
	}
	sort.Ints(common)
	if common == nil {
		common = []int{}
	}
	return common
}

// presentInAll reports whether id is in every set. Used by
// commonAllocatedNodes to test the rest of the build slice against the
// first build's set.
func presentInAll(id int, rest []map[int]bool) bool {
	for _, set := range rest {
		if !set[id] {
			return false
		}
	}
	return true
}

// uniqueAllocatedNodesPerBuild returns sorted "only-in-this-build" node
// lists keyed by build ID. Each list is `[]` (not nil) when a build has
// no unique nodes — easier wire shape for consumers.
func uniqueAllocatedNodesPerBuild(
	successful []compareBuildEntry,
	sets []map[int]bool,
) map[string][]int {
	out := make(map[string][]int, len(successful))
	for i, entry := range successful {
		var only []int
		for _, id := range entry.allocatedNodes {
			if uniqueToBuild(id, i, sets) {
				only = append(only, id)
			}
		}
		sort.Ints(only)
		if only == nil {
			only = []int{}
		}
		out[entry.ID] = only
	}
	return out
}

// uniqueToBuild reports whether id is in build idx's set but no other.
func uniqueToBuild(id, idx int, sets []map[int]bool) bool {
	for j, otherSet := range sets {
		if j == idx {
			continue
		}
		if otherSet[id] {
			return false
		}
	}
	return true
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

// computeGearDiff produces the per-slot equipment diff. Iterates the
// union of slot names across every successful build, then for each slot
// builds a perBuild array (item name pointer or nil-when-empty) and a
// `same` flag that's true iff every entry is non-nil and every name
// matches.
//
// Returns nil when fewer than 2 successful builds exist or none of them
// have any items (unusual but defensive — empty diff is misleading).
func computeGearDiff(successful []compareBuildEntry) map[string]compareSlotDiff {
	if len(successful) < 2 {
		return nil
	}

	slotSet := make(map[string]bool)
	for _, entry := range successful {
		for slot := range entry.itemsBySlot {
			slotSet[slot] = true
		}
	}
	if len(slotSet) == 0 {
		return nil
	}

	out := make(map[string]compareSlotDiff, len(slotSet))
	for slot := range slotSet {
		perBuild := make([]*string, len(successful))
		first := ""
		firstSet := false
		same := true
		for i, entry := range successful {
			name, ok := entry.itemsBySlot[slot]
			if !ok || name == "" {
				perBuild[i] = nil
				same = false // any null breaks identity
				continue
			}
			nameCopy := name
			perBuild[i] = &nameCopy
			if !firstSet {
				first = name
				firstSet = true
			} else if name != first {
				same = false
			}
		}
		out[slot] = compareSlotDiff{PerBuild: perBuild, Same: same}
	}
	return out
}

// computeSkillsDiff produces the per-socket-group diff. Groups are
// matched across builds by their `Label` (case-sensitive). For each
// matched label, perBuild carries one gem-name list per successful
// build (empty when that build doesn't have a group with this label).
//
// `same` is true iff every perBuild entry is non-empty AND every gem
// set is identical (Gems are pre-sorted in hydrateEntryFromData so
// equality is just slice comparison).
//
// Returns nil for <2 successful builds or when no successful build has
// any groups.
//
// Multi-group label collision within a single build (PoB allows it)
// collapses to one entry per build slot — the LAST occurrence wins.
// In practice users rename collision-prone labels; if this turns into
// a real concern, a v2 enhancement can disambiguate via socket group
// index alongside label.
func computeSkillsDiff(successful []compareBuildEntry) []compareSocketGroupDiff {
	if len(successful) < 2 {
		return nil
	}
	perBuildByLabel, labelOrder := indexSocketGroupsByLabel(successful)
	if len(labelOrder) == 0 {
		return nil
	}
	out := make([]compareSocketGroupDiff, 0, len(labelOrder))
	for _, label := range labelOrder {
		out = append(out, buildSocketGroupDiff(label, perBuildByLabel))
	}
	return out
}

// indexSocketGroupsByLabel builds a per-build map (label → sorted gem
// list) and a sorted union of all labels. Within-build label collisions
// collapse to "last occurrence wins" — see computeSkillsDiff doc.
func indexSocketGroupsByLabel(
	successful []compareBuildEntry,
) ([]map[string][]string, []string) {
	perBuildByLabel := make([]map[string][]string, len(successful))
	labelOrder := make([]string, 0)
	labelSet := make(map[string]bool)
	for i, entry := range successful {
		perBuildByLabel[i] = make(map[string][]string, len(entry.socketGroups))
		for _, group := range entry.socketGroups {
			perBuildByLabel[i][group.Label] = group.Gems
			if !labelSet[group.Label] {
				labelSet[group.Label] = true
				labelOrder = append(labelOrder, group.Label)
			}
		}
	}
	sort.Strings(labelOrder)
	return perBuildByLabel, labelOrder
}

// buildSocketGroupDiff assembles one compareSocketGroupDiff for the
// given label across all successful builds. `same` is true iff every
// build has a non-empty gem list AND every list matches.
func buildSocketGroupDiff(
	label string,
	perBuildByLabel []map[string][]string,
) compareSocketGroupDiff {
	perBuild := make([][]string, len(perBuildByLabel))
	var first []string
	firstSet := false
	same := true
	for i, byLabel := range perBuildByLabel {
		gems := byLabel[label]
		if gems == nil {
			gems = []string{}
		}
		perBuild[i] = gems
		if len(gems) == 0 {
			same = false
			continue
		}
		if !firstSet {
			first = gems
			firstSet = true
		} else if !equalStringSlices(first, gems) {
			same = false
		}
	}
	return compareSocketGroupDiff{Label: label, PerBuild: perBuild, Same: same}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// defaultBuySimilarLeague is the trade realm used when the request
// omits the `league` field. Standard is always-on; league names like
// "Mirage" or "Mirage Hardcore" rotate every 3-4 months and would 404
// when the league ends.
const defaultBuySimilarLeague = "Standard"

// successfulBuildEntries returns only the entries with no .Error set —
// errored entries can't be source or target in a buy-similar pair.
func successfulBuildEntries(entries []compareBuildEntry) []compareBuildEntry {
	out := make([]compareBuildEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Error == "" {
			out = append(out, entry)
		}
	}
	return out
}

// allSlotsSorted returns the deduped + sorted union of every slot key
// observed across the input entries' itemsBySlot maps.
func allSlotsSorted(successful []compareBuildEntry) []string {
	slotSet := make(map[string]bool)
	for _, entry := range successful {
		for slot := range entry.itemsBySlot {
			slotSet[slot] = true
		}
	}
	slots := make([]string, 0, len(slotSet))
	for slot := range slotSet {
		slots = append(slots, slot)
	}
	sort.Strings(slots)
	return slots
}

// isValidLeague rejects league strings that look like attempts to break
// out of the URL path component or stretch the wire payload. Real PoE
// league names are short alphanumerics with spaces (e.g. "Standard",
// "Mirage Hardcore"). Anything containing path separators or query
// delimiters falls back to defaultBuySimilarLeague upstream.
func isValidLeague(league string) bool {
	if league == "" || len(league) > 64 {
		return false
	}
	if strings.ContainsAny(league, "/?#") {
		return false
	}
	return true
}

// computeBuySimilar produces trade-URL recommendations for gear slots
// where one successful build has an item another lacks (or has a
// different one). Errored slots are excluded — they appear in the
// builds[] response but contribute nothing here.
//
// Pair semantics: every (from, to) ordered pair where
// from.itemsBySlot[slot] is non-empty AND to.itemsBySlot[slot] differs
// produces an entry. With N builds and a slot where every item is
// distinct, that yields N*(N-1) entries for that slot — each build can
// be the source and each other build can be the target.
func computeBuySimilar(entries []compareBuildEntry, league string) []compareBuySimilarEntry {
	if league == "" || !isValidLeague(league) {
		league = defaultBuySimilarLeague
	}
	successful := successfulBuildEntries(entries)
	if len(successful) < 2 {
		return nil
	}
	slots := allSlotsSorted(successful)
	if len(slots) == 0 {
		return nil
	}

	var out []compareBuySimilarEntry
	for _, slot := range slots {
		out = append(out, buySimilarPairsForSlot(slot, successful, league)...)
	}
	return out
}

// buySimilarPairsForSlot generates one entry per ordered (from, to) pair
// where `from` has an item in `slot` and `to` either has a different item
// or none. With N successful builds and a slot where every item is
// distinct, that yields N*(N-1) entries.
func buySimilarPairsForSlot(
	slot string,
	successful []compareBuildEntry,
	league string,
) []compareBuySimilarEntry {
	var out []compareBuySimilarEntry
	for i, from := range successful {
		fromName := from.itemsBySlot[slot]
		if fromName == "" {
			continue
		}
		for j, to := range successful {
			if i == j || to.itemsBySlot[slot] == fromName {
				continue
			}
			out = append(out, compareBuySimilarEntry{
				FromBuildID: from.ID,
				ToBuildID:   to.ID,
				Slot:        slot,
				ItemName:    fromName,
				TradeURL:    buildTradeURL(fromName, league),
			})
		}
	}
	return out
}

// buildTradeURL constructs a pathofexile.com/trade search URL for the
// given item name in the specified league. The wire format mirrors
// PoB's CompareBuySimilar.lua: the trade query JSON is URL-percent-
// encoded into the `q` parameter (NOT base64). This format has been
// validated end-to-end by POSTing the same payload to PoE's
// /api/trade/search/<league> endpoint — it returns 200 with a search
// ID and result hashes, confirming the wire shape is correct.
//
// v1 query is name + empty stats filter group + sort:price asc. Mod-
// level filters and item-type constraints are deferred to a v2
// enhancement.
//
// See buildTradeQueryPayload for the marshaled JSON; tests against the
// live API live in compare_buy_similar_smoke_test.go (build-tagged).
func buildTradeURL(itemName, league string) string {
	payload := buildTradeQueryPayload(itemName)
	tradeURL := url.URL{
		Scheme: "https",
		Host:   "www.pathofexile.com",
		Path:   "/trade/search/" + league,
	}
	// Use url.Values to encode the JSON payload as a query parameter.
	// net/url's Values encoder follows form-urlencoded rules: spaces
	// become `+`, special chars percent-encoded. Both `+` and `%20`
	// decode to the same space in the trade endpoint (RFC 3986); the
	// live API smoke test confirms this format is accepted.
	values := url.Values{}
	values.Set("q", string(payload))
	tradeURL.RawQuery = values.Encode()
	return tradeURL.String()
}

// buildTradeQueryPayload returns the canonical JSON the trade endpoint
// expects. Exported (lowercase but package-private accessible) for the
// build-tagged smoke test; production callers use buildTradeURL.
func buildTradeQueryPayload(itemName string) []byte {
	type tradeStatus struct {
		Option string `json:"option"`
	}
	type tradeStatsGroup struct {
		Type    string `json:"type"`
		Filters []any  `json:"filters"`
	}
	type tradeQueryInner struct {
		Status tradeStatus       `json:"status"`
		Name   string            `json:"name"`
		Stats  []tradeStatsGroup `json:"stats"`
	}
	type tradeSort struct {
		Price string `json:"price"`
	}
	type tradeQuery struct {
		Query tradeQueryInner `json:"query"`
		Sort  tradeSort       `json:"sort"`
	}
	payload, _ := json.Marshal(tradeQuery{
		Query: tradeQueryInner{
			Status: tradeStatus{Option: "online"},
			Name:   itemName,
			// PoB's reference uses a single AND group with empty
			// filters list; matches their working production format.
			Stats: []tradeStatsGroup{{Type: "and", Filters: []any{}}},
		},
		Sort: tradeSort{Price: "asc"},
	})
	return payload
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
