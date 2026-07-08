package main

import (
	"encoding/json"
	"net/http"
)

// ImportRequest is the JSON body for POST /import.
//
// Character is the raw GGG character object as returned by the GGG API's
// GET /character/<name> endpoint. It is carried verbatim so the eventual
// PoB-import path (driven through wrapper.lua) receives exactly what GGG
// returned — Go does not reshape it. Mirrors ResolveRequest's role: the
// minimal request envelope around the build's source of truth.
//
// Game ("poe" or "poe2") selects which per-game PoB pool processes the
// import. Unlike /resolve, pob-server can't infer this from the request
// body — a GGG character object doesn't carry a game/root-element signal
// the way build XML does — so the caller (the poe or poe2 adapter, which
// already knows which GGG realm it queried) must say explicitly.
type ImportRequest struct {
	Character json.RawMessage `json:"character"`
	Game      string          `json:"game"`
}

// importLuaRequest is the wrapper.lua request for the "import" type.
// The two fields are the legacy-shaped bodies produced by
// transformToImportJSON, passed as strings because PoB's
// ImportTab:ProcessJSON parses them itself.
type importLuaRequest struct {
	Type                 string `json:"type"`
	GetItemsJSON         string `json:"getItemsJson"`
	GetPassiveSkillsJSON string `json:"getPassiveSkillsJson"`
	// League feeds wrapper.lua's headless charSelectLeague stub so
	// PoB's ImportPassiveTreeAndJewels doesn't hit the nil UI global.
	League string `json:"league"`
}

// handleImport is the POST /import endpoint: a GGG OAuth character
// object in, a content-addressed PoB build out. It transforms the
// character into PoB's headless-import JSON pair (Go-side), drives
// PoB's own account-import in wrapper.lua to produce build XML, then
// reuses calcAndRespond so the {buildId, data} envelope is identical
// to /resolve's by construction.
//
// Note: input validation (400/422) is surfaced before any PoB process
// is touched — deliberately unlike handleResolve, which gates on the
// store early because it cannot function without one. /import needs no
// store to run (calcAndRespond's cache.Put suffices), so bad input is
// reported regardless of pool/store state.
func (srv *Server) handleImport(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost {
		jsonError(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	request.Body = http.MaxBytesReader(writer, request.Body, maxRequestBodySize)

	var req ImportRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		jsonError(writer, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if len(req.Character) == 0 {
		jsonError(writer, "character is required", http.StatusBadRequest)
		return
	}

	// Missing/empty game defaults to poe1: pob.savecraft.gg fronts both
	// the staging and production workers, and the currently-deployed
	// production worker sends no game field on /import. Mirrors
	// detectBuildGameOrDefault's lenient/strict split in decode.go —
	// omitted input defaults instead of hard-failing, while an
	// explicit-but-invalid game is still rejected below — so rebuilding
	// pob-server doesn't have to be sequenced with a production worker
	// release.
	if req.Game == "" {
		req.Game = GamePoE
	}

	getItems, getPassives, err := transformToImportJSON(req.Character, req.Game)
	if err != nil {
		srv.log.Error("import transform error", "err", err)
		jsonError(writer, "could not import character: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}

	if req.Game != GamePoE && req.Game != GamePoE2 {
		jsonError(writer, `game must be "poe" or "poe2"`, http.StatusBadRequest)
		return
	}

	// League feeds the headless charSelectLeague stub in wrapper.lua.
	var meta struct {
		League string `json:"league"`
	}
	_ = json.Unmarshal(req.Character, &meta)

	proc, ok := srv.acquirePoolProcess(writer, req.Game, "")
	if !ok {
		return
	}
	xml, ok := srv.runImportLua(writer, proc, getItems, getPassives, meta.League)
	// Release before calcAndRespond, which acquires its own process —
	// holding this one would deadlock a size-1 pool.
	srv.releasePoolProcess(proc)
	if !ok {
		return
	}

	srv.calcAndRespond(writer, request, xml, "", "", req.Game, nil, nil, true)
}

// runImportLua sends one import request to wrapper.lua and returns the
// resulting build XML. Mirrors runModifyLua: on transport, parse, or
// PoB-side failure it writes the appropriate jsonError and returns
// ("", false).
func (srv *Server) runImportLua(
	writer http.ResponseWriter, proc *Process, getItems, getPassives []byte, league string,
) (string, bool) {
	response, err := proc.Send(importLuaRequest{
		Type:                 "import",
		GetItemsJSON:         string(getItems),
		GetPassiveSkillsJSON: string(getPassives),
		League:               league,
	})
	if err != nil {
		srv.log.Error("process send error", "err", err)
		jsonError(writer, "PoB process error — check server logs for details", http.StatusInternalServerError)
		return "", false
	}
	var pobResp modifyLuaResponse
	if err := json.Unmarshal(response, &pobResp); err != nil {
		srv.log.Error("failed to parse PoB response", "err", err)
		jsonError(writer, "invalid response from PoB process", http.StatusInternalServerError)
		return "", false
	}
	if pobResp.Type == pobRespTypeError {
		srv.log.Error("PoB import error", "message", pobResp.Message)
		jsonError(writer, "PoB could not import this character", http.StatusUnprocessableEntity)
		return "", false
	}
	if pobResp.XML == "" {
		srv.log.Error("PoB import returned empty XML")
		jsonError(writer, "PoB import produced no build", http.StatusUnprocessableEntity)
		return "", false
	}
	return pobResp.XML, true
}
