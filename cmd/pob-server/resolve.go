package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// resolveResult is the output of resolveBuildURL.
type resolveResult struct {
	xml       string // decoded build XML
	buildID   string // content hash
	summary   string // calc summary JSON (only set for cached builds)
	sourceURL string // original URL
	cached    bool   // true if resolved from internal store (no calc needed)
}

// maxResolveBody limits fetched build code responses to 1 MB.
const maxResolveBody = 1024 * 1024

// resolveBuildURL fetches a build code from a URL and decodes it to XML.
// For internal pob.savecraft.gg URLs, it returns the stored build directly.
// For external URLs, only known paste sites (pobb.in, pastebin.com) are allowed.
func resolveBuildURL(
	rawURL string,
	store *BuildStore,
	client *http.Client,
) (*resolveResult, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf(
			"invalid URL: must be a full URL (e.g. https://pobb.in/abc)",
		)
	}

	// Internal: pob.savecraft.gg/{id}
	if isInternalHost(parsed.Host) {
		return resolveInternal(parsed, store)
	}

	// Only allow known paste sites to prevent SSRF
	if !isAllowedExternalHost(parsed.Host) {
		return nil, fmt.Errorf(
			"unsupported host %q: only pobb.in and pastebin.com URLs are supported",
			parsed.Host,
		)
	}

	// External: fetch and decode
	return resolveExternal(rawURL, parsed, client)
}

func isInternalHost(host string) bool {
	return host == "pob.savecraft.gg"
}

func isAllowedExternalHost(host string) bool {
	h := strings.ToLower(host)
	return h == "pobb.in" || h == "www.pobb.in" ||
		h == "pastebin.com" || h == "www.pastebin.com"
}

func resolveInternal(
	parsed *url.URL,
	store *BuildStore,
) (*resolveResult, error) {
	id := strings.TrimPrefix(parsed.Path, "/")
	if id == "" {
		return nil, fmt.Errorf("internal URL missing build ID")
	}

	xml, summary, err := store.Get(id)
	if err != nil {
		return nil, err
	}

	return &resolveResult{
		xml:     xml,
		buildID: id,
		summary: summary,
		cached:  true,
	}, nil
}

func resolveExternal(
	rawURL string,
	parsed *url.URL,
	client *http.Client,
) (*resolveResult, error) {
	fetchURL := buildFetchURL(rawURL, parsed)

	resp, err := client.Get(fetchURL) //nolint:noctx // no request context available
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", fetchURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf(
			"fetching %s: HTTP %d", fetchURL, resp.StatusCode,
		)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResolveBody))
	if err != nil {
		return nil, fmt.Errorf("reading response from %s: %w", fetchURL, err)
	}

	code := strings.TrimSpace(string(body))
	if code == "" {
		return nil, errors.New("empty response from URL")
	}

	xml, err := DecodeBuildCode(code)
	if err != nil {
		return nil, fmt.Errorf("decoding build code from %s: %w", rawURL, err)
	}

	return &resolveResult{
		xml:       xml,
		buildID:   contentHash(xml),
		sourceURL: rawURL,
		cached:    false,
	}, nil
}

// buildFetchURL converts a user-facing URL to a raw/API endpoint.
func buildFetchURL(rawURL string, parsed *url.URL) string {
	host := strings.ToLower(parsed.Host)
	path := parsed.Path

	// pobb.in/{id} → pobb.in/{id}/raw
	if host == "pobb.in" || host == "www.pobb.in" {
		if !strings.HasSuffix(path, "/raw") {
			return rawURL + "/raw"
		}
		return rawURL
	}

	// pastebin.com/{id} → pastebin.com/raw/{id}
	if host == "pastebin.com" || host == "www.pastebin.com" {
		if !strings.HasPrefix(path, "/raw/") {
			id := strings.TrimPrefix(path, "/")
			return parsed.Scheme + "://" + parsed.Host + "/raw/" + id
		}
		return rawURL
	}

	// Unreachable: isAllowedExternalHost gates entry to this function.
	return rawURL
}
