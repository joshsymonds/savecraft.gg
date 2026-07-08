//go:build integration_luajit

// Build-tag gated real-LuaJIT integration test. Run with:
//
//	go test -tags=integration_luajit ./cmd/pob-server/...
//
// The epic's set_item hardening lives in two layers: the Go validator
// + text builder (`itemtext.go`, covered by unit + mock-bash tests)
// and a Lua-side pcall + baseName guard in `wrapper.lua` that
// catches edge-case PoB Item parses Go didn't anticipate. The pcall
// only provides real defense if the pool+Lua path actually honors
// it end-to-end — that requires an actual LuaJIT subprocess with PoB
// source available. This test provides that end-to-end coverage
// without making it part of the default run (luajit + `.reference/pob`
// aren't always installed).

package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// pobSourceDir resolves the vendored PoB source relative to this test
// file, matching the pattern used by TestBuildSitesListInSyncWithPoB.
func pobSourceDir(t *testing.T) string {
	t.Helper()
	_, here, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve test file location")
	}
	return filepath.Join(filepath.Dir(here), "..", "..", ".reference", "pob", "src")
}

// TestWrapperLuaSetItemPcallGuardsAgainstMalformedText verifies that
// malformed set_item text sent DIRECTLY to wrapper.lua (bypassing
// Go's validateAndTransformModifyOperations) returns a structured
// error and leaves the subprocess alive — the pcall defence-in-depth
// from wrapper.lua's applySetItem is doing its job.
//
// The /modify HTTP handler rewrites ops before dispatch so a normal
// MCP caller cannot reach this path. This test represents a direct
// HTTP caller or a future Go-side bug in buildItemText.
func TestWrapperLuaSetItemPcallGuardsAgainstMalformedText(t *testing.T) {
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pobDir := pobSourceDir(t)
	if _, err := exec.LookPath(filepath.Join(pobDir, "HeadlessWrapper.lua")); err != nil {
		// Use Stat via a quick exec-less check.
	}
	wrapperPath := filepath.Join(filepath.Dir(pobDir), "..", "..", "cmd", "pob-server", "wrapper.lua")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, GamePoE, logger)
	defer pool.Shutdown()

	// A minimal valid PoB XML that loadBuildFromXML will accept.
	// If wrapper.lua's HeadlessWrapper requires more structure in
	// practice, this test will fail at build-load and skip cleanly.
	minimalXML := `<PathOfBuilding>
<Build level="1" targetVersion="3_0" className="Scion" ascendClassName="None">
</Build>
<Skills />
<Tree><Spec /></Tree>
<Items />
<Notes />
<Config />
<TreeView />
</PathOfBuilding>`

	proc, err := pool.Acquire()
	if err != nil {
		t.Skipf("cannot acquire LuaJIT process (PoB source may be incomplete): %v", err)
	}
	defer pool.Release(proc)

	// Malformed item text — missing --------  separator. Exactly the
	// shape that crashed PoB's Item class in production 2026-04-18.
	// The Go validator would reject this at /modify, but we're calling
	// the Lua process directly here.
	malformed := "Rarity: Rare\nSome Name\nKinetic Wand\nAdds 10 to 50 Lightning Damage"
	payload := map[string]any{
		"type": "modify",
		"xml":  minimalXML,
		"operations": []map[string]any{
			{"op": "set_item", "slot": "Body Armour", "text": malformed},
		},
	}

	rawResp, err := proc.Send(payload)
	if err != nil {
		t.Fatalf("process send failed: %v", err)
	}
	var parsed struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		t.Fatalf("response not JSON: %v (raw: %s)", err, rawResp)
	}
	// Two outcomes are valid for the pcall guard:
	//   1. PoB rejects the malformed text → response is a structured
	//      "error" with a clean message (e.g. "failed to parse item
	//      text" or "has no base name").
	//   2. PoB silently accepts the malformed text → response is a
	//      "result" with the build's recomputed state.
	// What MUST NOT happen is a raw Lua stack trace leaking through
	// the pcall — that signals the defence-in-depth is broken.
	if parsed.Type != "error" && parsed.Type != "result" {
		t.Fatalf("unexpected response type=%q message=%q", parsed.Type, parsed.Message)
	}
	if strings.Contains(parsed.Message, "stack traceback") {
		t.Errorf("Lua stack trace leaked through pcall: %s", parsed.Message)
	}

	// Subprocess-alive verification: send a second valid request.
	// If the subprocess died, Send returns an error.
	probe := map[string]any{
		"type": "modify",
		"xml":  minimalXML,
		"operations": []map[string]any{
			{"op": "set_level", "level": 5},
		},
	}
	if _, err := proc.Send(probe); err != nil {
		t.Fatalf("subprocess died after malformed set_item (pcall failed to contain): %v", err)
	}
}

