package main

import (
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

func (srv *Server) authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		if srv.apiKey == "" {
			next(writer, request)
			return
		}
		auth := request.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") || auth[7:] != srv.apiKey {
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

	// Acquire a PoB process
	proc, err := srv.pool.Acquire()
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

	// Send calc request to PoB
	response, err := proc.Send(calcLuaRequest{Type: "calc", XML: xml})
	if err != nil {
		srv.log.Error("process send error", "err", err)
		jsonError(writer, "PoB process error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Check for PoB-level errors
	var pobResp struct {
		Type    string `json:"type"`
		Message string `json:"message,omitempty"`
	}
	if err := json.Unmarshal(response, &pobResp); err == nil && pobResp.Type == "error" {
		jsonError(writer, "PoB calc error: "+pobResp.Message, http.StatusUnprocessableEntity)
		return
	}

	// Cache the build XML
	buildID := srv.cache.Put(xml)

	// Wrap the response with buildId
	writer.Header().Set("Content-Type", "application/json")
	_, _ = writer.Write([]byte(`{"buildId":"`))
	_, _ = writer.Write([]byte(buildID))
	_, _ = writer.Write([]byte(`",`))
	// Strip the leading { from the PoB response and append
	raw := []byte(response)
	if len(raw) > 0 && raw[0] == '{' {
		_, _ = writer.Write(raw[1:])
	} else {
		_, _ = writer.Write(raw)
	}
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

func jsonError(writer http.ResponseWriter, msg string, code int) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(code)
	_ = json.NewEncoder(writer).Encode(map[string]string{"error": msg})
}
