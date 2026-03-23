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
				Success    bool   `json:"success"`
				Error      string `json:"error"`
				NumQueries int    `json:"num_queries"`
			} `json:"result"`
		}
		if err := json.Unmarshal(pollRespBody, &pollResult); err != nil {
			continue
		}

		if pollResult.Result.Success {
			fmt.Printf("  D1 import complete: %d queries executed\n", pollResult.Result.NumQueries)
			return nil
		}
		if pollResult.Result.Error != "" {
			if isImportCompleteError(pollResult.Result.Error) {
				fmt.Println("  D1 import complete (fast): poll found no active import")
				return nil
			}
			return fmt.Errorf("import failed: %s", pollResult.Result.Error)
		}
	}

	return fmt.Errorf("import timed out after 120s")
}

// isImportCompleteError returns true if the poll error indicates the import
// already finished before we could poll it (small imports complete instantly).
func isImportCompleteError(errMsg string) bool {
	return strings.Contains(strings.ToLower(errMsg), "not currently import")
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
				Success   bool   `json:"success"`
				Status    string `json:"status"`
				Error     string `json:"error"`
				UploadURL string `json:"upload_url"`
				Filename  string `json:"filename"`
			} `json:"result"`
		}
		if err := json.Unmarshal(initRespBody, &statusCheck); err != nil {
			return "", "", fmt.Errorf("init: decode: %w (body: %s)", err, string(initRespBody[:min(len(initRespBody), 300)]))
		}

		// Got an upload URL — no active import, proceed.
		if statusCheck.Result.UploadURL != "" {
			return statusCheck.Result.UploadURL, statusCheck.Result.Filename, nil
		}

		// Previous import with same etag already completed — data is there.
		if statusCheck.Result.Status == "complete" {
			return "", "", errImportAlreadyComplete
		}

		// Another import is active — retry with jittered exponential backoff.
		// D1 returns this as either status="active" or success=false with an error message
		// ("Currently processing a long-running import...").
		isActive := statusCheck.Result.Status == "active" ||
			(!statusCheck.Result.Success && statusCheck.Result.Error != "")
		if isActive {
			delay := min(baseDelay*(1<<attempt), 30*time.Second)
			jitter := time.Duration(float64(delay) * (0.5 + rand.Float64()))
			fmt.Printf("  D1 import busy, retrying in %v (attempt %d/%d)...\n", jitter.Round(time.Millisecond), attempt+1, maxRetries)
			time.Sleep(jitter)
			continue
		}

		return "", "", fmt.Errorf("init: unexpected response: %s", string(initRespBody[:min(len(initRespBody), 500)]))
	}

	return "", "", fmt.Errorf("init: gave up after %d retries waiting for active import to complete", maxRetries)
}
