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
	"strconv"
	"strings"
	"testing"
	"time"
)

// mockCalcPool returns a Pool backed by a bash mock that always answers a
// "calc" request with a canned result carrying the given Life value — a
// sentinel that lets a test tell which pool actually served a request.
func mockCalcPool(t *testing.T, game string, life int, logger *slog.Logger) *Pool {
	t.Helper()
	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}
	mockScript := filepath.Join(t.TempDir(), "mock-pob.sh")
	resp := `{"type":"result","data":{"character":{"class":"Witch","level":1},` +
		`"summary":{"Life":` + strconv.Itoa(life) + `},"section_index":[],"sections":{}}}`
	if err := os.WriteFile(mockScript, []byte("#!/bin/sh\nread line\necho '"+resp+"'\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), game, logger)
	t.Cleanup(pool.Shutdown)
	return pool
}

// TestCalcRoutesGameToCorrectPool verifies /calc picks the pool matching
// the build XML's detected game: a <PathOfBuilding> root goes to the poe1
// pool, a <PathOfBuilding2> root goes to the poe2 pool — proven by each
// pool's mock LuaJIT process returning a distinguishable Life value.
func TestCalcRoutesGameToCorrectPool(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	poolPoE := mockCalcPool(t, GamePoE, 1111, logger)
	poolPoE2 := mockCalcPool(t, GamePoE2, 2222, logger)

	cache := NewBuildCache(10*time.Minute, 100)
	defer cache.Shutdown()

	srv := &Server{pool: poolPoE, pool2: poolPoE2, cache: cache, log: logger}

	poe1Life := calcLife(t, srv, `<PathOfBuilding><Build level="1"/></PathOfBuilding>`)
	if poe1Life != 1111 {
		t.Fatalf("poe1 build routed to wrong pool: Life=%d, want 1111", poe1Life)
	}

	poe2Life := calcLife(t, srv, `<PathOfBuilding2><Build level="1"/></PathOfBuilding2>`)
	if poe2Life != 2222 {
		t.Fatalf("poe2 build routed to wrong pool: Life=%d, want 2222", poe2Life)
	}
}

// TestCalcRejectsPoE2WhenPoolNotConfigured verifies a PoE2-shaped build
// gets a clear 400 (not a crash, and not silently routed to the poe1
// pool) when the server has no poe2 pool wired up — the default shape
// for a dev/test Server that only sets `pool`.
func TestCalcRejectsPoE2WhenPoolNotConfigured(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	poolPoE := mockCalcPool(t, GamePoE, 1111, logger)

	cache := NewBuildCache(10*time.Minute, 100)
	defer cache.Shutdown()

	srv := &Server{pool: poolPoE, cache: cache, log: logger}

	body := `{"buildXml":"<PathOfBuilding2><Build level=\"1\"/></PathOfBuilding2>"}`
	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

// calcLife POSTs buildXml to /calc and returns the response's summary.Life.
func calcLife(t *testing.T, srv *Server, buildXML string) int {
	t.Helper()
	bodyJSON, err := json.Marshal(map[string]string{"buildXml": buildXML})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader(string(bodyJSON)))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var env struct {
		Data struct {
			Summary struct {
				Life int `json:"Life"`
			} `json:"summary"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode response: %v (body: %s)", err, recorder.Body.String())
	}
	return env.Data.Summary.Life
}
