package main

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCacheDownload_FirstDownload(t *testing.T) {
	content := "hello,world\n1,2\n"
	server := newFakeGzipServer(content, "etag-abc123")
	defer server.Close()

	cacheDir := t.TempDir()
	rc, err := cachedDownloadGzip(server.URL, cacheDir, "test.csv.gz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer rc.Close()

	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	if string(got) != content {
		t.Errorf("got %q, want %q", got, content)
	}

	// Verify cache files were written.
	if _, err := os.Stat(filepath.Join(cacheDir, "test.csv.gz")); err != nil {
		t.Errorf("cache file not written: %v", err)
	}
	etag, err := os.ReadFile(filepath.Join(cacheDir, "test.csv.gz.etag"))
	if err != nil {
		t.Fatalf("etag file not written: %v", err)
	}
	if string(etag) != "etag-abc123" {
		t.Errorf("etag = %q, want %q", etag, "etag-abc123")
	}
}

func TestCacheDownload_CacheHit(t *testing.T) {
	content := "cached,data\nfoo,bar\n"
	server := newFakeGzipServer(content, "etag-same")
	defer server.Close()

	cacheDir := t.TempDir()

	// Pre-populate cache.
	writeGzipFile(t, filepath.Join(cacheDir, "test.csv.gz"), content)
	os.WriteFile(filepath.Join(cacheDir, "test.csv.gz.etag"), []byte("etag-same"), 0644)

	// Track requests to verify no GET was made.
	var requests []string
	original := server.Config.Handler
	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method)
		original.ServeHTTP(w, r)
	})

	rc, err := cachedDownloadGzip(server.URL, cacheDir, "test.csv.gz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer rc.Close()

	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	if string(got) != content {
		t.Errorf("got %q, want %q", got, content)
	}

	// Should only have made a HEAD request, no GET.
	for _, method := range requests {
		if method == "GET" {
			t.Error("cache hit should not make a GET request")
		}
	}
}

func TestCacheDownload_CacheMiss_ETagChanged(t *testing.T) {
	newContent := "new,data\nbaz,qux\n"
	server := newFakeGzipServer(newContent, "etag-new")
	defer server.Close()

	cacheDir := t.TempDir()

	// Pre-populate cache with old etag.
	writeGzipFile(t, filepath.Join(cacheDir, "test.csv.gz"), "old,data\n")
	os.WriteFile(filepath.Join(cacheDir, "test.csv.gz.etag"), []byte("etag-old"), 0644)

	rc, err := cachedDownloadGzip(server.URL, cacheDir, "test.csv.gz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer rc.Close()

	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	if string(got) != newContent {
		t.Errorf("got %q, want %q", got, newContent)
	}

	// Verify etag was updated.
	etag, err := os.ReadFile(filepath.Join(cacheDir, "test.csv.gz.etag"))
	if err != nil {
		t.Fatalf("etag file not written: %v", err)
	}
	if string(etag) != "etag-new" {
		t.Errorf("etag = %q, want %q", etag, "etag-new")
	}
}

func TestCacheDownload_NoETagHeader(t *testing.T) {
	// Server returns no ETag — should always download and not cache ETag.
	content := "no,etag\n"
	server := newFakeGzipServer(content, "")
	defer server.Close()

	cacheDir := t.TempDir()

	rc, err := cachedDownloadGzip(server.URL, cacheDir, "test.csv.gz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer rc.Close()

	got, err := io.ReadAll(rc)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	if string(got) != content {
		t.Errorf("got %q, want %q", got, content)
	}

	// Cache file should exist but no etag file.
	if _, err := os.Stat(filepath.Join(cacheDir, "test.csv.gz")); err != nil {
		t.Errorf("cache file not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(cacheDir, "test.csv.gz.etag")); !os.IsNotExist(err) {
		t.Error("etag file should not exist when server returns no ETag")
	}
}

// ── Helpers ──────────────────────────────────────────────

func newFakeGzipServer(content string, etag string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if etag != "" {
			w.Header().Set("ETag", etag)
		}
		if r.Method == "HEAD" {
			return
		}
		w.Header().Set("Content-Type", "application/gzip")
		gz := gzip.NewWriter(w)
		gz.Write([]byte(content))
		gz.Close()
	}))
}

func writeGzipFile(t *testing.T, path string, content string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("creating cache file: %v", err)
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	if _, err := io.Copy(gz, strings.NewReader(content)); err != nil {
		t.Fatalf("writing gzip: %v", err)
	}
	gz.Close()
}
