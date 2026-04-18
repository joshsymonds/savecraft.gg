package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveInternalURL(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	xml := "<PathOfBuilding><Build level=\"95\"/></PathOfBuilding>"
	id := contentHash(xml)
	summary := `{"character":{"class":"Witch"}}`
	if err := store.Put(id, xml, summary, "", ""); err != nil {
		t.Fatal(err)
	}

	// Resolve an internal pob.savecraft.gg URL
	result, err := resolveBuildURL(
		"https://pob.savecraft.gg/"+id,
		store,
		http.DefaultClient,
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.xml != xml {
		t.Fatalf("xml mismatch: got %q", result.xml)
	}
	if result.buildID != id {
		t.Fatalf("buildID mismatch: got %q, want %q", result.buildID, id)
	}
	if !result.cached {
		t.Fatal("internal resolve should report cached=true")
	}
}

func TestResolveInternalURLNotFound(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	_, err = resolveBuildURL(
		"https://pob.savecraft.gg/nonexistent",
		store,
		http.DefaultClient,
	)
	if !errors.Is(err, ErrBuildNotFound) {
		t.Fatalf("expected ErrBuildNotFound, got %v", err)
	}
}

// The resolver HTTP client MUST NOT follow redirects — the allowlist
// is checked only on the initial URL. A paste host returning a 302
// to an internal/link-local/cloud-metadata address must fail, not
// silently fetch the redirect target.
func TestResolveExternalRejectsRedirects(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", "http://169.254.169.254/latest/meta-data/")
		w.WriteHeader(http.StatusFound)
	}))
	defer mock.Close()

	fetchURL := mock.URL + "/mybuild"
	_, err := resolveExternal(fetchURL, fetchURL, newResolveHTTPClient())
	if err == nil {
		t.Fatal("expected error: redirect must not be followed")
	}
	// The 302 should surface as a non-200 status-code error, not a
	// successful fetch of whatever the redirect target would serve.
	if !strings.Contains(err.Error(), "302") {
		t.Errorf("expected 302 status in error, got: %v", err)
	}
}

func TestResolveExternalURL(t *testing.T) {
	xml := "<PathOfBuilding><Build level=\"80\"/></PathOfBuilding>"
	code, err := EncodeBuildCode(xml)
	if err != nil {
		t.Fatal(err)
	}

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(code))
	}))
	defer mock.Close()

	fetchURL := mock.URL + "/mybuild"
	result, err := resolveExternal(fetchURL, fetchURL, mock.Client())
	if err != nil {
		t.Fatal(err)
	}
	if result.xml != xml {
		t.Fatalf("xml mismatch: got %q", result.xml)
	}
	if result.cached {
		t.Fatal("external resolve should report cached=false")
	}
	if result.sourceURL != fetchURL {
		t.Fatalf("sourceURL mismatch: got %q", result.sourceURL)
	}
}

