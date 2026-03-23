package cfapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func init() {
	initImportBaseDelay = 1 * time.Millisecond
}

func TestSQLQuote(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"hello", "'hello'"},
		{"it's", "'it''s'"},
		{"", "''"},
		{"Frodo's Ring", "'Frodo''s Ring'"},
		{"a''b", "'a''''b'"},
	}
	for _, tt := range tests {
		got := SQLQuote(tt.input)
		if got != tt.want {
			t.Errorf("SQLQuote(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestInitImport_Success(t *testing.T) {
	var serverURL string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"upload_url": serverURL + "/upload",
				"filename":   "test.sql",
			},
		})
	}))
	defer server.Close()
	serverURL = server.URL

	client := &http.Client{}
	url, filename, err := initImport(client, server.URL, "test-token", "test-etag")
	if err != nil {
		t.Fatalf("initImport failed: %v", err)
	}
	if url != server.URL+"/upload" {
		t.Errorf("got upload_url %q, want %q", url, server.URL+"/upload")
	}
	if filename != "test.sql" {
		t.Errorf("got filename %q, want %q", filename, "test.sql")
	}
}

func TestInitImport_RetriesOnActive(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n <= 2 {
			// First 2 attempts: active import
			json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"result": map[string]any{
					"status": "active",
				},
			})
			return
		}
		// Third attempt: success
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"upload_url": "https://example.com/upload",
				"filename":   "test.sql",
			},
		})
	}))
	defer server.Close()

	client := &http.Client{}
	url, _, err := initImport(client, server.URL, "test-token", "test-etag")
	if err != nil {
		t.Fatalf("initImport failed after retries: %v", err)
	}
	if url != "https://example.com/upload" {
		t.Errorf("got upload_url %q", url)
	}
	if attempts.Load() != 3 {
		t.Errorf("expected 3 attempts, got %d", attempts.Load())
	}
}

func TestInitImport_FailsAfterMaxRetries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always return active
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"status": "active",
			},
		})
	}))
	defer server.Close()

	client := &http.Client{}
	_, _, err := initImport(client, server.URL, "test-token", "test-etag")
	if err == nil {
		t.Fatal("expected error after max retries")
	}
	if testing.Verbose() {
		t.Logf("got expected error: %v", err)
	}
}

func TestInitImport_FailsOnHTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := &http.Client{}
	_, _, err := initImport(client, server.URL, "test-token", "test-etag")
	if err == nil {
		t.Fatal("expected error on HTTP 500")
	}
}

func TestInitImport_FailsOnUnexpectedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// No upload_url and no status=active — unexpected
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"status": "unknown",
			},
		})
	}))
	defer server.Close()

	client := &http.Client{}
	_, _, err := initImport(client, server.URL, "test-token", "test-etag")
	if err == nil {
		t.Fatal("expected error on unexpected response")
	}
}
