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
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/parser/data"
)

const (
	gameDataURL = "https://17lands-public.s3.amazonaws.com/analysis_data/game_data/game_data_public.%s.PremierDraft.csv.gz"
	maxProbes   = 20 // concurrent HEAD requests
)

// Discover returns Arena set codes that have 17Lands Premier Draft data.
// It extracts distinct set codes from the generated ArenaCards map, then
// probes 17Lands S3 concurrently to filter to sets with published data.
func Discover(ctx context.Context) ([]string, error) {
	candidates := arenaSetCodes()
	fmt.Printf("Discovering sets with 17Lands data (%d Arena sets to probe)...\n", len(candidates))

	client := &http.Client{Timeout: 10 * time.Second}

	var (
		mu    sync.Mutex
		found []string
		wg    sync.WaitGroup
		sem   = make(chan struct{}, maxProbes)
	)

	for _, code := range candidates {
		wg.Add(1)
		go func(setCode string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			url := fmt.Sprintf(gameDataURL, setCode)
			req, err := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
			if err != nil {
				return
			}
			resp, err := client.Do(req)
			if err != nil {
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
