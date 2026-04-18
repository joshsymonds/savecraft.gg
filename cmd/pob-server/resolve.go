package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
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

// buildSite describes one entry in PoB's buildSites.websiteList,
// ported from .reference/pob/src/Modules/BuildSiteTools.lua.
// Each entry maps user-facing paste URLs from a specific host to the
// raw-code fetch URL that returns the pob build code.
type buildSite struct {
	// id matches PoB's internal id field (e.g. "POBBin"). Used only by
	// TestBuildSitesListInSyncWithPoB to diff against the vendored Lua.
	id string
	// hosts are the lowercased hostnames recognized for this site.
	// First entry is canonical; the rest are accepted aliases (www., etc).
	hosts []string
	// matchPath is applied to the parsed URL path (starting with "/").
	// Capture group 1 MUST yield the paste ID.
	matchPath *regexp.Regexp
	// downloadFormat is a Sprintf-style template with a single %s for the
	// paste ID. The result is the full raw-code fetch URL.
	downloadFormat string
}

// buildSitesList mirrors PoB's buildSites.websiteList at
// .reference/pob/src/Modules/BuildSiteTools.lua:10-29. Keep in sync —
// TestBuildSitesListInSyncWithPoB fails on drift. Adding a site here
// expands pob-server's SSRF allowlist, so every change must be
// deliberate and reviewed.
//
//nolint:gochecknoglobals // static allowlist shared across functions; regex compiled once at init
var buildSitesList = []buildSite{
	{
		id:             "Maxroll",
		hosts:          []string{"maxroll.gg", "www.maxroll.gg"},
		matchPath:      regexp.MustCompile(`^/poe/pob/(.+?)/?$`),
		downloadFormat: "https://maxroll.gg/poe/api/pob/%s",
	},
	{
		id:             "POBBin",
		hosts:          []string{"pobb.in", "www.pobb.in"},
		matchPath:      regexp.MustCompile(`^/(?:pob/)?(.+?)(?:/raw)?/?$`),
		downloadFormat: "https://pobb.in/pob/%s",
	},
	{
		id:             "PoeNinja",
		hosts:          []string{"poe.ninja", "www.poe.ninja"},
		matchPath:      regexp.MustCompile(`^/(?:poe1/)?pob/(\w+)/?$`),
		downloadFormat: "https://poe.ninja/poe1/pob/raw/%s",
	},
	{
		id:             "pastebin",
		hosts:          []string{"pastebin.com", "www.pastebin.com"},
		matchPath:      regexp.MustCompile(`^/(?:raw/)?(\w+)/?$`),
		downloadFormat: "https://pastebin.com/raw/%s",
	},
	{
		id:             "pastebinProxy",
		hosts:          []string{"pastebinp.com", "www.pastebinp.com"},
		matchPath:      regexp.MustCompile(`^/(?:raw/)?(\w+)/?$`),
		downloadFormat: "https://pastebinp.com/raw/%s",
	},
	{
		id:             "rentry",
		hosts:          []string{"rentry.co", "www.rentry.co"},
		matchPath:      regexp.MustCompile(`^/(\w+)/?$`),
		downloadFormat: "https://rentry.co/paste/%s/raw",
	},
	{
		id:             "PoEDB",
		hosts:          []string{"poedb.tw", "www.poedb.tw"},
		matchPath:      regexp.MustCompile(`^/pob/(.+?)(?:/raw)?/?$`),
		downloadFormat: "https://poedb.tw/pob/%s/raw",
	},
}

// resolveBuildURL fetches a build code from a URL and decodes it to XML.
// For internal pob.savecraft.gg URLs, it returns the stored build directly.
// For external URLs, only hosts in buildSitesList (mirror of PoB's
// buildSites.websiteList) are allowed.
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

	if !isHTTPScheme(parsed.Scheme) {
		return nil, fmt.Errorf(
			"unsupported URL scheme %q: only http and https are supported",
			parsed.Scheme,
		)
	}

	// Internal: pob.savecraft.gg/{id}
	if isInternalHost(parsed.Host) {
		return resolveInternal(parsed, store)
	}

	_, fetchURL, err := matchBuildSite(parsed)
	if err != nil {
		return nil, err
	}

	return resolveExternal(rawURL, fetchURL, client)
}

func isHTTPScheme(scheme string) bool {
	s := strings.ToLower(scheme)
	return s == "http" || s == "https"
}

func isInternalHost(host string) bool {
	return strings.EqualFold(host, "pob.savecraft.gg")
}

// matchBuildSite finds the buildSite entry matching the URL's host and
// path, returning the site and the full download URL to fetch. Returns
// an error whose message lists supported hosts when no match is found.
func matchBuildSite(parsed *url.URL) (*buildSite, string, error) {
	host := strings.ToLower(parsed.Host)
	for i := range buildSitesList {
		site := &buildSitesList[i]
		if !hostMatchesSite(site, host) {
			continue
		}
		match := site.matchPath.FindStringSubmatch(parsed.Path)
		if len(match) < 2 || match[1] == "" {
			return nil, "", fmt.Errorf(
				"URL path %q does not match the expected shape for %s "+
					"(e.g. %s)",
				parsed.Path, site.hosts[0],
				fmt.Sprintf(site.downloadFormat, "<id>"),
			)
		}
		return site, fmt.Sprintf(site.downloadFormat, match[1]), nil
	}
	return nil, "", fmt.Errorf(
		"unsupported host %q: supported hosts are %s",
		parsed.Host, supportedHostsForError(),
	)
}

func hostMatchesSite(site *buildSite, lowerHost string) bool {
	return slices.Contains(site.hosts, lowerHost)
}

// supportedHostsForError returns a comma-separated list of canonical
// supported hosts for use in user-facing error messages.
func supportedHostsForError() string {
	canonical := make([]string, 0, len(buildSitesList))
	for _, site := range buildSitesList {
		if len(site.hosts) == 0 {
			continue
		}
		canonical = append(canonical, site.hosts[0])
	}
	return strings.Join(canonical, ", ")
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
	fetchURL string,
	client *http.Client,
) (*resolveResult, error) {
	resp, err := client.Get(fetchURL) //nolint:noctx // no request context available
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", fetchURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf(
			"build not found at %s — the paste may have been deleted or the URL may be incorrect",
			rawURL,
		)
	}
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
