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

type auditLuaRequest struct {
	Type        string   `json:"type"`
	XML         string   `json:"xml"`
	Metrics     []string `json:"metrics"`
	DeltaStats  []string `json:"deltaStats"`
	BranchLimit int      `json:"branchLimit"`
	NodeLimit   int      `json:"nodeLimit"`
	IncludeZero bool     `json:"includeZero"`
	Sort        string   `json:"sort"`
	Scope       string   `json:"scope"`
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

	response, err := proc.Send(auditLuaRequest{
		Type:        "audit",
		XML:         xml,
		Metrics:     req.Metrics,
		DeltaStats:  req.DeltaStats,
		BranchLimit: req.BranchLimit,
		NodeLimit:   req.NodeLimit,
		IncludeZero: *req.IncludeZero,
		Sort:        req.Sort,
		Scope:       req.Scope,
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
		srv.log.Error("PoB audit error", "message", pobResp.Message)
		jsonError(writer, "PoB audit failed", http.StatusUnprocessableEntity)
		return
	}

	writer.Header().Set("Content-Type", "application/json")
	_, _ = writer.Write(pobResp.Data)
}
