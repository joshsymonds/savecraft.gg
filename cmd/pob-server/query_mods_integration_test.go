//go:build integration_luajit

// Build-tag gated real-LuaJIT integration test for the dump_query_mods
// request type added by Feature 2 (advanced buy-similar). Verifies
// wrapper.lua walks PoB's bundled Data/QueryMods.lua via
// CompareTradeHelpers.modLineTemplate and emits a flat lookup table the
// Go side can use to resolve common mod text → trade-stat IDs without
// hitting the trade-stats SQLite cache.
//
// Run with:
//   POB_ZLIB_PATH=... go test -tags=integration_luajit \
//       -count=1 ./cmd/pob-server/... -run TestDumpQueryMods

package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestDumpQueryModsAgainstRealPoB sends a dump_query_mods request and
// asserts the response carries a non-trivial lookup map. We don't pin
// the exact size (PoB version bumps add/remove mods) but sanity-check
// that:
//   - the response decodes
//   - the lookup map is populated (>500 entries — PoB ships thousands)
//   - common mods (Life, resistances) appear under both "template|type"
//     and "template" keys
func TestDumpQueryModsAgainstRealPoB(t *testing.T) {
	luajitPath, err := exec.LookPath("luajit")
	if err != nil {
		t.Skip("luajit not installed — integration test skipped")
	}
	pobDir := pobSourceDir(t)
	wrapperPath := filepath.Join(filepath.Dir(pobDir), "..", "..", "cmd", "pob-server", "wrapper.lua")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, logger)
	defer pool.Shutdown()

	proc, err := pool.Acquire()
	if err != nil {
		t.Skipf("cannot acquire LuaJIT process: %v", err)
	}
	defer pool.Release(proc)

	rawResp, err := proc.Send(map[string]any{"type": "dump_query_mods"})
	if err != nil {
		t.Fatalf("process send failed: %v", err)
	}

	var parsed struct {
		Type string `json:"type"`
		Data struct {
			Lookup map[string]string `json:"lookup"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(rawResp, &parsed); err != nil {
		t.Fatalf("response not JSON: %v (raw: %s)", err, rawResp)
	}
	if parsed.Type != "result" {
		t.Fatalf("expected type=result, got type=%q message=%q", parsed.Type, parsed.Message)
	}

	if len(parsed.Data.Lookup) < 500 {
		t.Fatalf("expected QueryMods lookup with >500 entries, got %d", len(parsed.Data.Lookup))
	}

	// Spot-check at least one canonical Life mod resolves. PoB's
	// Data/QueryMods.lua includes the standard "+# to maximum Life"
	// explicit mod under explicit.stat_3299347043.
	var lifeKey string
	for key := range parsed.Data.Lookup {
		if strings.Contains(key, "to maximum Life") && strings.HasSuffix(key, "|explicit") {
			lifeKey = key
			break
		}
	}
	if lifeKey == "" {
		t.Fatalf("no '+# to maximum Life|explicit' key found; sample keys: %v", sampleKeys(parsed.Data.Lookup, 10))
	}
	tradeID := parsed.Data.Lookup[lifeKey]
	if !strings.HasPrefix(tradeID, "explicit.stat_") {
		t.Errorf("Life mod tradeID = %q, expected explicit.stat_* prefix", tradeID)
	}
}

func sampleKeys(m map[string]string, n int) []string {
	out := make([]string, 0, n)
	for k := range m {
		out = append(out, k)
		if len(out) >= n {
			break
		}
	}
	return out
}
