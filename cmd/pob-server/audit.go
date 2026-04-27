package main

import (
	"encoding/json"
	"errors"
	"net/http"
)

// AuditRequest is the JSON body for POST /audit.
//
// IncludeZero is a pointer so we can distinguish "field omitted" (default true)
// from "explicitly false". The default of true matches the epic requirement
// that empty allocated nodes show up in the dead_weight bucket unless the
// caller opts out.
type AuditRequest struct {
	BuildID     string   `json:"buildId"`
	Metrics     []string `json:"metrics"`
	DeltaStats  []string `json:"deltaStats"`
	BranchLimit int      `json:"branchLimit"`
	NodeLimit   int      `json:"nodeLimit"`
	IncludeZero *bool    `json:"includeZero,omitempty"`
	Sort        string   `json:"sort"`
	Scope       string   `json:"scope"`
	// Categories restricts which terminal-type branches surface in the
	// response. Empty/missing → no filter (every branch passes through).
	// Distinct from /nearby's category default — audit's natural state
	// is "show all branches" since segmentation already only emits
	// notable + keystone terminals. Valid values mirror nearbyValidCategories.
	Categories []string `json:"categories,omitempty"`
}

// auditExtractLuaRequest is sent to wrapper.lua to walk build.spec.nodes for
// the requested scope(s) and return the raw graph data. The Go side runs
// segmentation on the result.
type auditExtractLuaRequest struct {
	Type          string `json:"type"`
	XML           string `json:"xml"`
	LoadedBuildID string `json:"loadedBuildId,omitempty"`
	Scope         string `json:"scope"`
}

// auditExtractScopeData is one scope's worth of graph data returned from
// wrapper.lua's handleAuditExtract. Lua keys nodes/adjacency by stringified
// integer ids (otherwise dkjson serializes sparse-integer-keyed tables as
// JSON arrays); Go's json package decodes the string keys back into int.
type auditExtractScopeData struct {
	Nodes          map[int]segmentNode `json:"nodes"`
	Adjacency      map[int][]int       `json:"adjacency"`
	RootID         int                 `json:"rootId"`
	TotalAllocated int                 `json:"totalAllocated"`
}

// auditExtractData is the top-level payload from wrapper.lua. Tree and
// Ascendancy are pointers so a missing scope serializes as null (rather
// than an empty object that segmentation would mistake for "no nodes").
type auditExtractData struct {
	Tree       *auditExtractScopeData `json:"tree,omitempty"`
	Ascendancy *auditExtractScopeData `json:"ascendancy,omitempty"`
}

// auditBranchResponse is one branch in the per-scope branches array of the
// final HTTP response. Carries the segmentation output plus perturbation
// deltas, efficiency (delta / node_count per metric), and per-node breakdown
// distinguishing leaves (drilled, with real deltas) from interior nodes.
type auditBranchResponse struct {
	ID            string             `json:"id"`
	Anchor        int                `json:"anchor"`
	Head          int                `json:"head"`
	Nodes         []int              `json:"nodes"`
	NodeCount     int                `json:"nodeCount"`
	Terminal      *segmentTerminal   `json:"terminal"`
	PureTravel    bool               `json:"pureTravel"`
	Deltas        map[string]float64 `json:"deltas"`
	Efficiency    map[string]float64 `json:"efficiency"`
	NodeBreakdown []nodeBreakdown    `json:"nodeBreakdown"`
}

// auditSummary is the summary block of the audit response.
type auditSummary struct {
	TotalAllocated   int     `json:"totalAllocated"`
	BranchesAnalyzed int     `json:"branchesAnalyzed"`
	WeakestBranchID  *string `json:"weakestBranchId"`
	TotalDeadPoints  int     `json:"totalDeadPoints"`
}

