//go:build integration_luajit

// Build-tag gated real-LuaJIT integration test for the PoE2 (Path of
// Building 2) process pool. Mirrors wrapper_integration_test.go's poe1
// coverage: these tests spawn a real LuaJIT subprocess running
// wrapper.lua against the PoE2 fork's source tree and drive it through
// the JSON-lines protocol, so PoB1/PoB2 drift (POB_GAME's TradeHelpers
// rename handling, the /import table-vs-string divergence fixed in
// pobimport.go + wrapper.lua's handleImport) surfaces here instead of
// in production.
//
// Run with:
//
//	go test -tags=integration_luajit ./cmd/pob-server/... -run TestPoE2
//
// PoB2 source location: POB2_DIR (exported by devenv.nix, pinned via
// nix/pob2-source.nix). Skips cleanly when unset or luajit is missing —
// this file never fails a run outside the project's devenv shell.

package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// pob2SourceDir resolves the pinned PathOfBuilding-PoE2 checkout from
// POB2_DIR (devenv.nix), or skips the test cleanly if unset — mirrors
// setupRealServer's POB_DIR handling (realserver_test.go) rather than
// pobSourceDir's hardcoded `.reference/pob` path, since POB2_DIR is the
// only source of a PoE2 checkout in this repo.
func pob2SourceDir(t *testing.T) string {
	t.Helper()
	pob2Dir := os.Getenv("POB2_DIR")
	if pob2Dir == "" {
		t.Skip("POB2_DIR not set — run inside the project's devenv shell")
	}
	if _, err := os.Stat(filepath.Join(pob2Dir, "HeadlessWrapper.lua")); err != nil {
		t.Skipf("POB2_DIR=%q does not contain HeadlessWrapper.lua: %v", pob2Dir, err)
	}
	return pob2Dir
}

