// Package sets discovers MTGA set codes with 17Lands Premier Draft data.
//
// Set codes are extracted from the generated ArenaCards map (sourced from MTGA's
// Raw_CardDatabase via mtga-carddb), then filtered by HEAD-probing 17Lands S3
// to find sets that have published draft data.
package sets

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/magic/parser/data"
)

const (
	// GameDataURL is the 17Lands S3 URL template for Premier Draft game data.
	// Used by Discover for probing and by 17lands-fetch for downloading.
	GameDataURL = "https://17lands-public.s3.amazonaws.com/analysis_data/game_data/game_data_public.%s.PremierDraft.csv.gz"

	maxProbes = 20 // concurrent HEAD requests
)

// Resolve returns the target set list for a pipeline tool. If setFilter is
// non-empty, it returns that single set code (uppercased) without discovery.
// Otherwise it calls Discover to probe 17Lands for available sets.
func Resolve(ctx context.Context, setFilter string) ([]string, error) {
	if setFilter != "" {
		return []string{strings.ToUpper(setFilter)}, nil
	}
	discovered, err := Discover(ctx)
	if err != nil {
		return nil, fmt.Errorf("discovering sets: %w", err)
	}
	if len(discovered) == 0 {
		return nil, fmt.Errorf("no sets with 17Lands data found")
	}
	return discovered, nil
}

// Discover returns Arena set codes that have 17Lands Premier Draft data.
// It extracts distinct set codes from the generated ArenaCards map, then
// probes 17Lands S3 concurrently to filter to sets with published data.
func Discover(ctx context.Context) ([]string, error) {
	candidates := arenaSetCodes()
	fmt.Printf("Discovering sets with 17Lands data (%d Arena sets to probe)...\n", len(candidates))

	client := &http.Client{Timeout: 10 * time.Second}

	var (
		mu       sync.Mutex
		found    []string
		wg       sync.WaitGroup
		sem      = make(chan struct{}, maxProbes)
		errCount atomic.Int32
	)

	for _, code := range candidates {
		wg.Add(1)
		go func(setCode string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			url := fmt.Sprintf(GameDataURL, setCode)
			req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
			if err != nil {
				errCount.Add(1)
				return
			}
			resp, err := client.Do(req)
			if err != nil {
				errCount.Add(1)
				return
			}
			resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				mu.Lock()
				found = append(found, setCode)
				mu.Unlock()
			}
		}(code)
	}
	wg.Wait()

	if n := errCount.Load(); n > 0 {
		fmt.Fprintf(os.Stderr, "WARN: %d/%d probes failed (network error or timeout)\n", n, len(candidates))
	}
	if len(found) == 0 && errCount.Load() > 0 {
		return nil, fmt.Errorf("all %d probes failed — check network connectivity", len(candidates))
	}

	sort.Strings(found)
	fmt.Printf("Discovered %d sets with 17Lands data: %v\n", len(found), found)
	return found, nil
}

// arenaSetCodes returns distinct uppercase set codes from the generated ArenaCards map.
func arenaSetCodes() []string {
	seen := make(map[string]struct{}, 256)
	for _, card := range data.ArenaCards {
		code := strings.ToUpper(card.Set)
		seen[code] = struct{}{}
	}

	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}