// auditResponseSingle is the wire shape when scope is "tree" or "ascendancy":
// one flat branches[] array. Always present even when empty.
type auditResponseSingle struct {
	BuildID    string                `json:"buildId"`
	Baseline   map[string]float64    `json:"baseline"`
	Branches   []auditBranchResponse `json:"branches"`
	DeadWeight []deadWeightEntry     `json:"deadWeight"`
	Summary    auditSummary          `json:"summary"`
}

// auditResponseBoth is the wire shape when scope is "both": parallel
// tree_branches and ascendancy_branches sections, never merged. The two
// kinds of recommendations (drop tree points vs respec ascendancy) are
// structurally different and conflating them confuses LLM reasoning.
type auditResponseBoth struct {
	BuildID            string                `json:"buildId"`
	Baseline           map[string]float64    `json:"baseline"`
	TreeBranches       []auditBranchResponse `json:"treeBranches"`
	AscendancyBranches []auditBranchResponse `json:"ascendancyBranches"`
	DeadWeight         []deadWeightEntry     `json:"deadWeight"`
	Summary            auditSummary          `json:"summary"`
}

const (
	defaultAuditBranchLimit = 10
	maxAuditBranchLimit     = 50
	defaultAuditNodeLimit   = 20
	maxAuditNodeLimit       = 50
	maxAuditMetrics         = 10
	maxAuditDeltaStats      = 20

	auditSortWeakest   = "weakest"
	auditSortStrongest = "strongest"

	auditScopeTree       = "tree"
	auditScopeAscendancy = "ascendancy"
	auditScopeBoth       = "both"
)

// parseAuditRequest decodes, validates, and applies defaults/clamping to an audit request.
func parseAuditRequest(w http.ResponseWriter, r *http.Request) (AuditRequest, string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

	var req AuditRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return req, "invalid JSON body"
	}
	if req.BuildID == "" {
		return req, "buildId is required"
	}

	applyAuditDefaults(&req)

	if msg := validateAuditEnums(&req); msg != "" {
		return req, msg
	}

	return req, ""
}

// applyAuditDefaults fills in defaults and clamps numeric/list fields.
func applyAuditDefaults(req *AuditRequest) {
	if len(req.Metrics) == 0 {
		req.Metrics = []string{"Life", "CombinedDPS", "EnergyShield"}
	} else if len(req.Metrics) > maxAuditMetrics {
		req.Metrics = req.Metrics[:maxAuditMetrics]
	}

	if len(req.DeltaStats) == 0 {
		req.DeltaStats = append([]string(nil), req.Metrics...)
	} else if len(req.DeltaStats) > maxAuditDeltaStats {
		req.DeltaStats = req.DeltaStats[:maxAuditDeltaStats]
	}

	if req.BranchLimit <= 0 {
		req.BranchLimit = defaultAuditBranchLimit
	} else if req.BranchLimit > maxAuditBranchLimit {
		req.BranchLimit = maxAuditBranchLimit
	}

	if req.NodeLimit <= 0 {
		req.NodeLimit = defaultAuditNodeLimit
	} else if req.NodeLimit > maxAuditNodeLimit {
		req.NodeLimit = maxAuditNodeLimit
	}

	if req.IncludeZero == nil {
		t := true
		req.IncludeZero = &t
	}
}

// validateAuditEnums checks the sort and scope fields, applying defaults
// for empty values and returning a user-facing error string for invalid ones.
func validateAuditEnums(req *AuditRequest) string {
	switch req.Sort {
	case "":
		req.Sort = auditSortWeakest
	case auditSortWeakest, auditSortStrongest:
	default:
		return "sort must be 'weakest' or 'strongest'"
	}

	switch req.Scope {
	case "":
		req.Scope = auditScopeTree
	case auditScopeTree, auditScopeAscendancy, auditScopeBoth:
	default:
		return "scope must be 'tree', 'ascendancy', or 'both'"
	}

	return ""
}

// auditExtractEnvelope is the named type for unmarshaling wrapper.lua's
// audit_extract response. Named (rather than inline-anonymous) so the
// musttag linter can verify all fields are tagged.
type auditExtractEnvelope struct {
	Type    string           `json:"type"`
	Message string           `json:"message,omitempty"`
	Data    auditExtractData `json:"data,omitempty"`
}

