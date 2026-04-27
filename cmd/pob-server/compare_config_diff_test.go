package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithConfig decodes a /compare body using a config-diff-aware
// shape. Mirrors compareRespWithGear's pattern from compare_gear_diff_test.go.
type compareRespWithConfig struct {
	Builds []compareEntry            `json:"builds"`
	Diffs  *compareDiffsConfigOnWire `json:"diffs"`
}

type compareDiffsConfigOnWire struct {
	Summary map[string]compareStatDiffOnWire `json:"summary"`
	Config  []compareConfigDiffOnWire        `json:"config"`
}

// compareConfigDiffOnWire mirrors the wire shape: a key + parallel-array
// of any-typed values + same flag. PerBuild values may be nil to express
// "key absent in this build's config" — distinguishes missing from set-to-zero.
type compareConfigDiffOnWire struct {
	Key      string `json:"key"`
	PerBuild []any  `json:"perBuild"`
	Same     bool   `json:"same"`
}

func decodeCompareWithConfig(t *testing.T, body []byte) compareRespWithConfig {
	t.Helper()
	var resp compareRespWithConfig
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// calcResponseWithConfig produces a wrapper.lua-shaped response with a
// custom config dict in sections.config. Heterogeneous values are
// allowed (number / bool / string) — matches the empirical config shape
// from a real PoB build.
func calcResponseWithConfig(class string, config map[string]any) string {
	configJSON, err := json.Marshal(config)
	if err != nil {
		panic(err)
	}
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{"config":` + string(configJSON) + `}}}`
}

// TestCompareConfigDiffIdenticalConfigs: two builds with identical config
// dicts produce an empty config diff array — every key is filtered as
// same-value across all builds.
func TestCompareConfigDiffIdenticalConfigs(t *testing.T) {
	cfg := map[string]any{
		"enemyLevel":              float64(84),
		"enemyIsBoss":             "Pinnacle",
		"raiseSpectreEnableBuffs": true,
	}
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithConfig("Witch", cfg),
		calcResponseWithConfig("Marauder", cfg),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithConfig(t, rec.Body.Bytes())
	if resp.Diffs != nil && len(resp.Diffs.Config) > 0 {
		t.Errorf("expected empty config diff, got %d entries: %+v",
			len(resp.Diffs.Config), resp.Diffs.Config)
	}
}

// TestCompareConfigDiffDifferingValues: same keys, different values.
// One key (enemyLevel) differs, one (enemyIsBoss) is same — only the
// differing key emits an entry.
func TestCompareConfigDiffDifferingValues(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithConfig("Witch", map[string]any{"enemyLevel": float64(84), "enemyIsBoss": "Pinnacle"}),
		calcResponseWithConfig("Marauder", map[string]any{"enemyLevel": float64(90), "enemyIsBoss": "Pinnacle"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithConfig(t, rec.Body.Bytes())
	if resp.Diffs == nil {
		t.Fatalf("expected diffs, got nil; body=%s", rec.Body.String())
	}
	if len(resp.Diffs.Config) != 1 {
		t.Fatalf("expected 1 config diff entry (enemyLevel), got %d: %+v",
			len(resp.Diffs.Config), resp.Diffs.Config)
	}
	entry := resp.Diffs.Config[0]
	if entry.Key != "enemyLevel" {
		t.Errorf("entry.Key = %q, want enemyLevel", entry.Key)
	}
	if entry.Same {
		t.Errorf("entry.Same should be false")
	}
	if len(entry.PerBuild) != 2 {
		t.Fatalf("perBuild length = %d, want 2", len(entry.PerBuild))
	}
	if entry.PerBuild[0] != float64(84) {
		t.Errorf("PerBuild[0] = %v, want 84", entry.PerBuild[0])
	}
	if entry.PerBuild[1] != float64(90) {
		t.Errorf("PerBuild[1] = %v, want 90", entry.PerBuild[1])
	}
}

// TestCompareConfigDiffMissingKey: build A has a key, build B doesn't.
// PerBuild has nil at the missing index, same=false.
func TestCompareConfigDiffMissingKey(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithConfig("Witch", map[string]any{"enemyLevel": float64(84)}),
		calcResponseWithConfig("Marauder", map[string]any{}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithConfig(t, rec.Body.Bytes())
	if len(resp.Diffs.Config) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v",
			len(resp.Diffs.Config), resp.Diffs.Config)
	}
	entry := resp.Diffs.Config[0]
	if entry.Key != "enemyLevel" {
		t.Errorf("entry.Key = %q, want enemyLevel", entry.Key)
	}
	if entry.Same {
		t.Errorf("entry.Same should be false (missing in B)")
	}
	if entry.PerBuild[0] != float64(84) {
		t.Errorf("PerBuild[0] = %v, want 84", entry.PerBuild[0])
	}
	if entry.PerBuild[1] != nil {
		t.Errorf("PerBuild[1] should be nil for missing key, got %v", entry.PerBuild[1])
	}
}

// TestCompareConfigDiffN3Mixed: three builds — enemyLevel agrees across
// all (filtered), enemyIsBoss differs in one slot, raiseSpectreEnableBuffs
// differs in another. Expect exactly 2 entries; enemyLevel must NOT appear.
func TestCompareConfigDiffN3Mixed(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithConfig(
			"Witch",
			map[string]any{"enemyLevel": float64(84), "enemyIsBoss": "Pinnacle", "raiseSpectreEnableBuffs": true},
		),
		calcResponseWithConfig(
			"Marauder",
			map[string]any{"enemyLevel": float64(84), "enemyIsBoss": "Conqueror", "raiseSpectreEnableBuffs": true},
		),
		calcResponseWithConfig(
			"Ranger",
			map[string]any{"enemyLevel": float64(84), "enemyIsBoss": "Pinnacle", "raiseSpectreEnableBuffs": false},
		),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	idC := srv.cache.Put("<C/>")
	for _, id := range []string{idA, idB, idC} {
		_ = srv.cache.store.Put(id, "<x/>", "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `","` + idC + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithConfig(t, rec.Body.Bytes())
	if len(resp.Diffs.Config) != 2 {
		t.Fatalf("expected 2 differing entries, got %d: %+v",
			len(resp.Diffs.Config), resp.Diffs.Config)
	}
	keys := make(map[string]bool, len(resp.Diffs.Config))
	for _, e := range resp.Diffs.Config {
		keys[e.Key] = true
	}
	if !keys["enemyIsBoss"] || !keys["raiseSpectreEnableBuffs"] {
		t.Errorf("expected entries for enemyIsBoss + raiseSpectreEnableBuffs, got keys: %v", keys)
	}
	if keys["enemyLevel"] {
		t.Errorf("enemyLevel should be filtered (all builds agree on 84)")
	}
}

// TestCompareConfigDiffOmittedWhenSingleSuccess: only one build resolves;
// the diffs.config field is omitted. Mirrors compareGearDiffOmittedWhenSingleSuccess.
func TestCompareConfigDiffOmittedWhenSingleSuccess(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithConfig("Witch", map[string]any{"enemyLevel": float64(84)}),
	})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)
	idA := srv.cache.Put("<A/>")
	_ = srv.cache.store.Put(idA, "<A/>", "", "", "")

	body := `{"builds":["` + idA + `","00000000000000000000000000000000"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithConfig(t, rec.Body.Bytes())
	if resp.Diffs != nil && len(resp.Diffs.Config) > 0 {
		t.Errorf("config diff should be omitted with only 1 successful build; got %v",
			resp.Diffs.Config)
	}
}
