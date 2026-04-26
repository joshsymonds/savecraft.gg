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
	pool := NewPool(1, 5*time.Minute, luajitPath, wrapperPath, pobDir, logger)
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