// auditPerturbLuaRequest is sent to wrapper.lua as Send 2. Each entry in
// BranchRemoves is a set of node ids to remove together (one branch); each
// entry in SingleRemoves is a single node id for leaf-level drill-down.
// Both passes share the same baseline calc to minimize work.
type auditPerturbLuaRequest struct {
	Type          string   `json:"type"`
	BranchRemoves [][]int  `json:"branchRemoves"`
	SingleRemoves []int    `json:"singleRemoves"`
	Stats         []string `json:"stats"`
}

// auditPerturbData is the response payload from handleAuditPerturb in
// wrapper.lua. BranchDeltas is parallel to the BranchRemoves request array;
// SingleDeltas is keyed by stringified node id (Lua serializes integer keys
// as strings via tostring), Go decodes back to int.
type auditPerturbData struct {
	Baseline     map[string]float64         `json:"baseline"`
	BranchDeltas []map[string]float64       `json:"branchDeltas"`
	SingleDeltas map[int]map[string]float64 `json:"singleDeltas"`
}

type auditPerturbEnvelope struct {
	Type    string           `json:"type"`
	Message string           `json:"message,omitempty"`
	Data    auditPerturbData `json:"data,omitempty"`
}

func (srv *Server) handleAudit(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if srv.cache.store == nil {
		jsonError(writer, "build storage not enabled", http.StatusNotImplemented)
		return
	}

	req, validationErr := parseAuditRequest(writer, request)
	if validationErr != "" {
		jsonError(writer, validationErr, http.StatusBadRequest)
		return
	}

	allowedCategories, err := validateAuditCategories(req.Categories)
	if err != nil {
		jsonError(writer, err.Error(), http.StatusBadRequest)
		return
	}

	xml, ok := srv.fetchAuditBuildXML(writer, req.BuildID)
	if !ok {
		return
	}

	proc, ok := srv.acquirePoolProcess(writer, req.BuildID)
	if !ok {
		return
	}
	defer srv.pool.Release(proc)

	extractEnvelope, ok := srv.runAuditExtract(writer, proc, xml, req.Scope)
	if !ok {
		return
	}
	// Wrapper now has req.BuildID loaded; record for skip-reload AND pin so
	// follow-up /audit calls on the same build hit affinity. Without the
	// Pin, /audit was the odd one out — /resolve, /modify, /compare all
	// pin after a successful calc, but /audit only set last-loaded.
	proc.SetLastLoadedBuildID(req.BuildID)
	srv.pool.Pin(proc, req.BuildID)

	// Per-scope segmentation. Each scope's branches are independent and get
	// their own evaluation budget (branch_limit + node_limit apply per scope).
	treeBranches, treeAdj, treeTotal := segmentScopeFromExtract(extractEnvelope.Data.Tree)
	ascBranches, ascAdj, ascTotal := segmentScopeFromExtract(extractEnvelope.Data.Ascendancy)

	// Pre-rank by node count and select the evaluation budget per scope.
	treeSelected := auditSelectBranchesToEvaluate(treeBranches, req.BranchLimit)
	ascSelected := auditSelectBranchesToEvaluate(ascBranches, req.BranchLimit)

	// Identify leaves (DFS-tree leaves carried forward from segmentation).
	// The node budget is per-scope so /audit?scope=both can drill node_limit
	// leaves on each side rather than splitting the budget across scopes.
	treeLeavesByBranch, treeLeaves := auditGatherLeaves(treeSelected, req.NodeLimit)
	ascLeavesByBranch, ascLeaves := auditGatherLeaves(ascSelected, req.NodeLimit)

	// Single perturb Send carrying both scopes' work — the build stays loaded
	// across both passes since we're on the same acquired process. Tree
	// branches come first in the array; that's the index range we use to
	// split deltas back per scope after the response.
	branchRemoves := buildBranchRemoves(treeSelected, ascSelected)
	// Tree and ascendancy node ids share the same PoB id space but never
	// collide: tree nodes have no ascendancyName, ascendancy nodes do, and
	// PoB allocates them from disjoint id ranges. The merged singleRemoves
	// slice is therefore safe — the perturb response's per-id deltas map
	// can be consumed by both scopes' rank calls without any prefix games.
	singleRemoves := append(append([]int(nil), treeLeaves...), ascLeaves...)

	// Build the canonical stat-key list (rank metrics + report-only delta stats).
	statKeys := collectStatKeys(req.Metrics, req.DeltaStats)

	perturbEnvelope, ok := srv.runAuditPerturb(writer, proc, req.BuildID, branchRemoves, singleRemoves, statKeys)
	if !ok {
		return
	}

	tree, asc := srv.rankAuditScopes(auditRankPipelineInput{
		req:                req,
		extractEnvelope:    extractEnvelope,
		perturbEnvelope:    perturbEnvelope,
		treeSelected:       treeSelected,
		ascSelected:        ascSelected,
		treeAdj:            treeAdj,
		ascAdj:             ascAdj,
		treeLeavesByBranch: treeLeavesByBranch,
		ascLeavesByBranch:  ascLeavesByBranch,
		allowedCategories:  allowedCategories,
	})

	srv.writeAuditFinalResponse(writer, auditFinalInput{
		Req:          req,
		Baseline:     perturbEnvelope.Data.Baseline,
		TreeBranches: tree.branches,
		AscBranches:  asc.branches,
		TreeDead:     tree.dead,
		AscDead:      asc.dead,
		TreeTotal:    treeTotal,
		AscTotal:     ascTotal,
		TreeWeakest:  tree.weakest,
		AscWeakest:   asc.weakest,
	})
}

