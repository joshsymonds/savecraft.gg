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

// cardPageURL returns the EDHREC card-page JSON URL for a slug.
func cardPageURL(slug string) string {
	return fmt.Sprintf("%s/pages/cards/%s.json", edhrecBaseURL, slug)
}

// loadCardNamesFromD1 returns the deduped set of card names referenced in
// existing magic_edh_recommendations and magic_edh_average_decks rows.
// These are the cards we have a reason to know prices for.
func loadCardNamesFromD1(accountID, apiToken, databaseID string) ([]string, error) {
	const sqlText = `
SELECT DISTINCT card_name FROM magic_edh_recommendations
UNION
SELECT DISTINCT card_name FROM magic_edh_average_decks
ORDER BY card_name
`
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken, sqlText)
	if err != nil {
		return nil, fmt.Errorf("query card names: %w", err)
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		if name, _ := r["card_name"].(string); name != "" {
			out = append(out, name)
		}
	}
	return out, nil
}

// scrapeCardPrices fetches per-card prices from EDHREC for every name in
// cardNames, respecting the rate limiter. Failed fetches (404, parse error)
// are logged and skipped — the card is simply absent from the result set
// rather than failing the whole scrape. Returns one CardPrice per name that
// resolved successfully.
func scrapeCardPrices(
	ctx context.Context,
	client *http.Client,
	cardNames []string,
	tokens <-chan struct{},
	jsonDir string,
	parallelism int,
) []*CardPrice {
	if parallelism < 1 {
		parallelism = 1
	}

	results := make([]*CardPrice, len(cardNames))
	sem := make(chan struct{}, parallelism)
	var wg sync.WaitGroup
	var mu sync.Mutex
	processed, missing, failed := 0, 0, 0

	progressEvery := len(cardNames) / 20
	if progressEvery < 100 {
		progressEvery = 100
	}

	for i, name := range cardNames {
		wg.Add(1)
		sem <- struct{}{}
		go func(idx int, name string) {
			defer wg.Done()
			defer func() { <-sem }()

			slug := cardSlug(name)
			if slug == "" {
				return
			}

			// Per-card timeout to bound a single stuck request.
			cardCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			// Wait for a rate-limit token.
			select {
			case <-tokens:
			case <-cardCtx.Done():
				mu.Lock()
				failed++
				mu.Unlock()
				return
			}

			data, err := fetchJSON(cardCtx, client, cardPageURL(slug))
			if err != nil {
				var nf errNotFound
				mu.Lock()
				if errors.As(err, &nf) {
					missing++
				} else {
					failed++
				}
				count := processed + missing + failed
				mu.Unlock()
				if count%progressEvery == 0 {
					fmt.Printf("  card prices: %d/%d processed (%d missing, %d failed)\n",
						count, len(cardNames), missing, failed)
				}
				return
			}

			// Cache the JSON for retry/inspection.
			_ = cacheWrite(jsonDir, "card_"+slug+".json", data)

			cp, perr := ParseCardPage(name, data)
			if perr != nil {
				mu.Lock()
				failed++
				mu.Unlock()
				return
			}
			results[idx] = cp

			mu.Lock()
			processed++
			count := processed + missing + failed
			mu.Unlock()
			if count%progressEvery == 0 {
				fmt.Printf("  card prices: %d/%d processed (%d missing, %d failed)\n",
					count, len(cardNames), missing, failed)
			}
		}(i, name)
	}
	wg.Wait()

	fmt.Printf("  card prices: %d ok, %d missing (404), %d failed\n",
		processed, missing, failed)

	// Compact: drop nil slots.
	out := make([]*CardPrice, 0, processed)
	for _, r := range results {
		if r != nil {
			out = append(out, r)
		}
	}
	return out
}

// runCardPricesPhase orchestrates the card-price scrape: load names from
// D1, scrape each card's page, build SQL, import. Idempotent — a re-run
// wipes and replaces magic_edh_card_prices.
func runCardPricesPhase(
	ctx context.Context,
	client *http.Client,
	tokens <-chan struct{},
	accountID, apiToken, databaseID, cacheDir string,
	parallelism int,
	dryRun bool,
) error {
	fmt.Println("edhrec-fetch: starting card-price scrape phase")

	cardNames, err := loadCardNamesFromD1(accountID, apiToken, databaseID)
	if err != nil {
		return err
	}
	// Deduplicate and stabilize order — D1 SELECT DISTINCT should already
	// be unique, but a sort gives us reproducible logs across runs.
	sort.Strings(cardNames)
	fmt.Printf("  %d unique card names to price\n", len(cardNames))
	if len(cardNames) == 0 {
		return nil
	}

	jsonDir := filepath.Join(cacheDir, "json")
	prices := scrapeCardPrices(ctx, client, cardNames, tokens, jsonDir, parallelism)
	if len(prices) == 0 {
		fmt.Println("  no card prices captured; skipping import")
		return nil
	}

	sql := BuildCardPricesSQL(prices)
	sqlDir := filepath.Join(cacheDir, "sql")
	_ = cacheWrite(sqlDir, "card_prices.sql", []byte(sql))

	if dryRun {
		fmt.Printf("  DRY RUN — card prices SQL cached (%d bytes, %d rows)\n",
			len(sql), len(prices))
		return nil
	}

	if err := cfapi.ImportD1SQL(accountID, databaseID, apiToken, sql); err != nil {
		return fmt.Errorf("card prices import: %w", err)
	}
	fmt.Printf("  imported %d card prices\n", len(prices))
	return nil
}
