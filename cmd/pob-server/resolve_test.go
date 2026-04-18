package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
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

// TestBuildSitesListInSyncWithPoB is the stale check: it parses PoB's
// vendored buildSites.websiteList from .reference/pob and asserts that
// buildSitesList in this package contains the same ids and produces
// download URLs matching PoB's downloadURL templates. Fails loudly when
// PoB adds, removes, or retargets a site so the mismatch can't slip in
// unnoticed during a vendor refresh.
func TestBuildSitesListInSyncWithPoB(t *testing.T) {
	luaPath := filepath.Join(
		"..", "..", ".reference", "pob", "src", "Modules", "BuildSiteTools.lua",
	)
	data, err := os.ReadFile(luaPath)
	if err != nil {
		t.Fatalf(
			"cannot read vendored PoB BuildSiteTools.lua at %s: %v. "+
				"If the vendored PoB copy moved, update this test; if it was deleted, "+
				"the stale check cannot verify site-list drift.",
			luaPath, err,
		)
	}

	pobSites := parsePoBSiteList(t, string(data))
	if len(pobSites) == 0 {
		t.Fatal("parsed zero entries from PoB BuildSiteTools.lua; parser likely broken")
	}

	if len(pobSites) != len(buildSitesList) {
		t.Errorf(
			"site count mismatch: PoB has %d, buildSitesList has %d. "+
				"PoB added or removed a site — update buildSitesList.",
			len(pobSites), len(buildSitesList),
		)
	}

	// Build a map of PoB id → downloadURL for cross-checking.
	pobByID := make(map[string]pobSiteEntry, len(pobSites))
	for _, s := range pobSites {
		pobByID[s.id] = s
	}

	// Every Go site must correspond to a PoB site with a matching
	// downloadURL template.
	for _, goSite := range buildSitesList {
		pobSite, ok := pobByID[goSite.id]
		if !ok {
			t.Errorf(
				"Go buildSitesList has id %q but PoB BuildSiteTools.lua does not. "+
					"Either PoB renamed this entry or we're carrying a bogus id.",
				goSite.id,
			)
			continue
		}

		// Translate PoB's downloadURL (with %1 placeholder) into an
		// expected URL form, then compare to what the Go site would
		// produce for the same placeholder. PoB's templates omit the
		// scheme; we always produce https://. PoB's author escapes
		// literal dots with Lua pattern syntax (`%.`) in some templates;
		// unescape so the comparison is against the real URL Lua renders.
		pobDL := strings.ReplaceAll(pobSite.downloadURL, "%.", ".")
		pobExpected := "https://" + strings.ReplaceAll(pobDL, "%1", "<ID>")
		goProduced := fmt.Sprintf(goSite.downloadFormat, "<ID>")
		if pobExpected != goProduced {
			t.Errorf(
				"site %q: downloadURL drift. PoB produces %q, Go produces %q. "+
					"Update buildSitesList[%q].downloadFormat to match.",
				goSite.id, pobExpected, goProduced, goSite.id,
			)
		}
	}

	// Every PoB site must have a Go counterpart. Separate loop so we
	// catch additions even if Go's existing ids match.
	goByID := make(map[string]bool, len(buildSitesList))
	for _, s := range buildSitesList {
		goByID[s.id] = true
	}
	for _, pobSite := range pobSites {
		if !goByID[pobSite.id] {
			t.Errorf(
				"PoB BuildSiteTools.lua defines site %q but Go buildSitesList does not. "+
					"PoB added a new build site — port it into buildSitesList.",
				pobSite.id,
			)
		}
	}
}

// pobSiteEntry is a minimal representation of one entry from PoB's
// buildSites.websiteList. Only id and downloadURL participate in the
// drift check.
type pobSiteEntry struct {
	id          string
	downloadURL string
}

// parsePoBSiteList extracts { id, downloadURL } tuples from the Lua
// source. Each websiteList entry is a table literal with id="..."
// and downloadURL="..." fields; we grab them with a per-line regex
// over the whole file rather than trying to interpret Lua syntax.
func parsePoBSiteList(t *testing.T, src string) []pobSiteEntry {
	t.Helper()

	// PoB's file packs each entry across 1-2 lines. Normalize newlines
	// away inside the websiteList table so each entry's fields are on a
	// single logical line.
	start := strings.Index(src, "buildSites.websiteList")
	if start < 0 {
		t.Fatal("could not find 'buildSites.websiteList' in PoB source")
	}
	// Find the end of the table assignment: we scan forward for the
	// closing '}' that balances the opening '{' after the equals sign.
	eq := strings.Index(src[start:], "{")
	if eq < 0 {
		t.Fatal("could not find opening brace of websiteList table")
	}
	i := start + eq
	depth := 0
	var end int
	for ; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				end = i
			}
		}
		if end != 0 {
			break
		}
	}
	if end == 0 {
		t.Fatal("could not find closing brace of websiteList table")
	}
	block := src[start+eq : end+1]
	// Collapse newlines and extra whitespace inside the block so each
	// entry is one line that the per-entry regex can match.
	block = regexp.MustCompile(`\s+`).ReplaceAllString(block, " ")

	// Match each `{ ... }` entry. The pattern deliberately tolerates
	// attribute ordering and optional trailing commas.
	entryRe := regexp.MustCompile(`\{\s*([^{}]*?)\s*\}`)
	idRe := regexp.MustCompile(`\bid\s*=\s*"([^"]+)"`)
	downloadRe := regexp.MustCompile(`\bdownloadURL\s*=\s*"([^"]+)"`)

	var out []pobSiteEntry
	for _, match := range entryRe.FindAllStringSubmatch(block, -1) {
		inner := match[1]
		idMatch := idRe.FindStringSubmatch(inner)
		dlMatch := downloadRe.FindStringSubmatch(inner)
		if idMatch == nil || dlMatch == nil {
			// Skip entries that don't have both — none of PoB's real
			// entries should miss these, but the test should be resilient
			// to comments or stray braces in the source.
			continue
		}
		out = append(out, pobSiteEntry{
			id:          idMatch[1],
			downloadURL: dlMatch[1],
		})
	}
	return out
}