// auditRankPipelineInput bundles the post-perturb rank work into one
// param so handleAudit can hand off the long phase as a single call.
type auditRankPipelineInput struct {
	req                AuditRequest
	extractEnvelope    auditExtractEnvelope
	perturbEnvelope    auditPerturbEnvelope
	treeSelected       []segmentBranch
	ascSelected        []segmentBranch
	treeAdj            map[int][]int
	ascAdj             map[int][]int
	treeLeavesByBranch map[string][]int
	ascLeavesByBranch  map[string][]int
	allowedCategories  map[string]bool
}

// auditRankResult is one scope's rank output.
type auditRankResult struct {
	branches []auditBranchResponse
	dead     []deadWeightEntry
	weakest  *string
}

// rankAuditScopes splits perturb deltas, builds the per-scope rank
// inputs, runs auditRank for both scopes, and applies the category
// filter. Extracted from handleAudit to keep the handler under the
// funlen budget without losing the per-scope symmetry that makes the
// rank phase readable.
func (srv *Server) rankAuditScopes(in auditRankPipelineInput) (auditRankResult, auditRankResult) {
	treeBranchDeltas, ascBranchDeltas := srv.splitBranchDeltas(
		in.perturbEnvelope.Data.BranchDeltas, len(in.treeSelected), len(in.ascSelected),
	)
	// Build per-scope NodeTypes lookups for the rank step. Cached per
	// (buildID, scope) since the result is build-stable.
	treeNodeTypes := srv.cachedScopeNodeTypes(in.req.BuildID, "tree", in.extractEnvelope.Data.Tree)
	ascNodeTypes := srv.cachedScopeNodeTypes(in.req.BuildID, "asc", in.extractEnvelope.Data.Ascendancy)

	tree := scopeRank(in.req, in.treeSelected, treeBranchDeltas, in.perturbEnvelope.Data.SingleDeltas,
		in.treeLeavesByBranch, treeNodeTypes, in.treeAdj)
	asc := scopeRank(in.req, in.ascSelected, ascBranchDeltas, in.perturbEnvelope.Data.SingleDeltas,
		in.ascLeavesByBranch, ascNodeTypes, in.ascAdj)

	// Apply category filter post-rank — drops branches whose terminal
	// type isn't in the caller's allowlist. nil allowlist (default)
	// passes everything through unchanged.
	tree.branches = filterAuditBranchesByCategory(tree.branches, in.allowedCategories)
	asc.branches = filterAuditBranchesByCategory(asc.branches, in.allowedCategories)
	return tree, asc
}

