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

func TestResolveExternalURL(t *testing.T) {
	// Test resolveExternal directly with a mock server
	xml := "<PathOfBuilding><Build level=\"80\"/></PathOfBuilding>"
	code, err := EncodeBuildCode(xml)
	if err != nil {
		t.Fatal(err)
	}

	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(code))
	}))
	defer mock.Close()

	parsed, _ := url.Parse(mock.URL + "/mybuild")
	result, err := resolveExternal(mock.URL+"/mybuild", parsed, mock.Client())
	if err != nil {
		t.Fatal(err)
	}
	if result.xml != xml {
		t.Fatalf("xml mismatch: got %q", result.xml)
	}
	if result.cached {
		t.Fatal("external resolve should report cached=false")
	}
	if result.sourceURL != mock.URL+"/mybuild" {
		t.Fatalf("sourceURL mismatch: got %q", result.sourceURL)
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
}

func TestBuildFetchURLPobbin(t *testing.T) {
	u, _ := url.Parse("https://pobb.in/abc123")
	got := buildFetchURL("https://pobb.in/abc123", u)
	if got != "https://pobb.in/abc123/raw" {
		t.Fatalf("expected .../raw suffix, got %q", got)
	}
}

func TestBuildFetchURLPobbinAlreadyRaw(t *testing.T) {
	u, _ := url.Parse("https://pobb.in/abc123/raw")
	got := buildFetchURL("https://pobb.in/abc123/raw", u)
	if got != "https://pobb.in/abc123/raw" {
		t.Fatalf("should not double-suffix, got %q", got)
	}
}

func TestBuildFetchURLPastebin(t *testing.T) {
	u, _ := url.Parse("https://pastebin.com/xyz789")
	got := buildFetchURL("https://pastebin.com/xyz789", u)
	if got != "https://pastebin.com/raw/xyz789" {
		t.Fatalf("expected /raw/ prefix, got %q", got)
	}
}

func TestBuildFetchURLPastebinAlreadyRaw(t *testing.T) {
	u, _ := url.Parse("https://pastebin.com/raw/xyz789")
	got := buildFetchURL("https://pastebin.com/raw/xyz789", u)
	if got != "https://pastebin.com/raw/xyz789" {
		t.Fatalf("should not double-prefix, got %q", got)
	}
}

func TestBuildFetchURLGeneric(t *testing.T) {
	u, _ := url.Parse("https://example.com/builds/123")
	got := buildFetchURL("https://example.com/builds/123", u)
	if got != "https://example.com/builds/123" {
		t.Fatalf("generic should pass through, got %q", got)
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