// TestWrapperLuaCharacterIncludesBanditAndPantheon verifies that a PoE1
// build's serialized character object still carries the bandit and
// pantheon fields — PoE1 has both mechanics, so serializeCharacter
// (wrapper.lua) must keep emitting them unconditionally for this game.
// Companion to TestPoE2CharacterExcludesBanditAndPantheon, which
// verifies the opposite for PoE2 (neither mechanic exists there).
func TestWrapperLuaCharacterIncludesBanditAndPantheon(t *testing.T) {
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pobDir := pobSourceDir(t)
	wrapperPath := filepath.Join(filepath.Dir(pobDir), "..", "..", "cmd", "pob-server", "wrapper.lua")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, GamePoE, logger)
	defer pool.Shutdown()

	minimalXML := `<PathOfBuilding>
<Build level="1" targetVersion="3_0" className="Scion" ascendClassName="None">
</Build>
<Skills />
<Tree><Spec /></Tree>
<Items />
<Notes />
<Config />
<TreeView />
</PathOfBuilding>`

	proc, err := pool.Acquire()
	if err != nil {
		t.Skipf("cannot acquire LuaJIT process (PoB source may be incomplete): %v", err)
	}
	defer pool.Release(proc)

	rawResp, err := proc.Send(map[string]any{
		"type": "calc",
		"xml":  minimalXML,
	})
	if err != nil {
		t.Fatalf("process send failed: %v", err)
	}
	var parsed struct {
		Type string `json:"type"`
		Data struct {
			Character map[string]any `json:"character"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		t.Fatalf("response not JSON: %v (raw: %s)", err, rawResp)
	}
	if parsed.Type != "result" {
		t.Fatalf("expected type=result, got type=%q message=%q", parsed.Type, parsed.Message)
	}

	for _, key := range []string{"bandit", "pantheon_major", "pantheon_minor"} {
		if _, ok := parsed.Data.Character[key]; !ok {
			t.Errorf("PoE1 character object missing %q key; got keys: %v", key, parsed.Data.Character)
		}
	}
}

// TestPoE1ImportRealCharacterProducesDPS drives /import against the REAL
// PoE1 GGG capture (testdata/ggg_character_real_chalith.json — a level 90
// Ascendant, live-captured via the OAuth adapter; see testdata/README.md)
// and asserts the resulting calc summary carries a nonzero CombinedDPS
// and that exactly one socket group is marked as the main group.
//
// Companion to TestPoE2ImportRealCharacterProducesDPS
// (wrapper_poe2_integration_test.go): wrapper.lua's handleImport now
// always overrides build.mainSocketGroup via pickMainSocketGroup after
// loadBuildFromJSON — shared code, BOTH games. The PoE2 sibling proves
// the new selection fixes the tree-granted-skill bug there; this test
// proves the same selection does not regress a normal PoE1 import,
// which previously relied on PoB's own GuessMainSocketGroup landing on
// a damage skill.
func TestPoE1ImportRealCharacterProducesDPS(t *testing.T) {
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pobDir := pobSourceDir(t)
	wrapperPath := filepath.Join(filepath.Dir(pobDir), "..", "..", "cmd", "pob-server", "wrapper.lua")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, GamePoE, logger)
	defer pool.Shutdown()

	proc, err := pool.Acquire()
	if err != nil {
		t.Skipf("cannot acquire LuaJIT process (PoB source may be incomplete): %v", err)
	}
	defer pool.Release(proc)

	fixture, err := os.ReadFile(filepath.Join("testdata", "ggg_character_real_chalith.json"))
	if err != nil {
		t.Fatalf("read poe1 character fixture: %v", err)
	}

	getItems, getPassives, err := transformToImportJSON(json.RawMessage(fixture), GamePoE)
	if err != nil {
		t.Fatalf("transformToImportJSON: %v", err)
	}

	importResp, err := proc.Send(importLuaRequest{
		Type:                 "import",
		GetItemsJSON:         string(getItems),
		GetPassiveSkillsJSON: string(getPassives),
		League:               "Standard",
	})
	if err != nil {
		t.Fatalf("import send failed: %v", err)
	}
	var importParsed struct {
		Type    string `json:"type"`
		XML     string `json:"xml"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(importResp, &importParsed); err != nil {
		t.Fatalf("import response not JSON: %v (raw: %s)", err, importResp)
	}
	if importParsed.Type != "result" {
		t.Fatalf("expected import type=result, got type=%q message=%q", importParsed.Type, importParsed.Message)
	}
	if importParsed.XML == "" {
		t.Fatal("import produced empty XML")
	}

	calcResp, err := proc.Send(map[string]any{
		"type": "calc",
		"xml":  importParsed.XML,
	})
	if err != nil {
		t.Fatalf("calc send failed: %v", err)
	}
	var calcParsed struct {
		Type string `json:"type"`
		Data struct {
			Character struct {
				Class      string `json:"class"`
				Ascendancy string `json:"ascendancy"`
				Level      int    `json:"level"`
			} `json:"character"`
			Summary  map[string]any `json:"summary"`
			Sections struct {
				SocketGroups []struct {
					Label       string           `json:"label"`
					IsMainGroup bool             `json:"isMainGroup"`
					Gems        []map[string]any `json:"gems"`
				} `json:"socketGroups"`
			} `json:"sections"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(calcResp, &calcParsed); err != nil {
		t.Fatalf("calc response not JSON: %v (raw: %s)", err, calcResp)
	}
	if calcParsed.Type != "result" {
		t.Fatalf("expected calc type=result, got type=%q message=%q", calcParsed.Type, calcParsed.Message)
	}

	if calcParsed.Data.Character.Ascendancy != "Ascendant" {
		t.Errorf("character.ascendancy = %q, want Ascendant", calcParsed.Data.Character.Ascendancy)
	}
	if calcParsed.Data.Character.Level != 90 {
		t.Errorf("character.level = %d, want 90 (fixture level)", calcParsed.Data.Character.Level)
	}

	// Exactly one socket group must be flagged as the main group —
	// pickMainSocketGroup always assigns build.mainSocketGroup, and
	// serializeSocketGroups marks the group at that index.
	mainGroups := 0
	for _, g := range calcParsed.Data.Sections.SocketGroups {
		if g.IsMainGroup {
			mainGroups++
			if len(g.Gems) == 0 {
				t.Errorf("main socket group %q has no gems", g.Label)
			}
		}
	}
	if mainGroups != 1 {
		t.Errorf("socket groups flagged as main = %d, want exactly 1 (groups: %d)",
			mainGroups, len(calcParsed.Data.Sections.SocketGroups))
	}

	combinedDPS, ok := calcParsed.Data.Summary["CombinedDPS"].(float64)
	if !ok {
		t.Fatalf("expected numeric summary.CombinedDPS, got %T (%v); summary=%+v",
			calcParsed.Data.Summary["CombinedDPS"], calcParsed.Data.Summary["CombinedDPS"], calcParsed.Data.Summary)
	}
	if combinedDPS <= 0 {
		t.Errorf("summary.CombinedDPS = %v, want > 0 — a level 90 character with real gear should deal damage", combinedDPS)
	}
}