// scopeRank runs auditRank for one scope and packages the three return
// values into auditRankResult so the caller can unpack symmetrically
// for tree + ascendancy.
func scopeRank(
	req AuditRequest,
	selected []segmentBranch,
	branchDeltas []map[string]float64,
	leafDeltas map[int]map[string]float64,
	leavesByBranch map[string][]int,
	nodeTypes map[int]string,
	adj map[int][]int,
) auditRankResult {
	branches, dead, weakest := auditRank(auditRankInput{
		Branches:         selected,
		BranchDeltas:     branchDeltas,
		LeafDeltas:       leafDeltas,
		LeavesByBranchID: leavesByBranch,
		NodeTypes:        nodeTypes,
		Adjacency:        adj,
		Metrics:          req.Metrics,
		DeltaStats:       req.DeltaStats,
		Sort:             req.Sort,
		BranchLimit:      req.BranchLimit,
		IncludeZero:      *req.IncludeZero,
	})
	return auditRankResult{branches: branches, dead: dead, weakest: weakest}
}

// filterAuditBranchesByCategory drops branches whose terminal type
// isn't in the allowlist. A nil/empty allowlist short-circuits to
// "no filter" — audit's natural default is to show every branch since
// segmentation already restricts terminals to notable + keystone.
//
// Branches with nil Terminal (no classifiable terminal — pure-travel
// branches that segment off without reaching a meaningful endpoint)
// drop when ANY allowlist is active. Without a terminal type they
// can't satisfy a category filter.
func filterAuditBranchesByCategory(branches []auditBranchResponse, allowed map[string]bool) []auditBranchResponse {
	if len(allowed) == 0 {
		return branches
	}
	out := make([]auditBranchResponse, 0, len(branches))
	for _, b := range branches {
		if b.Terminal == nil {
			continue
		}
		if allowed[b.Terminal.Type] {
			out = append(out, b)
		}
	}
	return out
}

// validateAuditCategories validates the request's category list using
// the shared nearbyValidCategories taxonomy. Distinct from
// validateNearbyCategories: empty input returns nil (no filter — pass
// every branch through), not the historical default. The semantic is
// "what to keep" rather than "what's eligible for evaluation".
func validateAuditCategories(input []string) (map[string]bool, error) {
	if len(input) == 0 {
		return nil, nil //nolint:nilnil // intentional no-filter sentinel: nil map → "keep every branch"
	}
	// Reuse the shared validator's allowlist check; just discard its
	// default-when-empty branch since we want nil for no-filter.
	return validateNearbyCategories(input)
}

// segmentScopeFromExtract runs segmentation on one scope's extract data and
// returns the raw branches + the original adjacency (for downstream leaf
// identification) + the total allocated count. nil input → empty result.
func segmentScopeFromExtract(data *auditExtractScopeData) ([]segmentBranch, map[int][]int, int) {
	if data == nil {
		return nil, nil, 0
	}
	branches := segmentGraph(data.Nodes, data.Adjacency, data.RootID)
	return branches, data.Adjacency, data.TotalAllocated
}

// buildBranchRemoves concatenates the node-id arrays from each selected
// branch in tree-then-ascendancy order. The Lua side iterates this array
// in order and returns deltas in the same order.
func buildBranchRemoves(treeSelected, ascSelected []segmentBranch) [][]int {
	out := make([][]int, 0, len(treeSelected)+len(ascSelected))
	for _, b := range treeSelected {
		out = append(out, b.Nodes)
	}
	for _, b := range ascSelected {
		out = append(out, b.Nodes)
	}
	return out
}

