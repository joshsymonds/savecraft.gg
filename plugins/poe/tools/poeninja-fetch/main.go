// poeninja-fetch populates the poe_uniques table in D1 from poe.ninja's item
// overview API. It fetches unique items from both Standard and the current
// league, deduplicates by name (preferring league data), and optionally
// populates a Vectorize index for semantic search.
//
// Usage: go run ./plugins/poe/tools/poeninja-fetch --d1-database-id=UUID [--vectorize-index=NAME] [--league=NAME]
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const (
	ninjaBaseURL = "https://poe.ninja/api/data/itemoverview"
	requestDelay = 200 * time.Millisecond // 5 RPS limit
)

// ninjaItemTypes is the list of poe.ninja item types that contain unique items.
var ninjaItemTypes = []string{
	"UniqueWeapon",
	"UniqueArmour",
	"UniqueAccessory",
	"UniqueFlask",
	"UniqueJewel",
	"UniqueMap",
}

// NinjaResponse is the top-level response from poe.ninja's item overview API.
type NinjaResponse struct {
	Lines []NinjaItem `json:"lines"`
}

// NinjaItem represents a single unique item from poe.ninja.
type NinjaItem struct {
	Name              string     `json:"name"`
	BaseType          string     `json:"baseType"`
	ItemType          string     `json:"itemType"`
	LevelRequired     int        `json:"levelRequired"`
	ImplicitModifiers []NinjaMod `json:"implicitModifiers"`
	ExplicitModifiers []NinjaMod `json:"explicitModifiers"`
	FlavourText       string     `json:"flavourText"`
	Variant           string     `json:"variant"`
	Links             int        `json:"links"`
}

// NinjaMod is a modifier on a unique item from poe.ninja.
type NinjaMod struct {
	Text     string `json:"text"`
	Optional bool   `json:"optional"`
}

// ProcessedUnique holds the processed unique item data ready for SQL generation.
type ProcessedUnique struct {
	Name         string
	Variant      string
	BaseType     string
	ItemClass    string
	LevelReq     int
	ImplicitMods string // JSON array of strings
	ExplicitMods string // JSON array of strings
	FlavourText  string
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (required)")
	vectorizeIndex := flag.String("vectorize-index", "", "Vectorize index name (enables Vectorize population)")
	league := flag.String("league", "Settlers", "Current league name")
	dryRun := flag.Bool("dry-run", false, "Print SQL without importing")
	flag.Parse()

	if *d1DatabaseID == "" && !*dryRun {
		return fmt.Errorf("--d1-database-id is required (or use --dry-run)")
	}

	if !*dryRun {
		var missing []string
		if *cfAccountID == "" {
			missing = append(missing, "--cf-account-id / CLOUDFLARE_ACCOUNT_ID")
		}
		if *cfAPIToken == "" {
			missing = append(missing, "--cf-api-token / CLOUDFLARE_API_TOKEN")
		}
		if len(missing) > 0 {
			return fmt.Errorf("missing required flags: %s", strings.Join(missing, ", "))
		}
	}

	// Fetch unique items from Standard and league.
	fmt.Printf("Fetching uniques from Standard (%d types)...\n", len(ninjaItemTypes))
	standardItems, err := fetchAllTypes("Standard")
	if err != nil {
		return fmt.Errorf("fetching Standard uniques: %w", err)
	}
	fmt.Printf("Fetched %d Standard uniques\n", len(standardItems))

	fmt.Printf("Fetching uniques from %s (%d types)...\n", *league, len(ninjaItemTypes))
	leagueItems, err := fetchAllTypes(*league)
	if err != nil {
		return fmt.Errorf("fetching %s uniques: %w", *league, err)
	}
	fmt.Printf("Fetched %d %s uniques\n", len(leagueItems), *league)

	// Deduplicate: league preferred over Standard.
	uniques := deduplicateUniques(standardItems, leagueItems)
	fmt.Printf("Deduplicated to %d unique items\n", len(uniques))

	// Build SQL.
	fmt.Println("\nBuilding SQL...")
	sql := buildUniqueSQL(uniques)

	if *dryRun {
		fmt.Println(sql)
		return nil
	}

	// Content hash for change detection.
	h := sha256.Sum256([]byte(sql))
	contentHash := hex.EncodeToString(h[:])

	// D1 and Vectorize run concurrently.
	var wg sync.WaitGroup
	errs := make(chan error, 2)

	wg.Go(func() {
		existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "poeninja", cfapi.PipelineGlobalSet)
		if err == nil && existing == contentHash {
			fmt.Println("D1 data unchanged (hash match), skipping import")
			return
		}

		// Write SQL to disk for debugging.
		sqlDir := filepath.Join(os.TempDir(), "savecraft", "sql")
		sqlPath := "(not cached)"
		if err := os.MkdirAll(sqlDir, 0700); err != nil {
			fmt.Printf("WARN: could not create temp dir: %v\n", err)
		} else {
			sqlPath = filepath.Join(sqlDir, "poeninja_poe.sql")
			if err := os.WriteFile(sqlPath, []byte(sql), 0600); err != nil {
				fmt.Printf("WARN: could not cache SQL to disk: %v\n", err)
				sqlPath = "(not cached)"
			}
		}

		fmt.Printf("Generated %.1f KB of SQL (%d uniques)\n",
			float64(len(sql))/1024, len(uniques))

		fmt.Println("Importing to D1...")
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			errs <- fmt.Errorf("D1 import: %w (SQL cached at %s)", err, sqlPath)
			return
		}
		os.Remove(sqlPath)

		if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "poeninja", cfapi.PipelineGlobalSet, contentHash, len(uniques)); err != nil {
			fmt.Printf("WARN: pipeline state update failed: %v\n", err)
		}

		fmt.Println("D1 population complete")
	})

	if *vectorizeIndex != "" {
		wg.Go(func() {
			fmt.Println("\nPopulating Vectorize index with uniques...")
			if err := populateVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, uniques); err != nil {
				errs <- fmt.Errorf("populating vectorize: %w", err)
				return
			}
			fmt.Println("Vectorize population complete")
		})
	}

	wg.Wait()
	close(errs)

	var errMsgs []string
	for err := range errs {
		errMsgs = append(errMsgs, err.Error())
	}
	if len(errMsgs) > 0 {
		return fmt.Errorf("cloudflare population failed:\n  %s", strings.Join(errMsgs, "\n  "))
	}

	return nil
}

