// edhrec-fetch downloads Commander data from EDHREC's JSON API and imports
// it into Cloudflare D1. Populates the magic_edh_* tables defined in
// migration 0044.
//
// Usage:
//
//	go run ./plugins/magic/tools/edhrec-fetch \
//	    --cf-account-id=... --cf-api-token=... --d1-database-id=... \
//	    [--commander=atraxa-praetors-voice] [--dry-run]
//
// Data source: EDHREC (edhrec.com), undocumented JSON API at json.edhrec.com.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const pipelineTool = "edhrec"

func main() {
	var (
		cfAccountID  = flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
		cfAPIToken   = flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
		d1DatabaseID = flag.String("d1-database-id", "", "D1 database UUID (required unless --dry-run)")
		commander    = flag.String("commander", "", "single commander slug filter (e.g. atraxa-praetors-voice)")
		cacheDir     = flag.String("cache-dir", defaultCacheDir(), "directory for cached JSON and SQL")
		dryRun       = flag.Bool("dry-run", false, "fetch and build SQL but don't import to D1")
		rateLimit    = flag.Float64("rate-limit", 5, "EDHREC requests per second")
		parallelism  = flag.Int("parallelism", 4, "concurrent commander workers")
		retry        = flag.Bool("retry", false, "retry cached SQL files from disk")
	)
	flag.Parse()

	if err := run(*cfAccountID, *cfAPIToken, *d1DatabaseID, *commander, *cacheDir,
		*dryRun, *retry, *rateLimit, *parallelism); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func defaultCacheDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "savecraft", "edhrec")
	}
	return filepath.Join(home, ".cache", "savecraft", "edhrec")
}

// commanderInput is the minimal info we carry from the magic_cards enumeration
// through to the fetch step. We intentionally do NOT carry a scryfall_id here
// because magic_cards stores oracle_id and EDHREC keys by scryfall_id — the
// two are distinct and conflating them would be a bug. The scryfall_id arrives
// later from EDHREC's response.
type commanderInput struct {
	Name string
	Slug string
}

func run(accountID, apiToken, databaseID, commanderFilter, cacheDir string,
	dryRun, retryMode bool, rateLimit float64, parallelism int) error {

	sqlDir := filepath.Join(cacheDir, "sql")
	jsonDir := filepath.Join(cacheDir, "json")

	// Retry mode reimports previously-cached SQL files.
	if retryMode {
		if !requireCreds(accountID, apiToken, databaseID) {
			return errors.New("--retry requires --cf-account-id, --cf-api-token, --d1-database-id")
		}
		return cfapi.RetryFromDisk(accountID, databaseID, apiToken, sqlDir, ".sql")
	}

	if !dryRun && !requireCreds(accountID, apiToken, databaseID) {
		return errors.New("--d1-database-id (with credentials) or --dry-run required")
	}

	// Enumerate commanders to process.
	var targets []commanderInput
	if commanderFilter != "" {
		// Single-commander mode: we don't know the scryfall ID or name
		// without EDHREC giving them back. Seed with the slug only and
		// fill the rest from the commander page response.
		targets = []commanderInput{{Slug: commanderFilter}}
	} else {
		if !dryRun {
			list, err := enumerateCommanders(accountID, apiToken, databaseID)
			if err != nil {
				return fmt.Errorf("enumerate commanders: %w", err)
			}
			targets = list
		} else {
			return errors.New("--dry-run requires --commander=<slug> (cannot enumerate without D1 creds)")
		}
	}
	fmt.Printf("edhrec-fetch: %d commander(s) to process\n", len(targets))

	// Load existing pipeline hashes in one query.
	existingHashes := map[string]string{}
	if !dryRun {
		h, err := cfapi.GetAllPipelineHashes(accountID, databaseID, apiToken, pipelineTool)
		if err != nil {
			return fmt.Errorf("load pipeline state: %w", err)
		}
		existingHashes = h
	}

	// Rate limiter: tokens drip into the channel at the configured rate.
	// Workers consume tokens before each HTTP request, so the limit is enforced
	// at the actual point of network IO — not at goroutine spawn time (which
	// the ticker-in-caller-loop approach allowed to drift and burst).
	ctx := context.Background()
	interval := time.Duration(float64(time.Second) / rateLimit)
	tokens := make(chan struct{}, 1)
	tickerDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		// Emit an initial token immediately so the first request doesn't wait.
		tokens <- struct{}{}
		for {
			select {
			case <-tickerDone:
				return
			case <-ticker.C:
				select {
				case tokens <- struct{}{}:
				default:
					// Buffer full — skip this tick so the channel never grows
					// beyond capacity 1 (prevents bursting).
				}
			}
		}
	}()
	defer close(tickerDone)

	sem := make(chan struct{}, parallelism)
	var wg sync.WaitGroup
	var mu sync.Mutex
	processed, skipped, failed := 0, 0, 0
	client := newHTTPClient()

	for _, t := range targets {
		wg.Add(1)
		sem <- struct{}{}
		go func(target commanderInput) {
			defer wg.Done()
			defer func() { <-sem }()

			status := processCommander(ctx, client, target, existingHashes, tokens,
				accountID, apiToken, databaseID, jsonDir, sqlDir, dryRun)

			mu.Lock()
			defer mu.Unlock()
			switch status {
			case statusOK:
				processed++
			case statusSkipped:
				skipped++
			case statusFailed:
				failed++
			}
		}(t)
	}

	wg.Wait()
	fmt.Printf("edhrec-fetch: %d processed, %d skipped, %d failed\n", processed, skipped, failed)
	if failed > 0 {
		return fmt.Errorf("%d commanders failed", failed)
	}

	// After all commanders are imported, rebuild the magic_edh_themes
	// pre-aggregation so commander_trends can serve themes mode from a
	// small indexed table instead of scanning every commander on each
	// request. Runs as a single D1 statement.
	if !dryRun {
		if err := rebuildThemesAggregate(accountID, apiToken, databaseID); err != nil {
			fmt.Fprintf(os.Stderr, "WARN: failed to rebuild magic_edh_themes: %v\n", err)
		}
	}

	return nil
}

