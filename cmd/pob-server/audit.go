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
}

// auditExtractLuaRequest is sent to wrapper.lua to walk build.spec.nodes for
// the requested scope(s) and return the raw graph data. The Go side runs
// segmentation on the result.
type auditExtractLuaRequest struct {
	Type  string `json:"type"`
	XML   string `json:"xml"`
	Scope string `json:"scope"`
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
// final HTTP response. Mirrors segmentBranch but adds empty deltas/efficiency
// placeholders that task #5's perturbation pass will populate.
type auditBranchResponse struct {
	ID         string             `json:"id"`
	Anchor     int                `json:"anchor"`
	Head       int                `json:"head"`
	Nodes      []int              `json:"nodes"`
	NodeCount  int                `json:"nodeCount"`
	Terminal   *segmentTerminal   `json:"terminal"`
	PureTravel bool               `json:"pureTravel"`
	Deltas     map[string]float64 `json:"deltas"`
	Efficiency map[string]float64 `json:"efficiency"`
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
	DeadWeight []json.RawMessage     `json:"deadWeight"`
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
	DeadWeight         []json.RawMessage     `json:"deadWeight"`
	Summary            auditSummary          `json:"summary"`
}

const (
	defaultAuditBranchLimit = 10
	maxAuditBranchLimit     = 50
	defaultAuditNodeLimit   = 20
	maxAuditNodeLimit       = 100
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

// segmentToResponseBranches converts segmentation output into the wire
// branch shape, attaching empty deltas/efficiency placeholders. Task #5's
// perturbation pass will fill these in via a second Send round-trip.
func segmentToResponseBranches(branches []segmentBranch) []auditBranchResponse {
	out := make([]auditBranchResponse, 0, len(branches))
	for _, branch := range branches {
		out = append(out, auditBranchResponse{
			ID:         branch.ID,
			Anchor:     branch.Anchor,
			Head:       branch.Head,
			Nodes:      branch.Nodes,
			NodeCount:  branch.NodeCount,
			Terminal:   branch.Terminal,
			PureTravel: branch.PureTravel,
			Deltas:     map[string]float64{},
			Efficiency: map[string]float64{},
		})
	}
	return out
}

// auditExtractEnvelope is the named type for unmarshaling wrapper.lua's
// audit_extract response. Named (rather than inline-anonymous) so the
// musttag linter can verify all fields are tagged.
type auditExtractEnvelope struct {
	Type    string           `json:"type"`
	Message string           `json:"message,omitempty"`
	Data    auditExtractData `json:"data,omitempty"`
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

	xml, ok := srv.fetchAuditBuildXML(writer, req.BuildID)
	if !ok {
		return
	}

	proc, ok := srv.acquirePoolProcess(writer)
	if !ok {
		return
	}
	defer srv.pool.Release(proc)

	pobResp, ok := srv.runAuditExtract(writer, proc, xml, req.Scope)
	if !ok {
		return
	}

	srv.writeAuditResponse(writer, req, pobResp)
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

// acquirePoolProcess pulls a PoB process from the pool, writing the
// appropriate HTTP error and returning ok=false on failure.
func (srv *Server) acquirePoolProcess(writer http.ResponseWriter) (*Process, bool) {
	proc, err := srv.pool.Acquire()
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
		Type:  "audit_extract",
		XML:   xml,
		Scope: scope,
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

// writeAuditResponse runs Go-side segmentation and writes the JSON response.
func (srv *Server) writeAuditResponse(
	writer http.ResponseWriter,
	req AuditRequest,
	envelope auditExtractEnvelope,
) {
	treeBranches, treeTotal := segmentExtractedScope(envelope.Data.Tree)
	ascBranches, ascTotal := segmentExtractedScope(envelope.Data.Ascendancy)

	summary := auditSummary{
		TotalAllocated:   treeTotal + ascTotal,
		BranchesAnalyzed: len(treeBranches) + len(ascBranches),
		WeakestBranchID:  nil, // populated in task #5 once perturbation lands
		TotalDeadPoints:  0,
	}

	writer.Header().Set("Content-Type", "application/json")
	if req.Scope == auditScopeBoth {
		_ = json.NewEncoder(writer).Encode(auditResponseBoth{
			BuildID:            req.BuildID,
			Baseline:           map[string]float64{},
			TreeBranches:       treeBranches,
			AscendancyBranches: ascBranches,
			DeadWeight:         []json.RawMessage{},
			Summary:            summary,
		})
		return
	}

	branches := treeBranches
	if req.Scope == auditScopeAscendancy {
		branches = ascBranches
	}
	_ = json.NewEncoder(writer).Encode(auditResponseSingle{
		BuildID:    req.BuildID,
		Baseline:   map[string]float64{},
		Branches:   branches,
		DeadWeight: []json.RawMessage{},
		Summary:    summary,
	})
}

// segmentExtractedScope runs segmentation on one scope's extract data,
// returning a non-nil branches slice (possibly empty) and the total
// allocated node count. nil input (scope not requested) yields empty.
func segmentExtractedScope(data *auditExtractScopeData) ([]auditBranchResponse, int) {
	if data == nil {
		return []auditBranchResponse{}, 0
	}
	branches := segmentGraph(data.Nodes, data.Adjacency, data.RootID)
	return segmentToResponseBranches(branches), data.TotalAllocated
}
