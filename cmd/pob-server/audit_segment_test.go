package main

import (
	"bytes"
	"os/exec"
	"testing"
)

// runLuaSuite drives a pure-Lua test file through luajit and surfaces its
// summary line via t.Log even on success, so silent test-count drift is
// visible. Locates luajit by preferring `luajit` on PATH (devenv provides it),
// falling back to `nix-shell -p luajit --run` for fresh checkouts, and
// skipping if neither is available.
func runLuaSuite(t *testing.T, script string) {
	t.Helper()
	cmd, why := luajitCmd(script)
	if cmd == nil {
		t.Skipf("luajit unavailable: %s", why)
	}
	cmd.Dir = "."

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	if err := cmd.Run(); err != nil {
		t.Fatalf("%s failed: %v\n%s", script, err, out.String())
	}
	t.Log(out.String())
}

// TestAuditSegmentLuaSuite runs the pure-Lua audit_segment_test.lua test file.
//
// The algorithm under test is plain Lua with no PoB dependency, so we drive
// it directly via a luajit subprocess rather than going through the PoB pool.
func TestAuditSegmentLuaSuite(t *testing.T) {
	runLuaSuite(t, "audit_segment_test.lua")
}

// TestAuditExtractionLuaSuite runs the pure-Lua audit_extract_test.lua tests.
// Same model as TestAuditSegmentLuaSuite — extraction is tested against
// hand-rolled fake spec tables, no real PoB load.
func TestAuditExtractionLuaSuite(t *testing.T) {
	runLuaSuite(t, "audit_extract_test.lua")
}

// luajitCmd builds an exec.Cmd that runs `luajit <script>` using whatever
// luajit is reachable from this environment. Returns (nil, reason) when no
// luajit is available.
func luajitCmd(script string) (*exec.Cmd, string) {
	if path, err := exec.LookPath("luajit"); err == nil {
		return exec.Command(path, script), ""
	}
	if path, err := exec.LookPath("nix-shell"); err == nil {
		return exec.Command(path, "-p", "luajit", "--run", "luajit "+script), ""
	}
	return nil, "neither luajit nor nix-shell found in PATH"
}
