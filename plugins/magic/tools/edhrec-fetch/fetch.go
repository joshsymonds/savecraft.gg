package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	edhrecBaseURL = "https://json.edhrec.com"

	// maxResponseSize caps how much JSON we'll read from EDHREC per request.
	// Real payloads are ~150KB; 10MB is a safety valve for runaway responses
	// that would otherwise OOM the tool on a malicious or broken upstream.
	maxResponseSize = 10 << 20 // 10 MiB
)

// errNotFound indicates the EDHREC page does not exist (404 or 403).
// Callers should treat this as "skip this commander" rather than a hard error.
type errNotFound struct {
	URL        string
	StatusCode int
}

func (e errNotFound) Error() string {
	return fmt.Sprintf("edhrec: no data for %s (HTTP %d)", e.URL, e.StatusCode)
}

// fetchJSON downloads a JSON page from EDHREC. Returns the raw bytes and an
// errNotFound error for 403/404 responses. Context is honored — a cancelled
// or timed-out ctx aborts the in-flight request. Response size is bounded
// by maxResponseSize.
func fetchJSON(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	// EDHREC responds to default User-Agents but a descriptive one is polite.
	req.Header.Set("User-Agent", "savecraft-edhrec-fetch/0.1 (https://savecraft.gg)")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden {
		return nil, errNotFound{URL: url, StatusCode: resp.StatusCode}
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("edhrec: HTTP %d for %s: %s", resp.StatusCode, url, string(body))
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxResponseSize))
}

// commanderPageURL, combosPageURL, averageDecksPageURL return the JSON URLs.
func commanderPageURL(slug string) string {
	return fmt.Sprintf("%s/pages/commanders/%s.json", edhrecBaseURL, slug)
}
func combosPageURL(slug string) string {
	return fmt.Sprintf("%s/pages/combos/%s.json", edhrecBaseURL, slug)
}
func averageDecksPageURL(slug string) string {
	return fmt.Sprintf("%s/pages/average-decks/%s.json", edhrecBaseURL, slug)
}

// contentHash returns a hex SHA-256 of the input bytes.
func contentHash(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// cacheWrite writes data to cacheDir/filename atomically.
func cacheWrite(cacheDir, filename string, data []byte) error {
	if err := os.MkdirAll(cacheDir, 0o755); err != nil {
		return err
	}
	path := filepath.Join(cacheDir, filename)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// newHTTPClient returns a client with a reasonable timeout.
func newHTTPClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second}
}
