package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// Server is the PoB HTTP server.
type Server struct {
	pool   *Pool
	cache  *BuildCache
	apiKey string
	client *http.Client // for outbound requests (URL resolution); nil uses DefaultClient
	log    *slog.Logger
}

// CalcRequest is the JSON body for POST /calc.
type CalcRequest struct {
	BuildCode string `json:"buildCode"` // base64 PoB build code
	BuildXML  string `json:"buildXml"`  // raw XML (alternative to buildCode)
}

type calcLuaRequest struct {
	Type string `json:"type"`
	XML  string `json:"xml"`
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

	srv.calcAndRespond(writer, xml, "", "")
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
		idJSON, _ := json.Marshal(result.buildID)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]json.RawMessage{
			"buildId": idJSON,
			"data":    json.RawMessage(result.summary),
		})
		return
	}

	// External URL: calc through PoB, persist, return
	srv.calcAndRespond(writer, result.xml, result.sourceURL, "")
}

// calcAndRespond acquires a PoB process, runs calc, persists, and writes the JSON response.
func (srv *Server) calcAndRespond(
	writer http.ResponseWriter,
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

	response, err := proc.Send(calcLuaRequest{Type: "calc", XML: xml})
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
	if pobResp.Type == "error" {
		jsonError(
			writer,
			"PoB calc error: "+pobResp.Message,
			http.StatusUnprocessableEntity,
		)
		return
	}

	buildID := srv.cache.Put(xml)
	if srv.cache.store != nil {
		if err := srv.cache.store.Put(
			buildID, xml, string(pobResp.Data), sourceURL, parentID,
		); err != nil {
			srv.log.Warn("store put failed", "id", buildID, "err", err)
		}
	}

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID: buildID,
		PobData: pobResp.Data,
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

	srv.modifyAndRespond(writer, xml, req.BuildID, req.Operations)
}

// modifyAndRespond sends a modify request to PoB, persists the result, and writes the response.
func (srv *Server) modifyAndRespond(
	writer http.ResponseWriter,
	xml, parentID string,
	operations []json.RawMessage,
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
	if pobResp.Type == "error" {
		jsonError(
			writer,
			"PoB modify error: "+pobResp.Message,
			http.StatusUnprocessableEntity,
		)
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

	writer.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(writer).Encode(calcResponse{
		BuildID: newID,
		PobData: pobResp.Data,
	})
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
		idJSON, _ := json.Marshal(id)
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(map[string]json.RawMessage{
			"buildId": idJSON,
			"data":    json.RawMessage(summary),
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

func jsonError(writer http.ResponseWriter, msg string, code int) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(code)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": msg})
}