// splitBranchDeltas slices a flat branch-delta array back into the two
// scope-specific arrays based on the original tree/ascendancy lengths.
//
// On under-run (Lua returned fewer entries than requested) the result is
// padded with empty maps so downstream rank doesn't crash, AND a warning
// is logged so the truncation surfaces in pob-server logs. Empty deltas
// would otherwise feed into auditExtractDeadWeight as zero-contribution
// entries and produce phantom dead_weight nodes — the warning lets us
// distinguish a real Lua bug from genuinely zero-impact branches.
func (srv *Server) splitBranchDeltas(
	all []map[string]float64,
	treeLen, ascLen int,
) ([]map[string]float64, []map[string]float64) {
	expected := treeLen + ascLen
	if len(all) < expected {
		srv.log.Warn(
			"audit_perturb branchDeltas truncated",
			"got", len(all),
			"want", expected,
			"treeLen", treeLen,
			"ascLen", ascLen,
		)
		padded := make([]map[string]float64, expected)
		copy(padded, all)
		for i := range padded {
			if padded[i] == nil {
				padded[i] = map[string]float64{}
			}
		}
		all = padded
	}
	return all[:treeLen], all[treeLen:expected]
}

// scopeNodeTypes builds the per-id node-type lookup for one scope's extract
// data. Returns nil for nil input; auditRank handles nil maps (lookups
// return the empty string, which is the same as "no type info available").
func scopeNodeTypes(data *auditExtractScopeData) map[int]string {
	if data == nil {
		return nil
	}
	out := make(map[int]string, len(data.Nodes))
	for id, node := range data.Nodes {
		out[id] = node.Type
	}
	return out
}

// cachedScopeNodeTypes returns the build-stable id→type map for one
// audit scope, populating srv.auditNodeTypesCache on miss. Builds are
// content-addressed so the value never changes for a given buildID.
func (srv *Server) cachedScopeNodeTypes(buildID, scope string, data *auditExtractScopeData) map[int]string {
	if data == nil {
		return nil
	}
	cacheKey := buildID + "|" + scope
	if v, ok := srv.auditNodeTypesCache.Load(cacheKey); ok {
		// Type known: this map only ever stores map[int]string (Store
		// at line 499 is the only writer).
		cached, _ := v.(map[int]string)
		return cached
	}
	out := scopeNodeTypes(data)
	srv.auditNodeTypesCache.Store(cacheKey, out)
	return out
}

// auditFinalInput bundles the per-scope rank output for the final response
// writer. Avoids a 12-parameter helper signature and keeps writeAuditFinalResponse
// under the funlen budget.
type auditFinalInput struct {
	Req          AuditRequest
	Baseline     map[string]float64
	TreeBranches []auditBranchResponse
	AscBranches  []auditBranchResponse
	TreeDead     []deadWeightEntry
	AscDead      []deadWeightEntry
	TreeTotal    int
	AscTotal     int
	TreeWeakest  *string
	AscWeakest   *string
}

