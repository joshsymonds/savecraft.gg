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
