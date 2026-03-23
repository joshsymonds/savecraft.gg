package cfapi

import (
	"encoding/json"
	"errors"
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

func TestImportD1SQL_PollNotImporting(t *testing.T) {
	// When a small import completes between ingest and first poll, D1 returns
	// error "Not currently importing anything". This should be treated as success.
	var serverURL string
	step := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "PUT" {
			w.WriteHeader(http.StatusOK)
			return
		}
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		switch body["action"] {
		case "init":
			step = 1
			json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"result": map[string]any{
					"upload_url": serverURL + "/upload",
					"filename":   "test.sql",
				},
			})
		case "ingest":
			step = 2
			json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"result": map[string]any{
					"at_bookmark": "bookmark-123",
				},
			})
		case "poll":
			step = 3
			json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"result": map[string]any{
					"success": false,
					"error":   "Not currently importing anything.",
				},
			})
		}
	}))
	defer server.Close()
	serverURL = server.URL
	_ = step

	// We can't call ImportD1SQL directly (it constructs its own URL from accountID/databaseID).
	// Instead, test the poll error handling by verifying isImportCompleteError.
	if !isImportCompleteError("Not currently importing anything.") {
		t.Error("expected 'Not currently importing anything.' to be treated as complete")
	}
	if !isImportCompleteError("Not currently importing anything") {
		t.Error("expected variant without period to also match")
	}
	if !isImportCompleteError("Not currently import at bookmark 00000735-00000452-00005037-abc123.") {
		t.Error("expected 'Not currently import at bookmark...' to be treated as complete")
	}
	if isImportCompleteError("some other error") {
		t.Error("unrelated errors should not be treated as complete")
	}
}

func TestInitImport_AlreadyComplete(t *testing.T) {
	// D1 returns status="complete" when the same etag was already imported.
	// Should return a sentinel error that ImportD1SQL treats as success.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"result": map[string]any{
				"success":     true,
				"status":      "complete",
				"type":        "import",
				"at_bookmark": "00000731-00000000-00005037-abc123",
			},
		})
	}))
	defer server.Close()

	client := &http.Client{}
	_, _, err := initImport(client, server.URL, "test-token", "test-etag")
	if err == nil {
		t.Fatal("expected sentinel error for already-complete import")
	}
	if !errors.Is(err, errImportAlreadyComplete) {
		t.Fatalf("expected errImportAlreadyComplete, got: %v", err)
	}
}

func TestInitImport_RetriesOnBusyError(t *testing.T) {
	// D1 returns success=false with an error message when another import is running.
	// Different from status="active" — this is the "long-running import" variant.
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := attempts.Add(1)
		if n <= 1 {
			json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"result": map[string]any{
					"success": false,
					"error":   "Currently processing a long-running import. Cannot start another import until that completes or times out.",
				},
			})
			return
		}
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
		t.Fatalf("initImport should retry and succeed, got: %v", err)
	}
	if url != "https://example.com/upload" {
		t.Errorf("got upload_url %q", url)
	}
	if attempts.Load() != 2 {
		t.Errorf("expected 2 attempts, got %d", attempts.Load())
	}
}
