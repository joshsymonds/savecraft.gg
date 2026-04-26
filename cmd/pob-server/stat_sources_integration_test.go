//go:build integration_luajit

// Build-tag gated real-LuaJIT integration test for the stat-sources
// extraction added by Feature 1 (per-mod source breakdown). Verifies
// wrapper.lua walks PoB's ModDB via CompareCalcsHelpers.TabulateMods
// and serializes contributing modifier rows for a given stat name.
//
// Run with:
//   POB_ZLIB_PATH=... go test -tags=integration_luajit \
//       -count=1 ./cmd/pob-server/... -run TestStatSources

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

// TestStatSourcesLifeAgainstRealBuild loads a real PoB test build (an
// Occultist Vortex setup with allocated tree nodes + items + skills),
// requests Life mod sources, and asserts the response includes a
// non-empty array of well-shaped rows.
//
// This test exercises the full ride-along path: wrapper.lua loads
// CompareCalcsHelpers, TabulateMods walks build.calcsTab.calcsEnv.player.modDB,
// ResolveSourceName decodes "Item:N:..." / "Tree:N" source strings, and
// the result flows through the JSON protocol back to Go.
func TestStatSourcesLifeAgainstRealBuild(t *testing.T) {
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pobDir := pobSourceDir(t)
	wrapperPath := filepath.Join(filepath.Dir(pobDir), "..", "..", "cmd", "pob-server", "wrapper.lua")
	buildXMLPath := filepath.Join(filepath.Dir(pobDir), "spec", "TestBuilds", "3.13", "OccVortex.xml")

	xmlBytes, err := os.ReadFile(buildXMLPath)
	if err != nil {
		t.Skipf("test build XML missing (PoB checkout incomplete): %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, logger)
	defer pool.Shutdown()

	proc, err := pool.Acquire()
	if err != nil {
		t.Skipf("cannot acquire LuaJIT process: %v", err)
	}
	defer pool.Release(proc)

	payload := map[string]any{
		"type": "calc",
		"xml":  string(xmlBytes),
		"stat_sources": map[string]any{
			"stats": []string{"Life"},
			"limit": 5,
		},
	}

	rawResp, err := proc.Send(payload)
	if err != nil {
		t.Fatalf("process send failed: %v", err)
	}

	var parsed struct {
		Type string `json:"type"`
		Data struct {
			StatSources map[string][]map[string]any `json:"statSources"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		t.Fatalf("response not JSON: %v (raw: %s)", err, rawResp)
	}
	if parsed.Type != "result" {
		t.Fatalf("expected type=result, got type=%q message=%q", parsed.Type, parsed.Message)
	}

	lifeRows, ok := parsed.Data.StatSources["Life"]
	if !ok {
		keys := make([]string, 0, len(parsed.Data.StatSources))
		for k := range parsed.Data.StatSources {
			keys = append(keys, k)
		}
		t.Fatalf("expected data.statSources.Life, got keys: %v", keys)
	}
	if len(lifeRows) == 0 {
		t.Fatalf("expected non-empty Life rows, got 0")
	}
	if len(lifeRows) > 5 {
		t.Errorf("expected at most 5 rows (limit honored), got %d", len(lifeRows))
	}

	// Validate the shape of the first row. Every row must carry a
	// recognizable source_type (PoB's source-string prefix), a
	// modifier type from PoB's enumeration, and a numeric value.
	first := lifeRows[0]
	validSourceTypes := map[string]bool{
		"Item": true, "Tree": true, "Skill": true,
		"Pantheon": true, "Spectre": true, "Class": true, "Base": true,
	}
	srcType, _ := first["source_type"].(string)
	if !validSourceTypes[srcType] {
		t.Errorf("first row source_type=%q not in known set; row=%+v", srcType, first)
	}

	validModTypes := map[string]bool{
		"BASE": true, "INC": true, "MORE": true, "FLAG": true, "OVERRIDE": true,
	}
	modType, _ := first["mod_type"].(string)
	if !validModTypes[modType] {
		t.Errorf("first row mod_type=%q not in known set; row=%+v", modType, first)
	}

	if _, ok := first["value"].(float64); !ok {
		t.Errorf("first row value should be numeric, got %T (%v); row=%+v",
			first["value"], first["value"], first)
	}
}