// rebuildThemesAggregate repopulates magic_edh_themes from the themes JSON
// column of every commander. Uses SQLite json_each to flatten the JSON
// arrays server-side and compute per-slug totals in a single statement.
//
// The aliases intentionally avoid shadowing json_each's own columns (value,
// key, type, atom, id, parent). Using `value` as an alias confuses the
// planner and collapses the GROUP BY into a single bucket.
func rebuildThemesAggregate(accountID, apiToken, databaseID string) error {
	sql := `
DELETE FROM magic_edh_themes;
INSERT INTO magic_edh_themes (slug, value, total_count, commander_count)
SELECT
  json_extract(t.value, '$.slug') AS theme_slug,
  json_extract(t.value, '$.value') AS theme_name,
  SUM(CAST(json_extract(t.value, '$.count') AS INTEGER)) AS total_count,
  COUNT(*) AS commander_count
FROM magic_edh_commanders c, json_each(c.themes) t
WHERE c.themes != '[]' AND c.themes IS NOT NULL
GROUP BY theme_slug
HAVING theme_slug IS NOT NULL AND theme_slug != ''
ORDER BY total_count DESC;
`
	return cfapi.ImportD1SQL(accountID, databaseID, apiToken, sql)
}

type processStatus int

const (
	statusOK processStatus = iota
	statusSkipped
	statusFailed
)

