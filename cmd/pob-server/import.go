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
type ImportRequest struct {
	Character json.RawMessage `json:"character"`
}

// handleImport is the POST /import endpoint: GGG character JSON in, a
// content-addressed PoB build out. This is the skeleton — request
// decoding and the not-implemented contract only. The GGG→PoB
// conversion (PoB's account-import logic via wrapper.lua) and the
// {buildId, data} success envelope land in a follow-up task.
//
// Error handling mirrors handleResolve exactly: jsonError + HTTP status
// codes, never a 200 with an embedded error. The not-yet-available
// response is 501, matching handleResolve's store == nil path.
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

	jsonError(writer, "not implemented", http.StatusNotImplemented)
}
