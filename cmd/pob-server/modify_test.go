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

func TestModifyHandlerRejectsGet(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/modify", nil)
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 405 {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}

func TestModifyHandlerRejectsEmptyBuildID(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestModifyHandlerRejectsEmptyOps(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, "{}", "", "")

	body := `{"buildId":"` + id + `","operations":[]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestModifyHandlerReturns404ForMissingBuild(t *testing.T) {
	srv := newTestServer(t)

	body := `{"buildId":"nonexistent","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 404 {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

// Production log 2026-04-18T07:19:22: a user's `set_item` operation
// with a malformed item text crashed PoB's Lua Item class 5 times in
// a row. With the Go-side pre-validator wired in, the request should
// now be rejected at the HTTP layer with a specific error before the
// LuaJIT subprocess is even acquired — no pool use, no crash surface.
func TestModifyHandlerRejectsSetItemMissingRarity(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, "{}", "", "")

	// Missing "Rarity:" header.
	body := `{"buildId":"` + id + `","operations":[{"op":"set_item","slot":"Weapon 1","text":"Kinetic Wand\nAdds 10 to 50 Lightning Damage"}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Rarity:") {
		t.Errorf("error body should cite 'Rarity:' header, got: %s", rec.Body.String())
	}
}

// The exact production-captured crashing text: no title line, so
// "Rarity:" is present but the PoB "--------" separator between
// title/base and modifiers is missing. Must be rejected in Go.
func TestModifyHandlerRejectsSetItemMissingSeparator(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, "{}", "", "")

	productionCrashText := `Kinetic Wand\nRarity: Rare\nCannot roll Caster Modifiers\nAdds 20 to 360 Lightning Damage\nAdds 14 to 28 Fire Damage\nAdds 14 to 28 Cold Damage\n38% increased Critical Strike Chance\n+45% to Global Critical Strike Multiplier\nCan have up to 3 Crafted Modifiers`
	body := `{"buildId":"` + id + `","operations":[{"op":"set_item","slot":"Weapon 1","text":"` + productionCrashText + `"}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 400 {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "--------") {
		t.Errorf("error body should cite '--------' separator, got: %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "operation 1") {
		t.Errorf("error body should identify the offending operation index, got: %s", rec.Body.String())
	}
}

// Production MCP log 2026-04-18T07:15:32 captured
// `swap_gem: gem not found: Added Lightning Damage Support` — the
// AI used the wrong canonical name. With the Lua suffix-strip in
// place (handled at wrapper.lua) AND the Go-side fuzzy enrichment
// wired into the error response, the caller should see suggestions
// and a pointer to the gem_search reference module.
func TestModifyHandlerEnrichesGemNotFoundError(t *testing.T) {
	// Mock bash: dispatches by request type. `modify` returns a
	// gem-not-found Lua error; `list_gems` returns a canned name list
	// that the Go side will Levenshtein-rank against the bad name.
	mockScript := filepath.Join(t.TempDir(), "mock-gem-enrich.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
while read line; do
  case "$line" in
    *'"type":"modify"'*)
      echo '{"type":"error","message":"operation 1: swap_gem: gem not found: Added Lightning Damgae"}'
      ;;
    *'"type":"list_gems"'*)
      echo '{"type":"result","data":{"gems":["Added Lightning Damage","Added Cold Damage","Hatred","Ruthless Support"]}}'
      ;;
  esac
done
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}
	origXML := "<PathOfBuilding/>"
	origID := cache.Put(origXML)
	_ = store.Put(origID, origXML, "{}", "", "")
	srv := &Server{pool: pool, cache: cache, log: logger}

	// A valid swap_gem op in shape (Go validator doesn't check gem
	// names); the Lua mock is what returns the gem-not-found error.
	body := `{"buildId":"` + origID + `","operations":[{"op":"swap_gem","socket_group":0,"gem_index":0,"new_gem":"Added Lightning Damgae"}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	// 422 for a PoB modification failure (preserving current behavior).
	if rec.Code != 422 {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
	respBody := rec.Body.String()

	// Must still carry the original phrase so any tooling matching on
	// it keeps working.
	if !strings.Contains(respBody, "gem not found") {
		t.Errorf("response missing original 'gem not found' phrase: %s", respBody)
	}
	// The Levenshtein top match for "Added Lightning Damgae" should be
	// "Added Lightning Damage".
	if !strings.Contains(respBody, "Added Lightning Damage") {
		t.Errorf("response missing fuzzy suggestion 'Added Lightning Damage': %s", respBody)
	}
	// Must point at the reference module for further discovery.
	if !strings.Contains(respBody, "gem_search") {
		t.Errorf("response missing 'gem_search' pointer: %s", respBody)
	}
}

// Regression: non-gem errors (e.g. allocate_node failures) pass
// through without gem_search enrichment.
func TestModifyHandlerDoesNotEnrichNonGemErrors(t *testing.T) {
	mockScript := filepath.Join(t.TempDir(), "mock-other-err.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
while read line; do
  case "$line" in
    *'"type":"modify"'*)
      echo '{"type":"error","message":"operation 1: allocate_node: node not found: Nonexistent Node"}'
      ;;
    *'"type":"list_gems"'*)
      echo '{"type":"result","data":{"gems":["Added Lightning Damage"]}}'
      ;;
  esac
done
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}
	origXML := "<PathOfBuilding/>"
	origID := cache.Put(origXML)
	_ = store.Put(origID, origXML, "{}", "", "")
	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildId":"` + origID + `","operations":[{"op":"allocate_node","name":"Nonexistent Node"}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 422 {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
	respBody := rec.Body.String()
	if strings.Contains(respBody, "gem_search") {
		t.Errorf("non-gem error leaked gem_search hint: %s", respBody)
	}
	if !strings.Contains(respBody, "allocate_node") {
		t.Errorf("non-gem error lost original context: %s", respBody)
	}
}

// Operations other than set_item must pass through the validator
// untouched; no false rejections.
func TestModifyHandlerPassesThroughNonSetItemOps(t *testing.T) {
	// Using httptest with mock bash: if validation correctly ignores
	// non-set_item ops, the request reaches the pool and returns 200.
	mockScript := filepath.Join(t.TempDir(), "mock-passthrough.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo '{"type":"result","data":{"character":{"class":"Templar","ascendancy":"Guardian","level":90},"summary":{"Life":5000}},"xml":"<PathOfBuilding><Build level=\"90\"/></PathOfBuilding>"}'
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}
	origXML := "<PathOfBuilding/>"
	origID := cache.Put(origXML)
	_ = store.Put(origID, origXML, "{}", "", "")
	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildId":"` + origID + `","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestModifyEquipFlaskWithMockPoB(t *testing.T) {
	// Mock script: reads a modify request with equip_flask, returns a canned result
	// where PhysicalMaximumHitTaken increased (showing flask stats are applied).
	mockScript := filepath.Join(t.TempDir(), "mock-flask.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo '{"type":"result","data":{"character":{"class":"Templar","ascendancy":"Hierophant","level":94},"summary":{"Life":20854,"CombinedDPS":5222051},"section_index":[],"sections":{"ehp":{"PhysicalMaximumHitTaken":25000,"ColdMaximumHitTaken":95000}}},"xml":"<PathOfBuilding><Build level=\"94\"/></PathOfBuilding>"}'
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}

	origXML := "<PathOfBuilding/>"
	origID := cache.Put(origXML)
	_ = store.Put(origID, origXML, `{"summary":{"Life":20854}}`, "", "")

	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildId":"` + origID + `","operations":[{"op":"equip_flask","name":"Taste of Hate","slot":"Flask 2"}]}`
	req := httptest.NewRequest(
		http.MethodPost,
		"/modify?sections=ehp",
		strings.NewReader(body),
	)
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	// Must have buildId and data
	if _, ok := resp["buildId"]; !ok {
		t.Fatal("response missing buildId")
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Sections should contain ehp with flask-affected stats
	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}
	if _, ok := sections["ehp"]; !ok {
		t.Error("sections missing 'ehp'")
	}

	// Verify PhysicalMaximumHitTaken is present in ehp section
	var ehp map[string]json.RawMessage
	if err := json.Unmarshal(sections["ehp"], &ehp); err != nil {
		t.Fatalf("ehp is not an object: %v", err)
	}
	if _, ok := ehp["PhysicalMaximumHitTaken"]; !ok {
		t.Error("ehp missing PhysicalMaximumHitTaken")
	}
}

func TestModifyHandlerWithMockPoB(t *testing.T) {
	// Mock script: reads a modify request, returns a canned result with modified XML.
	mockScript := filepath.Join(t.TempDir(), "mock-modify.sh")
	if err := os.WriteFile(mockScript, []byte(`#!/bin/sh
read line
echo '{"type":"result","data":{"character":{"class":"Marauder","ascendancy":"Chieftain","level":95},"stats":{"Life":7000}},"xml":"<PathOfBuilding><Build level=\"95\"/></PathOfBuilding>"}'
`), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, bashPath, mockScript, t.TempDir(), logger)
	defer pool.Shutdown()

	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}

	// Seed a build to modify
	origXML := "<PathOfBuilding><Build level=\"90\"/></PathOfBuilding>"
	origID := cache.Put(origXML)
	_ = store.Put(origID, origXML, `{"stats":{"Life":5000}}`, "", "")

	srv := &Server{pool: pool, cache: cache, log: logger}

	body := `{"buildId":"` + origID + `","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(body))
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != 200 {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	// Must have buildId
	if _, ok := resp["buildId"]; !ok {
		t.Fatal("response missing buildId")
	}

	// buildId should be different from original (modified XML)
	var newID string
	if err := json.Unmarshal(resp["buildId"], &newID); err != nil {
		t.Fatal(err)
	}
	if newID == origID {
		t.Fatal("modified build should have different buildId")
	}

	// Verify parent_id lineage
	meta, err := store.GetMeta(newID)
	if err != nil {
		t.Fatalf("new build should be in store: %v", err)
	}
	if meta.ParentID != origID {
		t.Fatalf(
			"parent_id should be %q, got %q", origID, meta.ParentID,
		)
	}
}
