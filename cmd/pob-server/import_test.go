package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// importTestServer builds a minimal Server sufficient for the /import
// skeleton: it never reaches the pool or cache, so a discard logger is
// the only dependency needed.
func importTestServer() *Server {
	return &Server{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func TestHandleImportRejectsGet(t *testing.T) {
	srv := importTestServer()

	req := httptest.NewRequest(http.MethodGet, "/import", nil)
	recorder := httptest.NewRecorder()
	srv.handleImport(recorder, req)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d: %s", recorder.Code, recorder.Body.String())
	}
	assertErrorEnvelope(t, recorder.Body.Bytes())
}

func TestHandleImportRejectsInvalidJSON(t *testing.T) {
	srv := importTestServer()

	req := httptest.NewRequest(http.MethodPost, "/import", strings.NewReader("not json{{"))
	recorder := httptest.NewRecorder()
	srv.handleImport(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	assertErrorEnvelope(t, recorder.Body.Bytes())
}

func TestHandleImportRejectsEmptyBody(t *testing.T) {
	srv := importTestServer()

	// Well-formed JSON but missing the required `character` object.
	req := httptest.NewRequest(http.MethodPost, "/import", strings.NewReader("{}"))
	recorder := httptest.NewRecorder()
	srv.handleImport(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	assertErrorEnvelope(t, recorder.Body.Bytes())
}

// A JSON-valid character whose class can't be mapped fails in the Go
// transform, before any PoB process is touched — so importTestServer
// (no pool) is sufficient and the error is a 422, mirroring
// writeResolveError's unprocessable convention.
func TestHandleImportRejectsUnmappableCharacter(t *testing.T) {
	srv := importTestServer()

	body := `{"character":{"name":"X","class":"NotARealClass","level":1}}`
	req := httptest.NewRequest(http.MethodPost, "/import", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	srv.handleImport(recorder, req)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", recorder.Code, recorder.Body.String())
	}
	assertErrorEnvelope(t, recorder.Body.Bytes())
}

// End-to-end: a real GGG character fixture imported through the live
// PoB engine yields a {buildId,data} envelope identical in shape to
// /resolve, with real calc numbers. Skips cleanly without POB_DIR.
func TestHandleImportProducesBuild(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	resp := postImport(t, ts.URL, loadGGGFixture(t))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}

	var env map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	var buildID string
	if err := json.Unmarshal(env["buildId"], &buildID); err != nil || buildID == "" {
		t.Fatalf("missing/empty buildId: %v (env keys: %v)", err, keysOf(env))
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(env["data"], &data); err != nil {
		t.Fatalf("data not an object: %v", err)
	}
	for _, key := range []string{"character", "summary", "section_index"} {
		if _, ok := data[key]; !ok {
			t.Fatalf("data missing %q (keys: %v)", key, keysOf(data))
		}
	}
	var summary struct {
		Life float64 `json:"Life"`
	}
	if err := json.Unmarshal(data["summary"], &summary); err != nil {
		t.Fatalf("summary not an object: %v", err)
	}
	if summary.Life <= 0 {
		t.Errorf("imported build Life = %v, want > 0", summary.Life)
	}
}

// Identical GGG input must yield the identical content-addressed
// buildId — the property build_planner's stored-XML re-feed relies on.
func TestHandleImportDeterministic(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	id1 := importBuildID(t, ts.URL, loadGGGFixture(t))
	id2 := importBuildID(t, ts.URL, loadGGGFixture(t))
	if id1 != id2 {
		t.Fatalf("non-deterministic buildId: %q != %q", id1, id2)
	}
}

func postImport(t *testing.T, baseURL string, character json.RawMessage) *http.Response {
	t.Helper()
	body, err := json.Marshal(map[string]json.RawMessage{"character": character})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	resp, err := http.Post(baseURL+"/import", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /import: %v", err)
	}
	return resp
}

func importBuildID(t *testing.T, baseURL string, character json.RawMessage) string {
	t.Helper()
	resp := postImport(t, baseURL, character)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}
	var env struct {
		BuildID string `json:"buildId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return env.BuildID
}

// assertErrorEnvelope verifies the response is the standard pob-server
// JSON error envelope: a single-object {"error": "<message>"} with a
// non-empty message. This is the shape jsonError produces across every
// handler, so /import is contract-consistent with /resolve et al.
func assertErrorEnvelope(t *testing.T, body []byte) {
	t.Helper()
	var env map[string]string
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("response is not a JSON object: %v (body: %s)", err, body)
	}
	msg, ok := env["error"]
	if !ok {
		t.Fatalf("response missing \"error\" key, got: %s", body)
	}
	if strings.TrimSpace(msg) == "" {
		t.Fatalf("error message is empty, got: %s", body)
	}
}