// writeAuditFinalResponse picks the right wire shape (single vs both) and
// emits the final HTTP JSON response. For scope=both, dead_weight is the
// concatenation of both scopes' dead lists; for single scope, only the
// relevant scope's dead.
func (srv *Server) writeAuditFinalResponse(writer http.ResponseWriter, in auditFinalInput) {
	baseline := in.Baseline
	if baseline == nil {
		baseline = map[string]float64{}
	}

	writer.Header().Set("Content-Type", "application/json")
	if in.Req.Scope == auditScopeBoth {
		dead := append(append([]deadWeightEntry{}, in.TreeDead...), in.AscDead...)
		// For scope=both, surface the tree's weakest as the canonical
		// summary hint. Fall back to the ascendancy weakest when the tree
		// has no analyzed branches (e.g. a build that only has weakness
		// inside its ascendancy). The two parallel sections still carry
		// their own ranked lists; this is just the at-a-glance pointer.
		canonicalWeakest := in.TreeWeakest
		if canonicalWeakest == nil {
			canonicalWeakest = in.AscWeakest
		}
		_ = json.NewEncoder(writer).Encode(auditResponseBoth{
			BuildID:            in.Req.BuildID,
			Baseline:           baseline,
			TreeBranches:       in.TreeBranches,
			AscendancyBranches: in.AscBranches,
			DeadWeight:         dead,
			Summary: auditSummary{
				TotalAllocated:   in.TreeTotal + in.AscTotal,
				BranchesAnalyzed: len(in.TreeBranches) + len(in.AscBranches),
				WeakestBranchID:  canonicalWeakest,
				TotalDeadPoints:  len(in.TreeDead) + len(in.AscDead),
			},
		})
		return
	}

	branches := in.TreeBranches
	dead := in.TreeDead
	weakest := in.TreeWeakest
	total := in.TreeTotal
	if in.Req.Scope == auditScopeAscendancy {
		branches = in.AscBranches
		dead = in.AscDead
		weakest = in.AscWeakest
		total = in.AscTotal
	}
	_ = json.NewEncoder(writer).Encode(auditResponseSingle{
		BuildID:    in.Req.BuildID,
		Baseline:   baseline,
		Branches:   branches,
		DeadWeight: dead,
		Summary: auditSummary{
			TotalAllocated:   total,
			BranchesAnalyzed: len(branches),
			WeakestBranchID:  weakest,
			TotalDeadPoints:  len(dead),
		},
	})
}

// fetchAuditBuildXML loads the build XML from the cache, writing the
// appropriate HTTP error and returning ok=false on failure.
func (srv *Server) fetchAuditBuildXML(writer http.ResponseWriter, buildID string) (string, bool) {
	xml, err := srv.cache.Get(buildID)
	if err == nil {
		return xml, true
	}
	if errors.Is(err, ErrBuildNotFound) {
		jsonError(writer, "build not found", http.StatusNotFound)
		return "", false
	}
	srv.log.Error("cache get error", "id", buildID, "err", err)
	jsonError(writer, "failed to retrieve build", http.StatusInternalServerError)
	return "", false
}

// acquirePoolProcess pulls a PoB process from the pool, preferring the process
// pinned to buildID when one exists. Writes the appropriate HTTP error and
// returns ok=false on failure. Pass buildID="" for build-agnostic acquires.
func (srv *Server) acquirePoolProcess(writer http.ResponseWriter, buildID string) (*Process, bool) {
	proc, err := srv.pool.AcquireForBuild(buildID)
	if err == nil {
		return proc, true
	}
	if errors.Is(err, ErrPoolExhausted) {
		jsonError(writer, "all PoB processes are busy, try again later", http.StatusServiceUnavailable)
		return nil, false
	}
	srv.log.Error("pool acquire error", "err", err)
	jsonError(writer, "failed to acquire PoB process", http.StatusInternalServerError)
	return nil, false
}

