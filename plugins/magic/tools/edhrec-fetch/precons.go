package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// runPreconsPhase fetches each unique precon page in `slugs`, parses it,
// merges in MSRP metadata, and writes the result to D1 via BuildPreconSQL.
// Errors on individual precons are logged and skipped — the phase fails the
// whole run only on a D1 import error.
func runPreconsPhase(
	ctx context.Context,
	client *http.Client,
	tokens <-chan struct{},
	slugs []string,
	accountID, apiToken, databaseID, cacheDir string,
	parallelism int,
	dryRun bool,
) error {
	if len(slugs) == 0 {
		fmt.Println("precons phase: no slugs discovered, skipping")
		return nil
	}
	sort.Strings(slugs)
	fmt.Printf("precons phase: fetching %d precons\n", len(slugs))

	if parallelism < 1 {
		parallelism = 1
	}

	jsonDir := filepath.Join(cacheDir, "json")
	results := make([]*ParsedPrecon, len(slugs))
	sem := make(chan struct{}, parallelism)
	var wg sync.WaitGroup
	var mu sync.Mutex
	processed, missing, failed := 0, 0, 0

	for i, slug := range slugs {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, slug string) {
			defer wg.Done()
			defer func() { <-sem }()

			cardCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			select {
			case <-tokens:
			case <-cardCtx.Done():
				mu.Lock()
				failed++
				mu.Unlock()
				return
			}

			data, err := fetchJSON(cardCtx, client, preconPageURL(slug))
			if err != nil {
				var nf errNotFound
				mu.Lock()
				if errors.As(err, &nf) {
					missing++
				} else {
					failed++
					fmt.Printf("  precons: %s FAIL: %v\n", slug, err)
				}
				mu.Unlock()
				return
			}
			_ = cacheWrite(jsonDir, "precon_"+slug+".json", data)

			pp, perr := ParsePreconPage(slug, data)
			if perr != nil {
				mu.Lock()
				failed++
				mu.Unlock()
				fmt.Printf("  precons: %s parse FAIL: %v\n", slug, perr)
				return
			}
			// Merge MSRP metadata when known.
			if meta, ok := preconMSRP[slug]; ok {
				pp.Name = meta.Name
				pp.MSRPUSD = meta.MSRPUSD
				pp.SetCode = meta.SetCode
				pp.Year = meta.Year
			} else {
				// Use the first commander's display as a reasonable default
				// name; otherwise the slug. Better than empty for browseability.
				pp.Name = preconDisplayName(pp, slug)
			}
			results[idx] = pp

			mu.Lock()
			processed++
			mu.Unlock()
		}(i, slug)
	}
	wg.Wait()

	fmt.Printf("  precons: %d ok, %d missing (404), %d failed\n",
		processed, missing, failed)

	// Compact: drop nil slots from failed/missing.
	out := make([]*ParsedPrecon, 0, processed)
	knownMSRP := 0
	for _, r := range results {
		if r == nil {
			continue
		}
		out = append(out, r)
		if r.MSRPUSD > 0 {
			knownMSRP++
		}
	}
	if processed > 0 {
		fmt.Printf("  precons: %d/%d have known MSRP (rest will store with msrp_usd=NULL)\n",
			knownMSRP, processed)
	}

	sql := BuildPreconSQL(out)
	sqlDir := filepath.Join(cacheDir, "sql")
	_ = cacheWrite(sqlDir, "precons.sql", []byte(sql))

	if dryRun {
		fmt.Printf("  precons DRY RUN — SQL cached (%d bytes)\n", len(sql))
		return nil
	}

	if err := cfapi.ImportD1SQL(accountID, databaseID, apiToken, sql); err != nil {
		return fmt.Errorf("precon import: %w", err)
	}
	fmt.Printf("  imported %d precons\n", len(out))
	return nil
}

// preconDisplayName returns a best-effort display name for a precon whose
// slug isn't in the hardcoded MSRP table. Format: "Slug (Face Commander)".
func preconDisplayName(pp *ParsedPrecon, slug string) string {
	if len(pp.Commanders) > 0 {
		return fmt.Sprintf("%s (%s)", slug, pp.Commanders[0].CommanderName)
	}
	return slug
}