// processCommander fetches one commander and imports its data. It prints
// progress to stdout and returns a status for the summary counters.
func processCommander(ctx context.Context, client *http.Client, target commanderInput,
	existingHashes map[string]string, tokens <-chan struct{},
	accountID, apiToken, databaseID, jsonDir, sqlDir string, dryRun bool,
) processStatus {
	slug := target.Slug
	if slug == "" && target.Name != "" {
		slug = commanderSlug(target.Name)
	}
	if slug == "" {
		fmt.Printf("  SKIP: empty slug for %+v\n", target)
		return statusFailed
	}

	// Per-commander timeout so a single stuck HTTP call can't block forever
	// regardless of the client-level timeout. 90s covers 3 sequential fetches
	// with headroom for slow EDHREC responses.
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()

	// Rate-limited fetch helper: wait for a token, then call fetchJSON.
	rateLimitedFetch := func(url string) ([]byte, error) {
		select {
		case <-tokens:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return fetchJSON(ctx, client, url)
	}

	// Fetch commander page
	commanderData, err := rateLimitedFetch(commanderPageURL(slug))
	if err != nil {
		var nf errNotFound
		if errors.As(err, &nf) {
			fmt.Printf("  %s: no data (HTTP %d)\n", slug, nf.StatusCode)
			return statusSkipped
		}
		fmt.Printf("  %s: FAIL commander: %v\n", slug, err)
		return statusFailed
	}

	// Check content hash against pipeline state
	hash := contentHash(commanderData)
	if existingHashes[slug] == hash {
		fmt.Printf("  %s: unchanged, skipping\n", slug)
		return statusSkipped
	}

	pc, err := ParseCommanderPage(commanderData)
	if err != nil {
		fmt.Printf("  %s: FAIL parse: %v\n", slug, err)
		return statusFailed
	}
	if pc.ScryfallID == "" {
		fmt.Printf("  %s: no scryfall ID in response, skipping\n", slug)
		return statusSkipped
	}

	// Fetch combos (non-fatal on not-found)
	var combos []Combo
	if data, err := rateLimitedFetch(combosPageURL(slug)); err == nil {
		combos, _ = ParseCombosPage(data)
		_ = cacheWrite(jsonDir, slug+"_combos.json", data)
	} else {
		var nf errNotFound
		if !errors.As(err, &nf) {
			fmt.Printf("  %s: WARN combos: %v\n", slug, err)
		}
	}

	// Fetch average deck (non-fatal on not-found)
	var avg []AverageDeckEntry
	if data, err := rateLimitedFetch(averageDecksPageURL(slug)); err == nil {
		avg, _ = ParseAverageDecksPage(data)
		_ = cacheWrite(jsonDir, slug+"_average.json", data)
	} else {
		var nf errNotFound
		if !errors.As(err, &nf) {
			fmt.Printf("  %s: WARN average: %v\n", slug, err)
		}
	}

	_ = cacheWrite(jsonDir, slug+"_commander.json", commanderData)

	sql := BuildCommanderSQL(pc, combos, avg)
	_ = cacheWrite(sqlDir, slug+".sql", []byte(sql))

	if dryRun {
		fmt.Printf("  %s: DRY RUN — SQL cached (%d bytes)\n", slug, len(sql))
		return statusOK
	}

	if err := cfapi.ImportD1SQL(accountID, databaseID, apiToken, sql); err != nil {
		fmt.Printf("  %s: FAIL import: %v\n", slug, err)
		return statusFailed
	}

	// Row count estimate for pipeline state
	rowCount := 1 + len(pc.Recs) + len(combos) + len(avg) + len(pc.Curve)
	if err := cfapi.UpdatePipelineState(accountID, databaseID, apiToken, pipelineTool, slug, hash, rowCount); err != nil {
		fmt.Printf("  %s: WARN pipeline state: %v\n", slug, err)
	}

	// Remove cached SQL on success so retry doesn't re-process.
	_ = os.Remove(filepath.Join(sqlDir, slug+".sql"))

	fmt.Printf("  %s: OK (%d recs, %d combos, %d avg entries)\n",
		slug, len(pc.Recs), len(combos), len(avg))
	return statusOK
}

// enumerateCommanders queries magic_cards for legal commanders.
func enumerateCommanders(accountID, apiToken, databaseID string) ([]commanderInput, error) {
	// Note: legalities is stored as a JSON string in magic_cards. D1 lacks
	// JSON path operators, so we fall back to substring matching. The Scryfall
	// bulk data is consistent about serialization so this is stable in practice,
	// but worth revisiting if we hit whitespace or key-order variance.
	sql := `
SELECT name
FROM magic_cards
WHERE legalities LIKE '%"commander":"legal"%'
  AND (type_line LIKE '%Legendary Creature%'
       OR oracle_text LIKE '%can be your commander%')
GROUP BY name
ORDER BY name
`
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return nil, err
	}
	// De-dupe by name (Scryfall has multiple printings per card).
	seen := map[string]bool{}
	var out []commanderInput
	for _, r := range rows {
		name, _ := r["name"].(string)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, commanderInput{
			Name: name,
			Slug: commanderSlug(name),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func requireCreds(accountID, apiToken, databaseID string) bool {
	return accountID != "" && apiToken != "" && databaseID != ""
}