func TestMatchBuildSiteHappyPaths(t *testing.T) {
	// One or more cases per site in buildSitesList. Each case asserts
	// both the matched site's id and the fetch URL the caller will use.
	cases := []struct {
		name       string
		inputURL   string
		wantSiteID string
		wantFetch  string
	}{
		// Maxroll
		{
			"maxroll",
			"https://maxroll.gg/poe/pob/abc-def-123",
			"Maxroll",
			"https://maxroll.gg/poe/api/pob/abc-def-123",
		},
		{
			"maxroll trailing slash",
			"https://maxroll.gg/poe/pob/abc-def-123/",
			"Maxroll",
			"https://maxroll.gg/poe/api/pob/abc-def-123",
		},

		// POBBin — user-facing URL and API URL both accepted; idempotent on /raw
		{
			"pobbin user url",
			"https://pobb.in/hA-Q_J6f46g0",
			"POBBin",
			"https://pobb.in/pob/hA-Q_J6f46g0",
		},
		{
			"pobbin www",
			"https://www.pobb.in/hA-Q_J6f46g0",
			"POBBin",
			"https://pobb.in/pob/hA-Q_J6f46g0",
		},
		{
			"pobbin api url",
			"https://pobb.in/pob/hA-Q_J6f46g0",
			"POBBin",
			"https://pobb.in/pob/hA-Q_J6f46g0",
		},
		{
			"pobbin with raw suffix",
			"https://pobb.in/hA-Q_J6f46g0/raw",
			"POBBin",
			"https://pobb.in/pob/hA-Q_J6f46g0",
		},
		{"pobbin uppercase host", "HTTPS://POBB.IN/abc123", "POBBin", "https://pobb.in/pob/abc123"},

		// PoeNinja — both /pob/ and /poe1/pob/ forms supported in PoB's pattern
		{
			"poeninja short",
			"https://poe.ninja/pob/abc123",
			"PoeNinja",
			"https://poe.ninja/poe1/pob/raw/abc123",
		},
		{
			"poeninja poe1 path",
			"https://poe.ninja/poe1/pob/abc123",
			"PoeNinja",
			"https://poe.ninja/poe1/pob/raw/abc123",
		},

		// Pastebin — user-facing /<id> and raw /raw/<id> forms both accepted
		{
			"pastebin user url",
			"https://pastebin.com/xYz9abcd",
			"pastebin",
			"https://pastebin.com/raw/xYz9abcd",
		},
		{
			"pastebin raw",
			"https://pastebin.com/raw/xYz9abcd",
			"pastebin",
			"https://pastebin.com/raw/xYz9abcd",
		},
		{
			"pastebin www",
			"https://www.pastebin.com/xYz9abcd",
			"pastebin",
			"https://pastebin.com/raw/xYz9abcd",
		},

		// PastebinP
		{
			"pastebinp user url",
			"https://pastebinp.com/abc123",
			"pastebinProxy",
			"https://pastebinp.com/raw/abc123",
		},
		{
			"pastebinp raw",
			"https://pastebinp.com/raw/abc123",
			"pastebinProxy",
			"https://pastebinp.com/raw/abc123",
		},

		// Rentry
		{"rentry", "https://rentry.co/abc123", "rentry", "https://rentry.co/paste/abc123/raw"},

		// PoEDB — the actual production-captured failing URL
		{
			"poedb production",
			"https://poedb.tw/pob/pbqyiS4eIR",
			"PoEDB",
			"https://poedb.tw/pob/pbqyiS4eIR/raw",
		},
		{
			"poedb already raw",
			"https://poedb.tw/pob/pbqyiS4eIR/raw",
			"PoEDB",
			"https://poedb.tw/pob/pbqyiS4eIR/raw",
		},
		{
			"poedb www",
			"https://www.poedb.tw/pob/pbqyiS4eIR",
			"PoEDB",
			"https://poedb.tw/pob/pbqyiS4eIR/raw",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := url.Parse(tc.inputURL)
			if err != nil {
				t.Fatalf("failed to parse input URL: %v", err)
			}
			site, fetchURL, err := matchBuildSite(parsed)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if site == nil {
				t.Fatal("site is nil")
			}
			if site.id != tc.wantSiteID {
				t.Fatalf("site id: got %q, want %q", site.id, tc.wantSiteID)
			}
			if fetchURL != tc.wantFetch {
				t.Fatalf("fetch URL: got %q, want %q", fetchURL, tc.wantFetch)
			}
		})
	}
}