// runAuditExtract sends the audit_extract request to wrapper.lua and
// unmarshals the response. ok=false on transport, parse, or PoB-side errors;
// the caller has already had the appropriate jsonError written.
func (srv *Server) runAuditExtract(
	writer http.ResponseWriter,
	proc *Process,
	xml, scope string,
) (auditExtractEnvelope, bool) {
	var envelope auditExtractEnvelope
	rawResp, sendErr := proc.Send(auditExtractLuaRequest{
		Type:          "audit_extract",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
		Scope:         scope,
	})
	if sendErr != nil {
		srv.log.Error("process send error", "err", sendErr)
		jsonError(writer, "PoB process error — check server logs for details", http.StatusInternalServerError)
		return envelope, false
	}
	if err := json.Unmarshal(rawResp, &envelope); err != nil {
		srv.log.Error("failed to parse PoB response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return envelope, false
	}
	if envelope.Type == pobRespTypeError {
		srv.log.Error("PoB audit_extract error", "message", envelope.Message)
		jsonError(writer, "PoB audit failed", http.StatusUnprocessableEntity)
		return envelope, false
	}
	return envelope, true
}

// runAuditPerturb sends the audit_perturb request to wrapper.lua. Assumes
// the build is already loaded from a prior runAuditExtract on the same
// process. Returns ok=false on any error (jsonError already written).
// When there is nothing to perturb, returns a zero envelope + ok=true so
// the caller skips the Send round-trip entirely.
//
// When the SQLite store is enabled, runAuditPerturb consults the
// (build_id, node_id, metric) delta cache for singleRemoves only — branch
// removes are keyed by node sets, not single nodes, so they aren't
// cacheable here. Cached single-removes are folded back into the
// response's SingleDeltas after the perturb call.
func (srv *Server) runAuditPerturb(
	writer http.ResponseWriter,
	proc *Process,
	buildID string,
	branchRemoves [][]int,
	singleRemoves []int,
	stats []string,
) (auditPerturbEnvelope, bool) {
	var envelope auditPerturbEnvelope
	if len(branchRemoves) == 0 && len(singleRemoves) == 0 {
		return envelope, true
	}

	// Cache pre-check: skip already-cached single-remove nodes.
	cachedSingles, perturbSingles := srv.splitAuditSinglesByCache(buildID, singleRemoves, stats)

	rawResp, sendErr := proc.Send(auditPerturbLuaRequest{
		Type:          "audit_perturb",
		BranchRemoves: branchRemoves,
		SingleRemoves: perturbSingles,
		Stats:         stats,
	})
	if sendErr != nil {
		srv.log.Error("process send error", "err", sendErr)
		jsonError(writer, "PoB process error — check server logs for details", http.StatusInternalServerError)
		return envelope, false
	}
	if err := json.Unmarshal(rawResp, &envelope); err != nil {
		srv.log.Error("failed to parse perturb response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return envelope, false
	}
	if envelope.Type == pobRespTypeError {
		srv.log.Error("PoB audit_perturb error", "message", envelope.Message)
		jsonError(writer, "PoB audit failed", http.StatusUnprocessableEntity)
		return envelope, false
	}

	// Refresh cache with fresh singles, then fold cached singles back into
	// the response so the caller sees a unified SingleDeltas map.
	if srv.cache.store != nil && buildID != "" && len(envelope.Data.SingleDeltas) > 0 {
		if err := srv.cache.store.PutDeltasBatch(buildID, envelope.Data.SingleDeltas); err != nil {
			srv.log.Warn("delta cache write failed", "err", err)
		}
	}
	envelope.Data.SingleDeltas = mergeDeltaMaps(cachedSingles, envelope.Data.SingleDeltas)
	return envelope, true
}

// splitAuditSinglesByCache returns cached single-remove deltas and the
// subset of node ids that still need perturbation (any metric missing from
// cache).
func (srv *Server) splitAuditSinglesByCache(
	buildID string, singles []int, stats []string,
) (cached map[int]map[string]float64, perturb []int) {
	if srv.cache.store == nil || buildID == "" || len(singles) == 0 || len(stats) == 0 {
		return nil, singles
	}
	lookups := make([]deltaLookup, 0, len(singles)*len(stats))
	for _, nodeID := range singles {
		for _, metric := range stats {
			lookups = append(lookups, deltaLookup{NodeID: nodeID, Metric: metric})
		}
	}
	got, _, err := srv.cache.store.GetDeltasBatch(buildID, lookups)
	if err != nil {
		srv.log.Warn("delta cache read failed; bypassing", "err", err)
		return nil, singles
	}
	perturb = make([]int, 0, len(singles))
	for _, nodeID := range singles {
		full := true
		for _, metric := range stats {
			if _, ok := got[nodeID][metric]; !ok {
				full = false
				break
			}
		}
		if !full {
			perturb = append(perturb, nodeID)
		}
	}
	return got, perturb
}