// fetchAllTypes fetches unique items from all 6 poe.ninja type endpoints for a league.
func fetchAllTypes(league string) ([]NinjaItem, error) {
	var all []NinjaItem
	for i, itemType := range ninjaItemTypes {
		if i > 0 {
			time.Sleep(requestDelay)
		}
		items, err := fetchNinjaType(league, itemType)
		if err != nil {
			return nil, fmt.Errorf("fetching %s/%s: %w", league, itemType, err)
		}
		fmt.Printf("  %s: %d items\n", itemType, len(items))
		all = append(all, items...)
	}
	return all, nil
}

// fetchNinjaType fetches a single poe.ninja item type endpoint.
func fetchNinjaType(league, itemType string) ([]NinjaItem, error) {
	url := fmt.Sprintf("%s?league=%s&type=%s", ninjaBaseURL, league, itemType)

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	var result NinjaResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	return result.Lines, nil
}

// deduplicateUniques merges Standard and league items, preferring league data.
//
// poe.ninja returns separate entries for linked variants (5L, 6L) which are
// just pricing splits — we filter to links=0 only. Some reworked items share
// the same (name, variant) but have different base types with different mods
// (e.g., Briskwrap on Sun Leather vs Strapped Leather). For these, we
// synthesize a variant from the base type to preserve both versions.
func deduplicateUniques(standard, league []NinjaItem) []ProcessedUnique {
	// First pass: filter to links=0 and collect all items per (name, variant).
	type nameVariant struct{ name, variant string }
	allItems := make(map[nameVariant][]NinjaItem)

	addItems := func(items []NinjaItem) {
		for _, item := range items {
			if item.Name == "" || item.Links > 0 {
				continue
			}
			k := nameVariant{item.Name, item.Variant}
			allItems[k] = append(allItems[k], item)
		}
	}
	addItems(standard)
	addItems(league)

	// Second pass: for each (name, variant) group, check if multiple base types
	// exist. If so, use base type as the variant discriminator.
	type key struct{ name, variant string }
	byKey := make(map[key]ProcessedUnique)

	for nv, items := range allItems {
		// Deduplicate within the group: prefer league items by processing
		// Standard first, then league overwrites.
		baseTypes := make(map[string]NinjaItem)
		for _, item := range items {
			baseTypes[item.BaseType] = item
		}

		if len(baseTypes) == 1 {
			// Single base type — use original variant.
			for _, item := range baseTypes {
				k := key{nv.name, nv.variant}
				byKey[k] = processNinjaItem(item)
			}
		} else {
			// Multiple base types (reworked item) — include base type in variant.
			for baseType, item := range baseTypes {
				variant := item.Variant
				if variant == "" {
					variant = baseType
				} else {
					variant = variant + ", " + baseType
				}
				k := key{nv.name, variant}
				p := processNinjaItem(item)
				p.Variant = variant
				byKey[k] = p
			}
		}
	}

	// Sort by (name, variant) for deterministic SQL output.
	result := make([]ProcessedUnique, 0, len(byKey))
	for _, u := range byKey {
		result = append(result, u)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Name != result[j].Name {
			return result[i].Name < result[j].Name
		}
		return result[i].Variant < result[j].Variant
	})

	return result
}