// TestMatchBuildSiteRejections covers SSRF and malformed-input cases the
// allowlist MUST reject. Any regression here means the security
// boundary weakened.
func TestMatchBuildSiteRejections(t *testing.T) {
	cases := []struct {
		name     string
		inputURL string
		wantMsg  string // substring that must appear in the error
	}{
		{"suffix-match attack", "https://evil.pobb.in.attacker.com/abc", "unsupported host"},
		{"prefix-match attack", "https://pobb.in.evil.com/abc", "unsupported host"},
		{"path-based deception", "https://attacker.com/pobb.in/abc", "unsupported host"},
		{"aws metadata service", "https://169.254.169.254/latest/meta-data/", "unsupported host"},
		{"localhost", "https://localhost/abc", "unsupported host"},
		{"ipv6 loopback", "https://[::1]/abc", "unsupported host"},
		{"non-default port", "https://pobb.in:8080/abc", "unsupported host"},
		{"bare hostname no path", "https://pobb.in/", "does not match"},
		{"pobbin empty id", "https://pobb.in", "does not match"},
		{"poedb wrong path", "https://poedb.tw/not-a-build-page", "does not match"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := url.Parse(tc.inputURL)
			if err != nil {
				// Some malformed inputs fail parse entirely; that's also a
				// valid rejection — skip to the next case.
				return
			}
			_, _, err = matchBuildSite(parsed)
			if err == nil {
				t.Fatalf("expected error, got nil (url=%q)", tc.inputURL)
			}
			if !strings.Contains(err.Error(), tc.wantMsg) {
				t.Fatalf("error message missing %q: %v", tc.wantMsg, err)
			}
		})
	}
}

func TestResolveRejectsUnknownHost(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	_, err = resolveBuildURL(
		"https://evil.example.com/build",
		store,
		http.DefaultClient,
	)
	if err == nil {
		t.Fatal("expected error for unknown host")
	}
	if !strings.Contains(err.Error(), "unsupported host") {
		t.Fatalf("expected unsupported host error, got: %v", err)
	}
	// The error message MUST list all canonical hosts so operators (and
	// AI callers) know what to retry with. This assertion locks in the
	// single-source-of-truth derivation from buildSitesList.
	for _, site := range buildSitesList {
		canonical := site.hosts[0]
		if !strings.Contains(err.Error(), canonical) {
			t.Errorf("error message missing %q: %v", canonical, err)
		}
	}
}

func TestResolveRejectsNonHTTPScheme(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// gopher is a valid URI scheme that would otherwise pass the basic
	// parse checks; it must be rejected before any allowlist lookup.
	_, err = resolveBuildURL(
		"gopher://pobb.in/abc",
		store,
		http.DefaultClient,
	)
	if err == nil {
		t.Fatal("expected error for non-http scheme")
	}
	if !strings.Contains(err.Error(), "scheme") {
		t.Fatalf("expected scheme error, got: %v", err)
	}
}

func TestResolveRejectsNonURL(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	_, err = resolveBuildURL("not-a-url", store, http.DefaultClient)
	if err == nil {
		t.Fatal("expected error for non-URL input")
	}
}

func TestResolveRejectsBase64(t *testing.T) {
	store, err := NewBuildStore(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// A raw base64 build code (no URL scheme)
	_, err = resolveBuildURL(
		"eJy9XVtzm8i2fh7_Cs...",
		store,
		http.DefaultClient,
	)
	if err == nil {
		t.Fatal("expected error for raw base64 input")
	}
}

func TestResolveHandlerIntegration(t *testing.T) {
	// Test the full HTTP handler with an internal URL
	srv := newTestServer(t)

	xml := "<PathOfBuilding><Build level=\"88\"/></PathOfBuilding>"
	id := srv.cache.Put(xml)
	summary := `{"stats":{"Life":5000}}`
	_ = srv.cache.store.Put(id, xml, summary, "", "")

	body := `{"url":"https://pob.savecraft.gg/` + id + `"}`
	req := httptest.NewRequest(
		http.MethodPost, "/resolve",
		strings.NewReader(body),
	)
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if _, ok := resp["buildId"]; !ok {
		t.Fatal("response missing buildId")
	}
}

func TestResolveHandlerRejectsEmptyURL(t *testing.T) {
	srv := newTestServer(t)

	req := httptest.NewRequest(
		http.MethodPost, "/resolve",
		strings.NewReader(`{"url":""}`),
	)
	rec := httptest.NewRecorder()
	srv.handleResolve(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
