package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestRealServerSmoke proves three things end-to-end:
//   - $POB_DIR points at a working PoB checkout (devenv plumbing OK).
//   - The realserver_test harness can spawn a LuaJIT subprocess running
//     wrapper.lua and shut it down cleanly.
//   - The captured fixture XML in testdata/ parses through PoB's import.
//
// Failures here are setup problems, NOT /compare bugs. Subsequent
// integration tests should be able to assume this passes.
func TestRealServerSmoke(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	xml := readFixture(t, "build_OeN3b-6rvLSM")
	body, err := json.Marshal(map[string]string{"buildXml": xml})
	if err != nil {
		t.Fatal(err)
	}

	resp, err := http.Post(ts.URL+"/calc", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /calc: %v", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, respBody)
	}

	var decoded struct {
		Data struct {
			Character struct {
				Class      string `json:"class"`
				Ascendancy string `json:"ascendancy"`
				Level      int    `json:"level"`
			} `json:"character"`
			Summary map[string]any `json:"summary"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, truncate(string(respBody), 500))
	}

	if decoded.Data.Character.Class == "" {
		t.Errorf("expected non-empty character.class, got %+v", decoded.Data.Character)
	}
	if decoded.Data.Character.Level == 0 {
		t.Errorf("expected non-zero character.level, got %+v", decoded.Data.Character)
	}
	if len(decoded.Data.Summary) == 0 {
		t.Errorf("expected non-empty summary, got %d keys", len(decoded.Data.Summary))
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.TrimSpace(s[:n]) + "…"
}
