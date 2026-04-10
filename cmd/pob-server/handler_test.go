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

// TestCalcResponseShape verifies the /calc response has the grouped section structure:
// {buildId, data: {character, summary, section_index, sections}}.
func TestCalcResponseShape(t *testing.T) {
	// Mock PoB response with the new grouped section structure
	mockScript := filepath.Join(t.TempDir(), "mock-pob.sh")
	mockResponse := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6728,"EnergyShield":2000,"Mana":500,` +
		`"Armour":5000,"Evasion":3000,"FireResist":75,"ColdResist":75,` +
		`"LightningResist":75,"ChaosResist":40,"BlockChance":30,` +
		`"SpellSuppressionChance":100,"MovementSpeedMod":1.5,` +
		`"Str":100,"Dex":150,"Int":200,"FlaskEffect":50,"FlaskChargeGen":10,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[` +
		`{"id":"offense","name":"Offense","description":"Hit damage, DPS"},` +
		`{"id":"defense","name":"Defense","description":"Armour, evasion, ES"}` +
		`],` +
		`"sections":{` +
		`"offense":{"TotalDPS":100000,"CritChance":45.5,"Speed":2.1},` +
		`"defense":{"Armour":5000,"Evasion":3000,"EnergyShield":2000},` +
		`"socket_groups":[],` +
		`"items":{},` +
		`"keystones":["Acrobatics"],` +
		`"tree":{"version":"3.25","allocated_nodes":95}` +
		`}}}`

	if err := os.WriteFile(mockScript, []byte("#!/bin/sh\nread line\necho '"+mockResponse+"'\n"), 0o755); err != nil {
		t.Fatal(err)
	}

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

	// Parse data envelope
	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data field is not an object: %v", err)
	}

	// data must NOT contain a nested "type" field (PoB envelope must be unwrapped)
	if _, ok := data["type"]; ok {
		t.Fatal("data contains 'type' — PoB envelope was not unwrapped")
	}

	// Required top-level keys in data (no sections when param absent)
	for _, key := range []string{"character", "summary", "section_index"} {
		if _, ok := data[key]; !ok {
			t.Fatalf("data missing required key %q, got keys: %v", key, keysOf(data))
		}
	}

	// sections must NOT be present when no ?sections= param
	if _, ok := data["sections"]; ok {
		t.Fatal("data should not contain 'sections' when no sections param is provided")
	}

	// Verify summary has the expected fixed keys
	var summary map[string]json.RawMessage
	if err := json.Unmarshal(data["summary"], &summary); err != nil {
		t.Fatalf("summary is not an object: %v", err)
	}
	expectedSummaryKeys := []string{
		"CombinedDPS", "TotalDPS", "Life", "EnergyShield", "Mana",
		"Armour", "Evasion", "FireResist", "ColdResist", "LightningResist",
		"ChaosResist", "BlockChance", "SpellSuppressionChance", "MovementSpeedMod",
		"Str", "Dex", "Int", "FlaskEffect", "FlaskChargeGen",
		"LootQuantityNormalEnemies", "LootRarityMagicEnemies", "EnemyCurseLimit",
	}
	for _, key := range expectedSummaryKeys {
		if _, ok := summary[key]; !ok {
			t.Errorf("summary missing key %q", key)
		}
	}

	// Verify section_index is an array with id/name/description
	var sectionIndex []map[string]string
	if err := json.Unmarshal(data["section_index"], &sectionIndex); err != nil {
		t.Fatalf("section_index is not an array: %v", err)
	}
	if len(sectionIndex) < 2 {
		t.Fatalf("expected at least 2 section index entries, got %d", len(sectionIndex))
	}
	for _, entry := range sectionIndex {
		if entry["id"] == "" || entry["name"] == "" || entry["description"] == "" {
			t.Errorf("section_index entry missing fields: %v", entry)
		}
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
	_ = srv.cache.store.Put(id, xml, `{"summary":{},"section_index":[],"sections":{}}`, "", "")

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
	_ = srv.cache.store.Put(id, xml, `{"summary":{},"section_index":[],"sections":{}}`, "", "")

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
	summary := `{"character":{"class":"Witch"},"summary":{"Life":6728},"section_index":[],"sections":{}}`
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

// storedSummary is a realistic grouped calc result stored in SQLite.
const storedSummary = `{` +
	`"character":{"class":"Witch","ascendancy":"Occultist","level":95},` +
	`"summary":{"CombinedDPS":150000,"Life":5200,"EnergyShield":2000},` +
	`"section_index":[` +
	`{"id":"offense","name":"Offense","description":"Hit damage"},` +
	`{"id":"defense","name":"Defense","description":"Armour, evasion"}` +
	`],` +
	`"sections":{` +
	`"offense":{"TotalDPS":150000,"CritChance":45.5,"Speed":2.1},` +
	`"defense":{"Armour":5000,"Evasion":3000,"EnergyShield":2000},` +
	`"resistances":{"FireResist":75,"ColdResist":75},` +
	`"socket_groups":[],` +
	`"items":{},` +
	`"keystones":["Acrobatics"],` +
	`"tree":{"version":"3.25","allocated_nodes":95}` +
	`}}`

func TestSummaryWithoutSectionsParam(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, storedSummary, "", "")

	req := httptest.NewRequest(http.MethodGet, "/build/"+id+"/summary", nil)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Must have character, summary, section_index
	for _, key := range []string{"character", "summary", "section_index"} {
		if _, ok := data[key]; !ok {
			t.Errorf("data missing %q", key)
		}
	}

	// Must NOT have sections when no ?sections= param
	if _, ok := data["sections"]; ok {
		t.Fatal("data should NOT contain 'sections' when no sections param is provided")
	}
}

func TestSummaryWithSectionsParam(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, storedSummary, "", "")

	req := httptest.NewRequest(
		http.MethodGet,
		"/build/"+id+"/summary?sections=offense,defense",
		nil,
	)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Must have character, summary, section_index, sections
	for _, key := range []string{"character", "summary", "section_index", "sections"} {
		if _, ok := data[key]; !ok {
			t.Errorf("data missing %q", key)
		}
	}

	// sections must contain only offense and defense
	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}

	if _, ok := sections["offense"]; !ok {
		t.Error("sections missing 'offense'")
	}
	if _, ok := sections["defense"]; !ok {
		t.Error("sections missing 'defense'")
	}
	// Must not contain unrequested sections
	if _, ok := sections["resistances"]; ok {
		t.Error("sections should not contain 'resistances' (not requested)")
	}
	if _, ok := sections["socket_groups"]; ok {
		t.Error("sections should not contain 'socket_groups' (not requested)")
	}
}

func TestSummaryWithUnknownSections(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, storedSummary, "", "")

	req := httptest.NewRequest(
		http.MethodGet,
		"/build/"+id+"/summary?sections=nonexistent,bogus",
		nil,
	)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// sections should be present but empty (unknown sections silently ignored)
	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}
	if len(sections) != 0 {
		t.Fatalf("expected empty sections for unknown names, got %d keys", len(sections))
	}
}

func TestCalcWithSectionsParam(t *testing.T) {
	// Mock PoB response with the grouped section structure
	mockScript := filepath.Join(t.TempDir(), "mock-pob.sh")
	mockResponse := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6728},` +
		`"section_index":[{"id":"offense","name":"Offense","description":"DPS"}],` +
		`"sections":{` +
		`"offense":{"TotalDPS":100000,"CritChance":45.5},` +
		`"defense":{"Armour":5000},` +
		`"socket_groups":[]` +
		`}}}`

	if err := os.WriteFile(mockScript, []byte("#!/bin/sh\nread line\necho '"+mockResponse+"'\n"), 0o755); err != nil {
		t.Fatal(err)
	}

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
	req := httptest.NewRequest(http.MethodPost, "/calc?sections=offense", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	srv.handleCalc(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Must have sections with only offense
	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}
	if _, ok := sections["offense"]; !ok {
		t.Error("sections missing 'offense'")
	}
	if _, ok := sections["defense"]; ok {
		t.Error("sections should not contain 'defense' (not requested)")
	}
}