// processNinjaItem converts a poe.ninja item into a ProcessedUnique.
func processNinjaItem(item NinjaItem) ProcessedUnique {
	implicits := make([]string, 0, len(item.ImplicitModifiers))
	for _, m := range item.ImplicitModifiers {
		if m.Text != "" {
			implicits = append(implicits, m.Text)
		}
	}

	explicits := make([]string, 0, len(item.ExplicitModifiers))
	for _, m := range item.ExplicitModifiers {
		if m.Text != "" {
			explicits = append(explicits, m.Text)
		}
	}

	return ProcessedUnique{
		Name:         item.Name,
		Variant:      item.Variant,
		BaseType:     item.BaseType,
		ItemClass:    item.ItemType,
		LevelReq:     item.LevelRequired,
		ImplicitMods: cfapi.JSONArray(implicits),
		ExplicitMods: cfapi.JSONArray(explicits),
		FlavourText:  item.FlavourText,
	}
}

// uniqueEmbeddingText builds the text used for Vectorize embedding.
func uniqueEmbeddingText(u ProcessedUnique) string {
	// Parse explicit mods back to slice for embedding text.
	var mods []string
	_ = json.Unmarshal([]byte(u.ExplicitMods), &mods)
	return u.Name + " " + u.BaseType + " " + strings.Join(mods, " ")
}

// populateVectorize embeds unique items and upserts vectors.
func populateVectorize(accountID, indexName, apiToken string, uniques []ProcessedUnique) error {
	const embeddingBatchSize = 100
	const vectorizeBatchSize = 1000
	const embeddingConcurrency = 6

	type embeddable struct {
		id   string
		text string
		meta map[string]string
	}

	var items []embeddable
	for _, u := range uniques {
		items = append(items, embeddable{
			id:   "unique:" + u.Name,
			text: uniqueEmbeddingText(u),
			meta: map[string]string{"name": u.Name, "type": "unique"},
		})
	}

	fmt.Printf("Embedding %d unique items...\n", len(items))

	numBatches := (len(items) + embeddingBatchSize - 1) / embeddingBatchSize
	batchResults := make([][]cfapi.VectorizeVector, numBatches)
	embeddingMilestones := cfapi.MilestoneSet(len(items), embeddingBatchSize)

	sem := make(chan struct{}, embeddingConcurrency)
	var mu sync.Mutex
	var firstErr error
	var wg sync.WaitGroup

	for batchIdx := range numBatches {
		i := batchIdx * embeddingBatchSize
		end := min(i+embeddingBatchSize, len(items))
		batch := items[i:end]

		wg.Add(1)
		go func(batchIdx, end int, batch []embeddable) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			mu.Lock()
			failed := firstErr != nil
			mu.Unlock()
			if failed {
				return
			}

			texts := make([]string, len(batch))
			for j, item := range batch {
				texts[j] = item.text
			}

			embeddings, err := cfapi.EmbedTextsWithRetry(accountID, apiToken, texts)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch ending at %d: %w", end, err)
				}
				mu.Unlock()
				return
			}

			if len(embeddings) != len(batch) {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch ending at %d: expected %d embeddings, got %d", end, len(batch), len(embeddings))
				}
				mu.Unlock()
				return
			}

			vectors := make([]cfapi.VectorizeVector, len(batch))
			for j, item := range batch {
				vectors[j] = cfapi.VectorizeVector{
					ID:       item.id,
					Values:   embeddings[j],
					Metadata: item.meta,
				}
			}
			batchResults[batchIdx] = vectors

			if embeddingMilestones[end] {
				fmt.Printf("  Embedded %d/%d\n", end, len(items))
			}
		}(batchIdx, end, batch)
	}

	wg.Wait()

	if firstErr != nil {
		return firstErr
	}

	var allVectors []cfapi.VectorizeVector
	for _, vecs := range batchResults {
		allVectors = append(allVectors, vecs...)
	}

	fmt.Printf("Upserting %d vectors to Vectorize...\n", len(allVectors))
	upsertMilestones := cfapi.MilestoneSet(len(allVectors), vectorizeBatchSize)
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := cfapi.UpsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		if upsertMilestones[end] {
			fmt.Printf("  Upserted %d/%d\n", end, len(allVectors))
		}
	}

	return nil
}
