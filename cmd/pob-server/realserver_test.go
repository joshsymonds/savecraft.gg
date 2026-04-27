package main

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Note: setupRealServer attaches a SQLite-backed BuildStore to the cache
// because /compare gates on `srv.cache.store != nil` (compare.go:381).
// Tests use a temp-dir DB so each run is isolated and auto-cleaned.

// setupRealServer constructs a Server backed by a real LuaJIT subprocess
// pool that loads PoB from $POB_DIR. Use this for integration tests that
// must observe wrapper.lua's actual emission shape — bugs in
// injectStatSources, serializeSocketGroups, serializeItems can only
// surface against real Lua.
//
// Skips the test cleanly when POB_DIR is unset (i.e. running outside the
// project's devenv shell). Tests written against this harness should not
// gate on environment beyond that — devenv.nix exports POB_DIR pointing
// at the pinned-version PoB checkout, and the production NixOS module
// uses the same source.
//
// Pool is sized to 1 to serialize Lua workloads, which makes test
// failures easier to read. Bump to 2+ if test runtime becomes a problem.
func setupRealServer(t *testing.T) *Server {
	t.Helper()
	pobDir := os.Getenv("POB_DIR")
	if pobDir == "" {
		t.Skip("POB_DIR not set — run inside the project's devenv shell")
	}
	if _, err := os.Stat(filepath.Join(pobDir, "HeadlessWrapper.lua")); err != nil {
		t.Skipf("POB_DIR=%q does not contain HeadlessWrapper.lua: %v", pobDir, err)
	}

	// wrapper.lua lives in the same directory as the test binary — the
	// test working directory IS cmd/pob-server/.
	wrapperPath, err := filepath.Abs("wrapper.lua")
	if err != nil {
		t.Fatalf("locate wrapper.lua: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, "luajit", wrapperPath, pobDir, logger)
	t.Cleanup(pool.Shutdown)

	cache := NewBuildCache(10*time.Minute, 100)
	t.Cleanup(cache.Shutdown)

	dbPath := filepath.Join(t.TempDir(), "builds.db")
	store, err := NewBuildStore(dbPath)
	if err != nil {
		t.Fatalf("open build store: %v", err)
	}
	t.Cleanup(store.Close)
	cache.store = store

	srv := &Server{
		pool:     pool,
		cache:    cache,
		client:   newResolveHTTPClient(),
		modIndex: NewModSourceIndex(),
		log:      logger,
	}
	return srv
}

// realServerHTTP wraps the Server's mux in an httptest.Server so tests
// can issue real HTTP requests over the wire. Mirrors main.go's mux
// setup; keep the route list in sync.
func realServerHTTP(t *testing.T, srv *Server) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/calc", srv.authMiddleware(srv.handleCalc))
	mux.HandleFunc("/resolve", srv.authMiddleware(srv.handleResolve))
	mux.HandleFunc("/modify", srv.authMiddleware(srv.handleModify))
	mux.HandleFunc("/nearby", srv.authMiddleware(srv.handleNearby))
	mux.HandleFunc("/audit", srv.authMiddleware(srv.handleAudit))
	mux.HandleFunc("/build/", srv.authMiddleware(srv.handleGetBuild))
	mux.HandleFunc("/compare", srv.authMiddleware(srv.handleCompare))
	mux.HandleFunc("/admin/refresh-trade-stats", srv.authMiddleware(srv.handleRefreshTradeStats))
	mux.HandleFunc("/health", srv.handleHealth)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

// readFixture loads testdata/<name>.xml. Failures are fatal — fixtures
// are checked into the tree, so a missing file is a setup error, not a
// runtime condition the test should tolerate.
func readFixture(t *testing.T, name string) string {
	t.Helper()
	path := filepath.Join("testdata", name+".xml")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %s: %v", path, err)
	}
	return string(data)
}