func TestModifyWithSectionsParam(t *testing.T) {
	// Mock PoB that handles both calc (for initial build) and modify requests
	mockScript := filepath.Join(t.TempDir(), "mock-pob.sh")
	mockResponse := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":200000,"Life":6728},` +
		`"section_index":[{"id":"offense","name":"Offense","description":"DPS"}],` +
		`"sections":{` +
		`"offense":{"TotalDPS":200000,"CritChance":50},` +
		`"defense":{"Armour":6000}` +
		`}},"xml":"<PathOfBuilding/>"}`

	if err := os.WriteFile(mockScript, []byte("#!/bin/sh\nread line\necho '"+mockResponse+"'\n"), 0o755); err != nil {
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
	t.Cleanup(func() { store.Close() })

	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
		store:      store,
	}

	srv := &Server{pool: pool, cache: cache, log: logger}

	// First, create a build so we have a buildId
	xml := "<PathOfBuilding/>"
	buildID := cache.Put(xml)
	_ = store.Put(buildID, xml, `{}`, "", "")

	body := `{"buildId":"` + buildID + `","operations":[{"op":"set_level","level":95}]}`
	req := httptest.NewRequest(
		http.MethodPost,
		"/modify?sections=offense",
		strings.NewReader(body),
	)
	rec := httptest.NewRecorder()
	srv.handleModify(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Must have sections with only offense
	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}
	if _, ok := sections["offense"]; !ok {
		t.Error("sections missing 'offense'")
	}
	if _, ok := sections["defense"]; ok {
		t.Error("sections should not contain 'defense' (not requested)")
	}
}

func TestResolveCachedWithSectionsParam(t *testing.T) {
	srv := newTestServer(t)

	xml := "<PathOfBuilding/>"
	id := srv.cache.Put(xml)
	_ = srv.cache.store.Put(id, xml, storedSummary, "https://pob.savecraft.gg/"+id, "")

	// Simulate the cached resolve path by hitting /build/{id}/summary with sections
	req := httptest.NewRequest(
		http.MethodGet,
		"/build/"+id+"/summary?sections=defense,resistances",
		nil,
	)
	rec := httptest.NewRecorder()
	srv.handleGetBuild(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}

	var data map[string]json.RawMessage
	if err := json.Unmarshal(resp["data"], &data); err != nil {
		t.Fatalf("data is not an object: %v", err)
	}

	// Must have character, summary, section_index, sections
	for _, key := range []string{"character", "summary", "section_index", "sections"} {
		if _, ok := data[key]; !ok {
			t.Errorf("data missing %q", key)
		}
	}

	var sections map[string]json.RawMessage
	if err := json.Unmarshal(data["sections"], &sections); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}

	// Only defense and resistances requested
	if _, ok := sections["defense"]; !ok {
		t.Error("sections missing 'defense'")
	}
	if _, ok := sections["resistances"]; !ok {
		t.Error("sections missing 'resistances'")
	}
	if _, ok := sections["offense"]; ok {
		t.Error("sections should not contain 'offense' (not requested)")
	}
}
