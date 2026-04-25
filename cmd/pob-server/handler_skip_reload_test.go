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

// captureMockPool builds a Pool whose subprocess captures every JSON request
// to capturePath (one line per request) and emits responses from responsesPath
// (one line per response, in order). Returns the pool and a function that
// reads back the captured requests as parsed objects.
//
// The mock script reads stdin line-by-line, appending each request to the
// capture file and emitting the corresponding response from the response file
// — modeled on the existing pattern in handler_test.go but extended for
// multi-request flows (modify needs only one Send; nearby/audit need two).
func captureMockPool(t *testing.T, responseLines []string) (*Pool, func() []map[string]any) {
	t.Helper()
	dir := t.TempDir()
	capturePath := filepath.Join(dir, "captured.jsonl")
	responsesPath := filepath.Join(dir, "responses.jsonl")

	if err := os.WriteFile(responsesPath, []byte(strings.Join(responseLines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	scriptPath := filepath.Join(dir, "mock-pob.sh")
	script := `#!/bin/sh
exec 3< "` + responsesPath + `"
while IFS= read -r line; do
  printf '%s\n' "$line" >> "` + capturePath + `"
  IFS= read -r response <&3 || break
  printf '%s\n' "$response"
done
`
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	bashPath, err := exec.LookPath("bash")
	if err != nil {
		t.Skip("bash not available")
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(2, 5*time.Minute, bashPath, scriptPath, dir, logger)

	return pool, func() []map[string]any {
		raw, err := os.ReadFile(capturePath)
		if err != nil {
			t.Fatalf("read capture: %v", err)
		}
		var out []map[string]any
		for line := range strings.SplitSeq(strings.TrimSpace(string(raw)), "\n") {
			if line == "" {
				continue
			}
			var obj map[string]any
			if err := json.Unmarshal([]byte(line), &obj); err != nil {
				t.Fatalf("parse captured line %q: %v", line, err)
			}
			out = append(out, obj)
		}
		return out
	}
}

func newTestSrv(t *testing.T, pool *Pool) *Server {
	t.Helper()
	cache := &BuildCache{
		builds:     make(map[string]cachedBuild),
		ttl:        10 * time.Minute,
		maxEntries: 100,
		nowFunc:    time.Now,
		cancel:     func() {},
	}
	return &Server{pool: pool, cache: cache, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

// minimalCalcResponse is a synthetic /calc Lua response with all the keys the
// real wrapper produces, padded just enough to satisfy filterSections without
// errors. Reused across tests.
const minimalCalcResponse = `{"type":"result","data":{` +
	`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
	`"summary":{"CombinedDPS":100000,"Life":6728,"LifeUnreserved":6728,"LifeUnreservedPercent":100,` +
	`"EnergyShield":2000,"Mana":500,` +
	`"Armour":5000,"Evasion":3000,"FireResist":75,"ColdResist":75,` +
	`"LightningResist":75,"ChaosResist":40,"BlockChance":30,` +
	`"SpellSuppressionChance":100,"MovementSpeedMod":1.5,` +
	`"Str":100,"Dex":150,"Int":200,"FlaskEffect":50,"FlaskChargeGen":10,` +
	`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
	`"EnemyCurseLimit":1,"TotalDPS":100000},` +
	`"section_index":[],"sections":{}}}`

// TestCalcSendsLoadedBuildIDOnFirstRequest: the very first request on a
// fresh process should carry loadedBuildId="" so wrapper.lua loads the XML.
func TestCalcSendsLoadedBuildIDOnFirstRequest(t *testing.T) {
	pool, captured := captureMockPool(t, []string{minimalCalcResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)

	req := httptest.NewRequest(http.MethodPost, "/calc", strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`))
	rec := httptest.NewRecorder()
	srv.handleCalc(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	requests := captured()
	if len(requests) != 1 {
		t.Fatalf("expected 1 captured request, got %d", len(requests))
	}
	if loaded, _ := requests[0]["loadedBuildId"].(string); loaded != "" {
		t.Fatalf("first request loadedBuildId should be empty/absent, got %q", loaded)
	}
}

// TestModifySkipReloadAfterCalc: a /modify on a build resolved by a prior
// /calc reuses the same pinned process and sends loadedBuildId=parentID so
// wrapper.lua can skip the reload. This is the primary win — /modify is the
// hot iteration path.
func TestModifySkipReloadAfterCalc(t *testing.T) {
	modifyResponse := `{"type":"result","data":{` +
		`"character":{"class":"Witch","ascendancy":"Occultist","level":99},` +
		`"summary":{"CombinedDPS":150000,"Life":6728,"LifeUnreserved":6728,"LifeUnreservedPercent":100,` +
		`"EnergyShield":2000,"Mana":500,"Armour":5000,"Evasion":3000,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":30,"SpellSuppressionChance":100,"MovementSpeedMod":1.5,` +
		`"Str":100,"Dex":150,"Int":200,"FlaskEffect":50,"FlaskChargeGen":10,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":150000},` +
		`"section_index":[],"sections":{}},"xml":"<PathOfBuilding modified=\"1\"/>"}`
	pool, captured := captureMockPool(t, []string{minimalCalcResponse, modifyResponse})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	// Seed: /calc with the original XML.
	rec1 := httptest.NewRecorder()
	srv.handleCalc(rec1, httptest.NewRequest(http.MethodPost, "/calc",
		strings.NewReader(`{"buildXml":"<PathOfBuilding/>"}`)))
	if rec1.Code != http.StatusOK {
		t.Fatalf("calc: %d %s", rec1.Code, rec1.Body.String())
	}
	var calcResp struct {
		BuildID string `json:"buildId"`
	}
	_ = json.Unmarshal(rec1.Body.Bytes(), &calcResp)

	// /modify against the calc'd buildID — should reuse the pinned process.
	modifyBody := `{"buildId":"` + calcResp.BuildID + `","operations":[{"op":"set_level","level":95}]}`
	rec2 := httptest.NewRecorder()
	srv.handleModify(rec2, httptest.NewRequest(http.MethodPost, "/modify", strings.NewReader(modifyBody)))
	if rec2.Code != http.StatusOK {
		t.Fatalf("modify: %d %s", rec2.Code, rec2.Body.String())
	}

	requests := captured()
	if len(requests) != 2 {
		t.Fatalf("expected 2 captured requests, got %d", len(requests))
	}
	// First: /calc on a fresh process, loadedBuildId empty.
	if loaded, _ := requests[0]["loadedBuildId"].(string); loaded != "" {
		t.Fatalf("calc loadedBuildId should be empty, got %q", loaded)
	}
	// Second: /modify on the pinned process. loadedBuildId should match the
	// calc's buildID — wrapper.lua's _lastLoadedBuildId equals this string,
	// so it skips loadBuildFromXML.
	if loaded, _ := requests[1]["loadedBuildId"].(string); loaded != calcResp.BuildID {
		t.Fatalf("modify loadedBuildId=%q, expected %q (skip-reload signal)", loaded, calcResp.BuildID)
	}
}

// newInMemoryStoreForTest builds a SQLite store backed by an in-memory DB so
// /modify path tests (which require the store) work without a temp file.
func newInMemoryStoreForTest(t *testing.T) *BuildStore {
	t.Helper()
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}
