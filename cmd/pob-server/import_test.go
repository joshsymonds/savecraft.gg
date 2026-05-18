package main

import (
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

// A syntactically valid GGG character body. Mirrors the documented
// shape (name/class/level + equipment + passives) without being a full
// fixture — the skeleton only decodes and validates presence.
const validGGGCharacterBody = `{"character":{"name":"Boneshatterer","class":"Juggernaut","level":92,"equipment":[],"passives":{"hashes":[]}}}`

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

func TestHandleImportValidCharacterNotImplemented(t *testing.T) {
	srv := importTestServer()

	req := httptest.NewRequest(http.MethodPost, "/import", strings.NewReader(validGGGCharacterBody))
	recorder := httptest.NewRecorder()
	srv.handleImport(recorder, req)

	// pob-server convention: not-yet-available conditions return 501 via
	// jsonError (see handleResolve's store == nil path), not a 200 with an
	// embedded code. The error envelope is the same {"error": msg} shape
	// every other endpoint emits — that is what "mirrors /resolve" means.
	if recorder.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d: %s", recorder.Code, recorder.Body.String())
	}
	assertErrorEnvelope(t, recorder.Body.Bytes())
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