// newPoE2Wrapper spawns a single-process PoE2 pool against POB2_DIR,
// skipping cleanly if luajit is missing or the process can't be
// acquired (incomplete checkout). Returns the pool and an already
// acquired process; callers must pool.Release(proc) and pool.Shutdown().
func newPoE2Wrapper(t *testing.T) (*Pool, *Process) {
	t.Helper()
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pob2Dir := pob2SourceDir(t)
	wrapperPath, err := filepath.Abs("wrapper.lua")
	if err != nil {
		t.Fatalf("locate wrapper.lua: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pob2Dir, GamePoE2, logger)

	proc, err := pool.Acquire()
	if err != nil {
		pool.Shutdown()
		t.Skipf("cannot acquire PoE2 LuaJIT process (PoB2 checkout may be incomplete): %v", err)
	}
	return pool, proc
}

// minimalPoE2BuildXML is a bare PathOfBuilding2 build — a level 1
// Warrior with no allocated tree nodes or items. PoB2's Build.lua
// requires the "PathOfBuilding2" root element (Modules/Build.lua's
// LoadDB rejects "PathOfBuilding", PoE1's root, with a parse error) and
// the same child-section skeleton PoE1's minimal test build uses
// (wrapper_integration_test.go's minimalXML) — with one PoE2-specific
// addition: PassiveSpecClass:Load (Classes/PassiveSpec.lua) only reads
// class/ascendancy at all when `<Spec>` carries a `nodes` attribute; an
// empty `<Spec/>` (matching PoE1's minimal skeleton) silently skips
// class selection entirely and the build defaults to whatever
// PassiveSpec was constructed with (classes[1], "Ranger" — not
// className/ascendClassName on <Build>, which Build.lua never reads).
// PassiveSpecClass:Load's legacy `classId` attribute is remapped through
// a treeVersion-specific legacyClassIdMap into a class's stable
// integerId (not the array index SelectClass indexes with directly), so
// the "new format" `classInternalId` attribute (a class's integerId,
// translated to the correct array index via
// self.tree.classIntegerIdMap) is used instead: 6 is Warrior's integerId
// (verified against TreeData/0_1/tree.lua). ascendancyInternalId="" —
// present but empty — selects "no ascendancy" (ascendClassId 0).
const minimalPoE2BuildXML = `<PathOfBuilding2>
<Build level="1" targetVersion="0_1" className="Warrior" ascendClassName="None">
</Build>
<Skills />
<Tree><Spec classInternalId="6" ascendancyInternalId="" nodes="" /></Tree>
<Items />
<Notes />
<Config />
<TreeView />
</PathOfBuilding2>`

// TestPoE2CalcAgainstRealBuild boots a real PoB2 LuaJIT process from
// POB2_DIR, loads a minimal PathOfBuilding2 build via the existing pool
// machinery (POB_GAME=poe2, set by SpawnProcess from the pool's game
// field), and reads back a calc'd stat — mirroring
// TestWrapperLuaSetItemPcallGuardsAgainstMalformedText's poe1 coverage
// (same NewPool/Acquire/Send pattern) but exercising the "calc" request
// end-to-end instead of just the set_item pcall guard.
func TestPoE2CalcAgainstRealBuild(t *testing.T) {
	pool, proc := newPoE2Wrapper(t)
	defer pool.Shutdown()
	defer pool.Release(proc)

	rawResp, err := proc.Send(map[string]any{
		"type": "calc",
		"xml":  minimalPoE2BuildXML,
	})
	if err != nil {
		t.Fatalf("process send failed: %v", err)
	}

	var parsed struct {
		Type string `json:"type"`
		Data struct {
			Character struct {
				Class string `json:"class"`
				Level int    `json:"level"`
			} `json:"character"`
			Summary map[string]any `json:"summary"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		t.Fatalf("response not JSON: %v (raw: %s)", err, rawResp)
	}
	if parsed.Type != "result" {
		t.Fatalf("expected type=result, got type=%q message=%q", parsed.Type, parsed.Message)
	}

	if parsed.Data.Character.Class != "Warrior" {
		t.Errorf("character.class = %q, want Warrior", parsed.Data.Character.Class)
	}
	if parsed.Data.Character.Level != 1 {
		t.Errorf("character.level = %d, want 1", parsed.Data.Character.Level)
	}

	life, ok := parsed.Data.Summary["Life"].(float64)
	if !ok {
		t.Fatalf("expected numeric summary.Life, got %T (%v); summary=%+v",
			parsed.Data.Summary["Life"], parsed.Data.Summary["Life"], parsed.Data.Summary)
	}
	if life <= 0 {
		t.Errorf("summary.Life = %v, want > 0 (a level 1 Warrior has base life)", life)
	}
}

// TestPoE2ImportProducesBuild drives the /import transform path
// end-to-end against a real PoE2 GGG character: Go's
// transformToImportJSON (pobimport.go, game=GamePoE2) builds the two
// PoB2-shaped bodies, wrapper.lua's handleImport decodes them into Lua
// tables (the PoE2 branch added alongside the transform fix — PoB2's
// ImportTab indexes its argument as an already-decoded table, unlike
// PoE1's string+ProcessJSON path) and drives PoB2's own account-import,
// and the resulting build XML is fed back through "calc" to confirm it
// loads with the right class and produces a sane stat.
//
// This is the test wave 1 explicitly left unverified: the pobb.in spike
// proved the calc pool works for PoE2, but never exercised /import.
func TestPoE2ImportProducesBuild(t *testing.T) {
	pool, proc := newPoE2Wrapper(t)
	defer pool.Shutdown()
	defer pool.Release(proc)

	fixturePath := filepath.Join("..", "..", "plugins", "poe2", "testdata", "ggg-poe2-character-full.json")
	fixture, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read poe2 character fixture: %v", err)
	}

	getItems, getPassives, err := transformToImportJSON(json.RawMessage(fixture), GamePoE2)
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
	game, err := DetectBuildGame(importParsed.XML)
	if err != nil {
		t.Fatalf("imported XML does not parse as a PoB build: %v", err)
	}
	if game != GamePoE2 {
		t.Fatalf("imported XML root = %q, want a PoE2 (PathOfBuilding2) root", game)
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
			Summary map[string]any `json:"summary"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(calcResp, &calcParsed); err != nil {
		t.Fatalf("calc response not JSON: %v (raw: %s)", err, calcResp)
	}
	if calcParsed.Type != "result" {
		t.Fatalf("expected calc type=result, got type=%q message=%q", calcParsed.Type, calcParsed.Message)
	}

	// The fixture's "class" is "Chronomancer" — a Sorceress ascendancy,
	// same convention PoE1 uses (the GGG `class` field is the ascendancy
	// name once ascended). PoB2 resolves this by name against its own
	// tree data (PassiveSpecClass:ImportFromNodeList), independent of
	// any classId/ascendancyClass mapping — there is none for PoE2.
	if calcParsed.Data.Character.Ascendancy != "Chronomancer" {
		t.Errorf("character.ascendancy = %q, want Chronomancer", calcParsed.Data.Character.Ascendancy)
	}
	if calcParsed.Data.Character.Class != "Sorceress" {
		t.Errorf("character.class = %q, want Sorceress", calcParsed.Data.Character.Class)
	}
	if calcParsed.Data.Character.Level != 87 {
		t.Errorf("character.level = %d, want 87 (fixture level)", calcParsed.Data.Character.Level)
	}

	life, ok := calcParsed.Data.Summary["Life"].(float64)
	if !ok {
		t.Fatalf("expected numeric summary.Life, got %T (%v); summary=%+v",
			calcParsed.Data.Summary["Life"], calcParsed.Data.Summary["Life"], calcParsed.Data.Summary)
	}
	if life <= 0 {
		t.Errorf("summary.Life = %v, want > 0", life)
	}
}
