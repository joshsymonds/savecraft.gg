package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestAuthMiddlewareRejectsNoKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareRejectsWrongKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer wrong")
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareAcceptsCorrectKey(t *testing.T) {
	srv := &Server{apiKey: "secret"}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer secret")
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestAuthMiddlewareNoKeyConfigured(t *testing.T) {
	srv := &Server{apiKey: ""}
	handler := srv.authMiddleware(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()
	handler(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 when no key configured, got %d", recorder.Code)
	}
}

func TestHealthEndpoint(t *testing.T) {
	srv := &Server{
		pool: newTestPool(4, 5*time.Minute),
		cache: &BuildCache{
			builds:  make(map[string]cachedBuild),
			ttl:     10 * time.Minute,
			nowFunc: time.Now,
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()
	srv.handleHealth(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, `"status":"ok"`) {
		t.Fatalf("expected status ok in body: %s", body)
	}
}

func TestCalcRejectsGet(t *testing.T) {
	srv := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/calc", nil)
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", recorder.Code)
	}
}

// TestCalcResponseIsFlat verifies the /calc response unwraps the PoB envelope
// so consumers see {buildId, data: {character, stats, ...}} not {buildId, data: {type, data: {...}}}.
func TestCalcResponseIsFlat(t *testing.T) {
	// Write a mock LuaJIT script that echoes a PoB-shaped response
	mockScript := filepath.Join(t.TempDir(), "mock-pob.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo '{"type":"result","data":{"character":{"class":"Witch","ascendancy":"Occultist","level":99},"stats":{"Life":6728}}}'
`), 0o755); err != nil {
		t.Fatal(err)
	}

	// Verify bash is available
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
	}

	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildXml":"<PathOfBuilding/>"}`
	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	// Must have buildId at top level
	if _, ok := resp["buildId"]; !ok {
		t.Fatal("response missing buildId")
	}

	// data must contain character directly (not nested under another data key)
	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data field is not an object: %v", err)
	}
	if _, ok := data["character"]; !ok {
		t.Fatalf("data should contain 'character' directly, got keys: %v", keysOf(data))
	}
	// data must NOT contain a nested "type" field (that's the PoB envelope)
	if _, ok := data["type"]; ok {
		t.Fatal("data contains 'type' — response is double-nested, PoB envelope was not unwrapped")
	}
}

func keysOf(m map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func newTestServer(t *testing.T) *Server {
	t.Helper()
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}

	return &Server{
		pool:  newTestPool(1, 5*time.Minute),
		cache: cache,
		log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

func TestGetBuildReturnsXML(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding><Build level=\"90\"/></PathOfBuilding>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{"stats":{}}`, "", "")

	req := httptest.NewRequest(http.MethodGet, "/build/"+id, nil)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/xml" {
		t.Fatalf("expected application/xml, got %s", ct)
	}
	if rec.Body.String() != xml {
		t.Fatalf("body mismatch: got %q", rec.Body.String())
	}
}

func TestGetBuildReturnsBuildCode(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding><Build level=\"90\"/></PathOfBuilding>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, `{"stats":{}}`, "", "")

	req := httptest.NewRequest(http.MethodGet, "/build/"+id, nil)
	req.Header.Set("Accept", "application/x-pob-code")
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/plain" {
		t.Fatalf("expected text/plain, got %s", ct)
	}

	// Decode the returned build code and verify round-trip
	decoded, err := DecodeBuildCode(rec.Body.String())
	if err != nil {
		t.Fatalf("failed to decode returned build code: %v", err)
	}
	if decoded != xml {
		t.Fatalf("round-trip mismatch: got %q", decoded)
	}
}

func TestGetBuildReturns404(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/build/nonexistent", nil)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetBuildSummaryReturnsJSON(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	summary := `{"character":{"class":"Witch"},"stats":{"Life":6728}}`
	_ = srv.cache.store.Put(id, xml, summary, "", "")

	req := httptest.NewRequest(
		http.MethodGet, "/build/"+id+"/summary", nil,
	)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("expected application/json, got %s", ct)
	}

	// Verify it's the summary JSON with buildId wrapper
	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if _, ok := resp["buildId"]; !ok {
		t.Fatal("response missing buildId")
	}
	if _, ok := resp["data"]; !ok {
		t.Fatal("response missing data")
	}
}

func TestGetBuildSummaryReturns404(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(
		http.MethodGet, "/build/nonexistent/summary", nil,
	)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestGetBuildRequiresStore(t *testing.T) {
	// Server without a store should return 501
	srv := &Server{
		pool: newTestPool(1, 5*time.Minute),
		cache: &BuildCache{
			builds:     make(map[string]cachedBuild),
			ttl:        10 * time.Minute,
			maxEntries: 100,
			nowFunc:    time.Now,
			cancel:     func() {},
		},
		log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	req := httptest.NewRequest(http.MethodGet, "/build/abc123", nil)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d", rec.Code)
	}
}

func TestCalcRejectsEmptyBody(t *testing.T) {
	srv := &Server{
		pool: newTestPool(1, 5*time.Minute),
		cache: &BuildCache{
			builds:  make(map[string]cachedBuild),
			ttl:     10 * time.Minute,
			nowFunc: time.Now,
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader("{}"))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func TestCalcRejectsInvalidBuildCode(t *testing.T) {
	srv := &Server{
		pool: newTestPool(1, 5*time.Minute),
		cache: &BuildCache{
			builds:     make(map[string]cachedBuild),
			ttl:        10 * time.Minute,
			maxEntries: 100,
			nowFunc:    time.Now,
			cancel:     func() {},
		},
		log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	body := `{"buildCode":"not-valid-base64!!!"}`
	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "invalid build code") {
		t.Fatalf("expected 'invalid build code' error, got: %s", recorder.Body.String())
	}
}
