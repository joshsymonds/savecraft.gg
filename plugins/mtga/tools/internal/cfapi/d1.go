// Package cfapi provides shared Cloudflare API helpers for MTGA data tools.
package cfapi

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"
)

// QueryD1 executes a read-only SQL query against a D1 database and returns
// the result rows as a slice of maps (column name → value).
func QueryD1(accountID, databaseID, apiToken, sql string) ([]map[string]any, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	queryURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query", accountID, databaseID)

	body, _ := json.Marshal(map[string]string{"sql": sql})
	req, _ := http.NewRequest("POST", queryURL, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("D1 query: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("D1 query: HTTP %d: %s", resp.StatusCode, string(respBody[:min(len(respBody), 300)]))
	}

	var result struct {
		Result []struct {
			Results []map[string]any `json:"results"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("D1 query: decode: %w", err)
	}
	if !result.Success || len(result.Result) == 0 {
		return nil, fmt.Errorf("D1 query: unsuccessful or empty result")
	}

	return result.Result[0].Results, nil
}

// errImportAlreadyComplete is returned when D1 reports the import with this
// etag already completed. The data is already in D1, nothing to do.
var errImportAlreadyComplete = errors.New("import already complete (same data)")

// SQLQuote escapes a string for safe SQL embedding (single quotes).
func SQLQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// ImportD1SQL uses the D1 bulk import API to execute a large SQL string.
// If another import is active on the same database, waits with jittered
// exponential backoff (up to ~5 minutes total) before retrying.
func ImportD1SQL(accountID, databaseID, apiToken, sql string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	importURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/import", accountID, databaseID)

	// Prepend a timestamp comment so re-runs with identical data produce
	// different SQL content (and thus a different etag). Without this, D1's
	// etag-based deduplication can silently skip imports when a previous
	// attempt with the same SQL failed (e.g., missing table).
	sql = fmt.Sprintf("-- import_ts: %d\n%s", time.Now().UnixNano(), sql)
	sqlBytes := []byte(sql)
	etag := fmt.Sprintf("%x", md5.Sum(sqlBytes))

	// Step 1: Init — get upload URL. Retry if another import is active.
	uploadURL, filename, err := initImport(client, importURL, apiToken, etag)
	if errors.Is(err, errImportAlreadyComplete) {
		fmt.Println("  D1 import skipped: same data already imported")
		return nil
	}
	if err != nil {
		return err
	}

	// Step 2: Upload SQL to the temporary R2 URL.
	uploadReq, _ := http.NewRequest("PUT", uploadURL, bytes.NewReader(sqlBytes))
	uploadResp, err := client.Do(uploadReq)
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	uploadResp.Body.Close()
	if uploadResp.StatusCode != http.StatusOK {
		return fmt.Errorf("upload: HTTP %d", uploadResp.StatusCode)
	}

	// Step 3: Ingest — trigger the import.
	ingestBody, _ := json.Marshal(map[string]string{
		"action":   "ingest",
		"etag":     etag,
		"filename": filename,
	})
	ingestReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(ingestBody))
	ingestReq.Header.Set("Authorization", "Bearer "+apiToken)
	ingestReq.Header.Set("Content-Type", "application/json")

	ingestResp, err := client.Do(ingestReq)
	if err != nil {
		return fmt.Errorf("ingest: %w", err)
	}
	ingestRespBody, _ := io.ReadAll(ingestResp.Body)
	ingestResp.Body.Close()
	if ingestResp.StatusCode != http.StatusOK {
		return fmt.Errorf("ingest: HTTP %d: %s", ingestResp.StatusCode, string(ingestRespBody[:min(len(ingestRespBody), 300)]))
	}

	var ingestResult struct {
		Result struct {
			AtBookmark string `json:"at_bookmark"`
		} `json:"result"`
	}
	if err := json.Unmarshal(ingestRespBody, &ingestResult); err != nil {
		return fmt.Errorf("ingest: decode: %w", err)
	}

	// Step 4: Poll until complete.
	bookmark := ingestResult.Result.AtBookmark
	for range 120 {
		time.Sleep(1 * time.Second)

		pollBody, _ := json.Marshal(map[string]string{
			"action":           "poll",
			"current_bookmark": bookmark,
		})
		pollReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(pollBody))
		pollReq.Header.Set("Authorization", "Bearer "+apiToken)
		pollReq.Header.Set("Content-Type", "application/json")

		pollResp, err := client.Do(pollReq)
		if err != nil {
			return fmt.Errorf("poll: %w", err)
		}
		pollRespBody, _ := io.ReadAll(pollResp.Body)
		pollResp.Body.Close()

		var pollResult struct {
			Result struct {
				Success bool   `json:"success"`
				Status  string `json:"status"`
				Error   string `json:"error"`
				Result  struct {
					NumQueries int `json:"num_queries"`
				} `json:"result"`
			} `json:"result"`
		}
		if err := json.Unmarshal(pollRespBody, &pollResult); err != nil {
			continue
		}

		if pollResult.Result.Success && pollResult.Result.Status == "complete" {
			fmt.Printf("  D1 import complete: %d queries executed\n", pollResult.Result.Result.NumQueries)
			return nil
		}
		if pollResult.Result.Error != "" {
			if isPollRetryableError(pollResult.Result.Error) {
				fmt.Printf("  D1 transient error (%s), retrying poll...\n", pollResult.Result.Error)
				continue
			}
			return fmt.Errorf("import failed: %s", pollResult.Result.Error)
		}
	}

	return fmt.Errorf("import timed out after 120s")
}

// isPollRetryableError returns true if a poll error is a transient D1 infrastructure
// error that should be retried rather than treated as a permanent failure.
func isPollRetryableError(errMsg string) bool {
	return strings.Contains(errMsg, "D1_RESET_DO")
}

// initImport calls the D1 import init endpoint. If another import is active,
// waits with jittered exponential backoff and retries.
// Returns (uploadURL, filename, error).
// initImportBaseDelay controls the base retry delay. Overridden in tests.
var initImportBaseDelay = 3 * time.Second

func initImport(client *http.Client, importURL, apiToken, etag string) (string, string, error) {
	const maxRetries = 10
	baseDelay := initImportBaseDelay

	for attempt := range maxRetries {
		initBody, _ := json.Marshal(map[string]string{"action": "init", "etag": etag})
		initReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(initBody))
		initReq.Header.Set("Authorization", "Bearer "+apiToken)
		initReq.Header.Set("Content-Type", "application/json")

		initResp, err := client.Do(initReq)
		if err != nil {
			return "", "", fmt.Errorf("init: %w", err)
		}
		initRespBody, _ := io.ReadAll(initResp.Body)
		initResp.Body.Close()
		if initResp.StatusCode != http.StatusOK {
			return "", "", fmt.Errorf("init: HTTP %d: %s", initResp.StatusCode, string(initRespBody[:min(len(initRespBody), 300)]))
		}

		// Parse response — the D1 import API returns different shapes depending on state.
		var statusCheck struct {
			Result struct {
				Success    bool     `json:"success"`
				Status     string   `json:"status"`
				Type       string   `json:"type"`
				Error      string   `json:"error"`
				UploadURL  string   `json:"upload_url"`
				Filename   string   `json:"filename"`
				AtBookmark string   `json:"at_bookmark"`
				Messages   []string `json:"messages"`
			} `json:"result"`
		}
		if err := json.Unmarshal(initRespBody, &statusCheck); err != nil {
			return "", "", fmt.Errorf("init: decode: %w (body: %s)", err, string(initRespBody[:min(len(initRespBody), 300)]))
		}
		r := statusCheck.Result

		// Got an upload URL — no active import, proceed.
		if r.UploadURL != "" {
			return r.UploadURL, r.Filename, nil
		}

		// Previous import with same etag already completed — data is there.
		if r.Status == "complete" {
			return "", "", errImportAlreadyComplete
		}

		// status="error" is a permanent failure (e.g. missing table) — fail immediately.
		if r.Status == "error" {
			return "", "", fmt.Errorf("init: D1 import error: %s", r.Error)
		}

		// Another import is active — retry with jittered exponential backoff.
		// D1 returns this as either status="active" or success=false with a
		// "Currently processing a long-running import..." error message.
		isActive := r.Status == "active" ||
			(!r.Success && strings.Contains(r.Error, "long-running import"))
		if isActive {
			delay := min(baseDelay*(1<<attempt), 30*time.Second)
			jitter := time.Duration(float64(delay) * (0.5 + rand.Float64()))
			fmt.Printf("  D1 import busy (attempt %d/%d, retrying in %v): status=%q type=%q bookmark=%q error=%q messages=%v\n",
				attempt+1, maxRetries, jitter.Round(time.Millisecond),
				r.Status, r.Type, r.AtBookmark, r.Error, r.Messages)
			time.Sleep(jitter)
			continue
		}

		return "", "", fmt.Errorf("init: unexpected response: %s", string(initRespBody[:min(len(initRespBody), 500)]))
	}

	return "", "", fmt.Errorf("init: gave up after %d retries waiting for active import to complete", maxRetries)
}
