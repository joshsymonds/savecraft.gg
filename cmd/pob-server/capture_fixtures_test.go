package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCaptureFixtures fetches the canonical reproduction builds and
// writes their decoded XML to testdata/. This is a one-shot capture run
// by humans — `CAPTURE_FIXTURES=1 go test -run TestCaptureFixtures -v`
// — not part of the normal test suite. The captured XML is committed to
// the repo so subsequent integration tests run offline.
//
// Both URLs reproduce the /compare bugs described in the epic
// (mod_sources drop, gear.same coarseness, diffs.skills stub).
func TestCaptureFixtures(t *testing.T) {
	if os.Getenv("CAPTURE_FIXTURES") != "1" {
		t.Skip("set CAPTURE_FIXTURES=1 to capture fixture XML")
	}

	type build struct {
		slug string
		url  string
	}
	builds := []build{
		{"build_OeN3b-6rvLSM", "https://pobb.in/OeN3b-6rvLSM"},
		{"build_AVbLkApuCqI9", "https://pobb.in/AVbLkApuCqI9"},
	}

	if err := os.MkdirAll("testdata", 0o755); err != nil {
		t.Fatalf("mkdir testdata: %v", err)
	}

	client := newResolveHTTPClient()
	for _, b := range builds {
		r, err := resolveBuildURL(b.url, nil, client)
		if err != nil {
			t.Errorf("resolve %s: %v", b.url, err)
			continue
		}
		out := filepath.Join("testdata", b.slug+".xml")
		if err := os.WriteFile(out, []byte(r.xml), 0o644); err != nil {
			t.Errorf("write %s: %v", out, err)
			continue
		}
		t.Logf("wrote %s (%d bytes, buildID=%s)", out, len(r.xml), r.buildID)
	}
}
