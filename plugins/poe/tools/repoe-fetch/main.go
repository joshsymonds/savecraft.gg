// repoe-fetch populates PoE game data tables in D1 from RePoE and GGG's
// skill tree export. It is the sole writer to poe_gems, poe_base_items,
// poe_stat_translations, and poe_passive_nodes.
//
// Usage: go run ./plugins/poe/tools/repoe-fetch --d1-database-id=UUID [--vectorize-index=NAME]
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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const (
	gemsURL             = "https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/gems.json"
	baseItemsURL        = "https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/base_items.json"
	statTranslationsURL = "https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/stat_translations.json"
	passiveTreeURL      = "https://raw.githubusercontent.com/grindinggear/skilltree-export/refs/tags/3.28.0/data.json"
	modsURL             = "https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/mods.json"
)

// Gem represents a gem entry from RePoE's gems.json.
type Gem struct {
	BaseItem *GemBaseItem        `json:"base_item"`
	Tags     []string            `json:"tags"`
	CastTime float64             `json:"cast_time"`
	PerLevel map[string]GemLevel `json:"per_level"`
	Static   *GemStatic          `json:"static"`
}

// GemBaseItem is the base_item object within a gem entry.
type GemBaseItem struct {
	DisplayName  string          `json:"display_name"`
	Requirements GemRequirements `json:"requirements"`
}

// GemRequirements holds attribute requirements for a gem.
type GemRequirements struct {
	Level        int `json:"level"`
	Strength     int `json:"str"`
	Dexterity    int `json:"dex"`
	Intelligence int `json:"int"`
}

// GemLevel holds per-level stats for a gem.
type GemLevel struct {
	ManaCost     *int             `json:"mana_cost"`
	Stats        []GemStat        `json:"stats"`
	QualityStats []GemQualityStat `json:"quality_stats"`
}

// GemStat is a stat value at a given gem level.
type GemStat struct {
	ID    string `json:"id"`
	Value int    `json:"value"`
}

// GemQualityStat is a quality stat for a gem.
type GemQualityStat struct {
	ID    string  `json:"id"`
	Value float64 `json:"value"`
}

// GemStatic holds static (non-level-varying) gem properties.
type GemStatic struct {
	Description string `json:"description"`
	IsSupport   bool   `json:"is_support"`
}

// BaseItem represents a base item entry from RePoE's base_items.json.
type BaseItem struct {
	Name         string          `json:"name"`
	ItemClass    string          `json:"item_class"`
	ReleaseState string          `json:"release_state"`
	Requirements *BaseItemReqs   `json:"requirements"`
	Implicits    []string        `json:"implicits"`
	Properties   json.RawMessage `json:"properties"`
	Tags         []string        `json:"tags"`
}

// BaseItemReqs holds level requirements for a base item.
type BaseItemReqs struct {
	Level int `json:"level"`
}

// StatTranslation represents one entry in RePoE's stat_translations.json.
type StatTranslation struct {
	IDs     []string              `json:"ids"`
	English []StatTranslationLang `json:"English"`
}

// StatTranslationLang holds a single English translation.
type StatTranslationLang struct {
	String string `json:"string"`
}

// PassiveTree is the top-level structure of GGG's skill tree export.
type PassiveTree struct {
	Nodes map[string]PassiveNode `json:"nodes"`
}

// PassiveNode represents a node in the passive skill tree.
type PassiveNode struct {
	Skill           int      `json:"skill"`
	Name            string   `json:"name"`
	Stats           []string `json:"stats"`
	IsNotable       bool     `json:"isNotable"`
	IsKeystone      bool     `json:"isKeystone"`
	IsMastery       bool     `json:"isMastery"`
	AscendancyName  string   `json:"ascendancyName"`
	Group           *int     `json:"group"`
	Orbit           *int     `json:"orbit"`
	OrbitIndex      *int     `json:"orbitIndex"`
	ClassStartIndex *int     `json:"classStartIndex"`
	IsProxy         bool     `json:"isProxy"`
}

// ProcessedGem holds the processed gem data ready for SQL generation.
type ProcessedGem struct {
	GemID        string
	Name         string
	IsSupport    bool
	Color        string
	Tags         []string
	LevelReq     int
	StrReq       int
	DexReq       int
	IntReq       int
	CastTime     float64
	ManaCost     string // JSON string or empty
	Description  string
	StatsAt20    string // JSON array
	QualityStats string // JSON array
	SupportsTags string // empty or JSON array
}

// ProcessedBaseItem holds the processed base item data ready for SQL generation.
type ProcessedBaseItem struct {
	ItemID       string
	Name         string
	ItemClass    string
	LevelReq     int
	ImplicitMods string // JSON array
	Properties   string // JSON object
	Tags         string // JSON array
}

// ProcessedStatTranslation holds a single stat ID → translation mapping.
type ProcessedStatTranslation struct {
	StatID      string
	Translation string
	FormatType  string
}

// ProcessedPassiveNode holds the processed passive node data ready for SQL generation.
type ProcessedPassiveNode struct {
	SkillID        int
	Name           string
	IsNotable      bool
	IsKeystone     bool
	IsMastery      bool
	IsAscendancy   bool
	AscendancyName string
	Stats          string // JSON array
	GroupID        *int
	Orbit          *int
	OrbitIndex     *int
}

// RawMod represents a single mod entry from RePoE's mods.json.
type RawMod struct {
	Name           string        `json:"name"`
	Domain         string        `json:"domain"`
	GenerationType string        `json:"generation_type"`
	RequiredLevel  int           `json:"required_level"`
	Stats          []RawModStat  `json:"stats"`
	SpawnWeights   []SpawnWeight `json:"spawn_weights"`
	Type           string        `json:"type"`
	Groups         []string      `json:"groups"`
	IsEssenceOnly  bool          `json:"is_essence_only"`
}

// RawModStat is a stat entry within a mod.
type RawModStat struct {
	ID  string `json:"id"`
	Min int    `json:"min"`
	Max int    `json:"max"`
}

// SpawnWeight is an item class tag + weight pair.
type SpawnWeight struct {
	Tag    string `json:"tag"`
	Weight int    `json:"weight"`
}

// ProcessedModGroup holds a grouped mod (all tiers of one effect) ready for SQL.
type ProcessedModGroup struct {
	ModID           string // "type|domain|generation_type"
	ModName         string // Human-readable effect description
	GenerationType  string
	Domain          string
	ItemClassSpawns string // JSON: {"weapon": 50, "default": 0}
	StatIDs         string // JSON array of stat IDs
	Tiers           string // JSON array of tier objects
}

// modTier holds one tier's data for JSON serialization.
type modTier struct {
	Tier   int        `json:"tier"`
	Name   string     `json:"name"`
	Level  int        `json:"level"`
	Stats  []tierStat `json:"stats"`
	Weight int        `json:"weight"`
}

// tierStat holds a rendered stat line + range for one tier.
type tierStat struct {
	Text string `json:"text"`
	Min  int    `json:"min"`
	Max  int    `json:"max"`
}

// craftingGenerationTypes is the set of generation_types relevant for crafting.
var craftingGenerationTypes = map[string]bool{
	"prefix":          true,
	"suffix":          true,
	"corrupted":       true,
	"essence":         true,
	"exarch_implicit": true,
	"eater_implicit":  true,
}

// craftingDomains is the set of domains relevant for crafting.
var craftingDomains = map[string]bool{
	"item":             true,
	"crafted":          true,
	"flask":            true,
	"abyss_jewel":      true,
	"affliction_jewel": true,
	"unveiled":         true,
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
	flag.Parse()

	if *d1DatabaseID == "" {
		return fmt.Errorf("--d1-database-id is required")
	}

	// Validate Cloudflare credentials early — don't download data we can't store.
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

	// Fetch all data sources.
	fmt.Println("Fetching gems...")
	gems, err := fetchGems()
	if err != nil {
		return fmt.Errorf("fetching gems: %w", err)
	}
	fmt.Printf("Fetched %d gems\n", len(gems))

	fmt.Println("Fetching base items...")
	baseItems, err := fetchBaseItems()
	if err != nil {
		return fmt.Errorf("fetching base items: %w", err)
	}
	fmt.Printf("Fetched %d base items\n", len(baseItems))

	fmt.Println("Fetching stat translations...")
	statTranslations, err := fetchStatTranslations()
	if err != nil {
		return fmt.Errorf("fetching stat translations: %w", err)
	}
	fmt.Printf("Fetched %d stat translations\n", len(statTranslations))

	fmt.Println("Fetching passive tree...")
	passiveNodes, err := fetchPassiveNodes()
	if err != nil {
		return fmt.Errorf("fetching passive tree: %w", err)
	}
	fmt.Printf("Fetched %d passive nodes\n", len(passiveNodes))

	fmt.Println("Fetching mods...")
	modGroups, err := fetchAndProcessMods()
	if err != nil {
		return fmt.Errorf("fetching mods: %w", err)
	}
	fmt.Printf("Processed %d mod groups\n", len(modGroups))

	// Build SQL.
	fmt.Println("\nBuilding SQL...")
	sql := buildSQL(gems, baseItems, statTranslations, passiveNodes, modGroups)

	// Content hash for change detection.
	h := sha256.Sum256([]byte(sql))
	contentHash := hex.EncodeToString(h[:])

	// ── Cloudflare population (D1 + Vectorize) ──────────────
	// D1 and Vectorize are independent — run them concurrently when both are requested.
	var wg sync.WaitGroup
	errs := make(chan error, 2)

	wg.Go(func() {
		existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "repoe", cfapi.PipelineGlobalSet)
		if err == nil && existing == contentHash {
			fmt.Println("D1 data unchanged (hash match), skipping import")
			return
		}

		// Write SQL to disk before import (best-effort cache for debugging).
		sqlDir := filepath.Join(os.TempDir(), "savecraft", "sql")
		sqlPath := "(not cached)"
		if err := os.MkdirAll(sqlDir, 0700); err != nil {
			fmt.Printf("WARN: could not create temp dir: %v\n", err)
		} else {
			sqlPath = filepath.Join(sqlDir, "repoe_poe.sql")
			if err := os.WriteFile(sqlPath, []byte(sql), 0600); err != nil {
				fmt.Printf("WARN: could not cache SQL to disk: %v\n", err)
				sqlPath = "(not cached)"
			}
		}

		fmt.Printf("Generated %.1f MB of SQL (%d gems, %d base items, %d stat translations, %d passive nodes, %d mod groups)\n",
			float64(len(sql))/1048576, len(gems), len(baseItems), len(statTranslations), len(passiveNodes), len(modGroups))

		fmt.Println("Importing to D1...")
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			errs <- fmt.Errorf("D1 import: %w (SQL cached at %s)", err, sqlPath)
			return
		}
		os.Remove(sqlPath)

		totalRows := len(gems) + len(baseItems) + len(statTranslations) + len(passiveNodes) + len(modGroups)
		if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "repoe", cfapi.PipelineGlobalSet, contentHash, totalRows); err != nil {
			fmt.Printf("WARN: pipeline state update failed: %v\n", err)
		}

		fmt.Println("D1 population complete")
	})

	if *vectorizeIndex != "" {
		wg.Go(func() {
			fmt.Println("\nPopulating Vectorize index...")
			if err := populateVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, gems, passiveNodes); err != nil {
				errs <- fmt.Errorf("populating vectorize: %w", err)
				return
			}
			fmt.Println("Vectorize population complete")
		})
	}

	wg.Wait()
	close(errs)

	// Collect all errors.
	var errMsgs []string
	for err := range errs {
		errMsgs = append(errMsgs, err.Error())
	}
	if len(errMsgs) > 0 {
		return fmt.Errorf("cloudflare population failed:\n  %s", strings.Join(errMsgs, "\n  "))
	}

	return nil
}

// populateVectorize embeds gems and notable/keystone passive nodes, then
// upserts their vectors into a Vectorize index for semantic search.
func populateVectorize(accountID, indexName, apiToken string, gems []ProcessedGem, nodes []ProcessedPassiveNode) error {
	const embeddingBatchSize = 100
	const vectorizeBatchSize = 1000
	const embeddingConcurrency = 6

	// Build the list of items to embed: all gems + notable/keystone nodes.
	type embeddable struct {
		id   string
		text string
		meta map[string]string
	}

	var items []embeddable
	for _, g := range gems {
		text := g.Name + " " + strings.Join(g.Tags, " ") + " " + g.Description
		items = append(items, embeddable{
			id:   "gem:" + g.GemID,
			text: text,
			meta: map[string]string{"name": g.Name, "type": "gem"},
		})
	}
	for _, n := range nodes {
		if !n.IsNotable && !n.IsKeystone {
			continue
		}
		// Parse stats JSON array back to []string for embedding text.
		var stats []string
		_ = json.Unmarshal([]byte(n.Stats), &stats)
		text := n.Name + " " + strings.Join(stats, " ")
		items = append(items, embeddable{
			id:   "node:" + strconv.Itoa(n.SkillID),
			text: text,
			meta: map[string]string{"name": n.Name, "type": "node"},
		})
	}

	fmt.Printf("Embedding %d items (gems + notable/keystone nodes)...\n", len(items))

	// Pre-allocate slots so concurrent goroutines write to distinct indices.
	numBatches := (len(items) + embeddingBatchSize - 1) / embeddingBatchSize
	batchResults := make([][]cfapi.VectorizeVector, numBatches)

	// Milestone progress: report at 25%, 50%, 75%, 100%.
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

			sem <- struct{}{}        // acquire semaphore slot
			defer func() { <-sem }() // release semaphore slot

			// Skip work if a previous batch already failed.
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

	// Flatten batch results in order.
	var allVectors []cfapi.VectorizeVector
	for _, vecs := range batchResults {
		allVectors = append(allVectors, vecs...)
	}

	// Upsert vectors in batches.
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

func fetchGems() ([]ProcessedGem, error) {
	resp, err := httpGet(gemsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw map[string]Gem
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decoding gems: %w", err)
	}

	var gems []ProcessedGem
	for gemID, gem := range raw {
		if gem.BaseItem == nil {
			continue
		}
		name := gem.BaseItem.DisplayName
		if name == "" {
			continue
		}

		// Determine color from highest attribute requirement.
		color := gemColor(gem.BaseItem.Requirements)

		// Extract mana cost and stats at level 20.
		manaCost := ""
		statsAt20 := "[]"
		qualityStats := "[]"

		if lvl20, ok := gem.PerLevel["20"]; ok {
			if lvl20.ManaCost != nil {
				manaCost = fmt.Sprintf("%d", *lvl20.ManaCost)
			}
			if len(lvl20.Stats) > 0 {
				j, _ := json.Marshal(lvl20.Stats)
				statsAt20 = string(j)
			}
			if len(lvl20.QualityStats) > 0 {
				j, _ := json.Marshal(lvl20.QualityStats)
				qualityStats = string(j)
			}
		}
		// Fallback: if no level 20, try level 1 for quality stats.
		if qualityStats == "[]" {
			if lvl1, ok := gem.PerLevel["1"]; ok && len(lvl1.QualityStats) > 0 {
				j, _ := json.Marshal(lvl1.QualityStats)
				qualityStats = string(j)
			}
		}

		description := ""
		isSupport := false
		if gem.Static != nil {
			description = gem.Static.Description
			isSupport = gem.Static.IsSupport
		}

		// For support gems, extract supported tags from the gem's tags.
		supportsTags := ""
		if isSupport && len(gem.Tags) > 0 {
			j, _ := json.Marshal(gem.Tags)
			supportsTags = string(j)
		}

		gems = append(gems, ProcessedGem{
			GemID:        gemID,
			Name:         name,
			IsSupport:    isSupport,
			Color:        color,
			Tags:         gem.Tags,
			LevelReq:     gem.BaseItem.Requirements.Level,
			StrReq:       gem.BaseItem.Requirements.Strength,
			DexReq:       gem.BaseItem.Requirements.Dexterity,
			IntReq:       gem.BaseItem.Requirements.Intelligence,
			CastTime:     gem.CastTime,
			ManaCost:     manaCost,
			Description:  description,
			StatsAt20:    statsAt20,
			QualityStats: qualityStats,
			SupportsTags: supportsTags,
		})
	}

	return gems, nil
}

// gemColor determines the gem color from attribute requirements.
// Highest requirement wins: str→R, dex→G, int→B, none→W.
func gemColor(reqs GemRequirements) string {
	maxVal := reqs.Strength
	color := "R"

	if reqs.Dexterity > maxVal {
		maxVal = reqs.Dexterity
		color = "G"
	}
	if reqs.Intelligence > maxVal {
		maxVal = reqs.Intelligence
		color = "B"
	}
	if maxVal == 0 {
		return "W"
	}
	return color
}

func fetchBaseItems() ([]ProcessedBaseItem, error) {
	resp, err := httpGet(baseItemsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw map[string]BaseItem
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decoding base items: %w", err)
	}

	var items []ProcessedBaseItem
	for itemID, item := range raw {
		if item.Name == "" {
			continue
		}
		if item.ReleaseState != "released" {
			continue
		}

		levelReq := 0
		if item.Requirements != nil {
			levelReq = item.Requirements.Level
		}

		implicitMods := cfapi.JSONArray(item.Implicits)

		properties := "{}"
		if len(item.Properties) > 0 {
			properties = string(item.Properties)
		}

		tags := cfapi.JSONArray(item.Tags)

		items = append(items, ProcessedBaseItem{
			ItemID:       itemID,
			Name:         item.Name,
			ItemClass:    item.ItemClass,
			LevelReq:     levelReq,
			ImplicitMods: implicitMods,
			Properties:   properties,
			Tags:         tags,
		})
	}

	return items, nil
}

func fetchStatTranslations() ([]ProcessedStatTranslation, error) {
	resp, err := httpGet(statTranslationsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var raw []StatTranslation
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decoding stat translations: %w", err)
	}

	// Deduplicate: first translation wins per stat ID.
	seen := make(map[string]struct{})
	var translations []ProcessedStatTranslation

	for _, entry := range raw {
		if len(entry.English) == 0 {
			continue
		}
		translation := entry.English[0].String
		if translation == "" {
			continue
		}

		for _, statID := range entry.IDs {
			if statID == "" {
				continue
			}
			if _, ok := seen[statID]; ok {
				continue
			}
			seen[statID] = struct{}{}

			translations = append(translations, ProcessedStatTranslation{
				StatID:      statID,
				Translation: translation,
			})
		}
	}

	return translations, nil
}

func fetchPassiveNodes() ([]ProcessedPassiveNode, error) {
	resp, err := httpGet(passiveTreeURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var tree PassiveTree
	if err := json.NewDecoder(resp.Body).Decode(&tree); err != nil {
		return nil, fmt.Errorf("decoding passive tree: %w", err)
	}

	var nodes []ProcessedPassiveNode
	for _, node := range tree.Nodes {
		// Skip class start placeholders and proxy nodes.
		if node.ClassStartIndex != nil {
			continue
		}
		if node.IsProxy {
			continue
		}
		if node.Name == "" {
			continue
		}

		stats := cfapi.JSONArray(node.Stats)
		isAscendancy := node.AscendancyName != ""

		nodes = append(nodes, ProcessedPassiveNode{
			SkillID:        node.Skill,
			Name:           node.Name,
			IsNotable:      node.IsNotable,
			IsKeystone:     node.IsKeystone,
			IsMastery:      node.IsMastery,
			IsAscendancy:   isAscendancy,
			AscendancyName: node.AscendancyName,
			Stats:          stats,
			GroupID:        node.Group,
			Orbit:          node.Orbit,
			OrbitIndex:     node.OrbitIndex,
		})
	}

	return nodes, nil
}

// fetchAndProcessMods fetches mods.json and stat_translations.json, then
// groups mods by (type, domain, generation_type), renders human-readable
// mod names via stat translations, and returns per-group processed data.
func fetchAndProcessMods() ([]ProcessedModGroup, error) {
	// Fetch mods.
	resp, err := httpGet(modsURL)
	if err != nil {
		return nil, fmt.Errorf("fetching mods: %w", err)
	}
	defer resp.Body.Close()

	var rawMods map[string]RawMod
	if err := json.NewDecoder(resp.Body).Decode(&rawMods); err != nil {
		return nil, fmt.Errorf("decoding mods: %w", err)
	}
	fmt.Printf("  Fetched %d raw mods\n", len(rawMods))

	// Fetch stat translations for rendering.
	transResp, err := httpGet(statTranslationsURL)
	if err != nil {
		return nil, fmt.Errorf("fetching stat translations for mod rendering: %w", err)
	}
	defer transResp.Body.Close()

	var rawTranslations []RawStatTranslation
	if err := json.NewDecoder(transResp.Body).Decode(&rawTranslations); err != nil {
		return nil, fmt.Errorf("decoding stat translations: %w", err)
	}

	translator := NewStatTranslator(rawTranslations)

	// Filter to crafting-relevant mods and group by (type, domain, generation_type).
	type groupKey struct{ typ, domain, genType string }
	groups := make(map[groupKey][]struct {
		modID string
		mod   RawMod
	})

	filtered := 0
	for modID, mod := range rawMods {
		if !craftingGenerationTypes[mod.GenerationType] {
			continue
		}
		if !craftingDomains[mod.Domain] {
			continue
		}
		if len(mod.Stats) == 0 {
			continue
		}
		filtered++
		k := groupKey{mod.Type, mod.Domain, mod.GenerationType}
		groups[k] = append(groups[k], struct {
			modID string
			mod   RawMod
		}{modID, mod})
	}
	fmt.Printf("  Filtered to %d crafting mods in %d groups\n", filtered, len(groups))

	// Process each group into a ProcessedModGroup.
	var result []ProcessedModGroup
	for k, mods := range groups {
		// Sort tiers by required_level descending (highest = T1).
		sort.Slice(mods, func(i, j int) bool {
			return mods[i].mod.RequiredLevel > mods[j].mod.RequiredLevel
		})

		// Render mod name from the first tier's stats (they all share the same effect).
		firstMod := mods[0].mod
		var statValues []StatValue
		for _, s := range firstMod.Stats {
			// Use mid-range value for condition matching.
			mid := (s.Min + s.Max) / 2
			if mid == 0 && s.Max > 0 {
				mid = 1
			}
			if mid == 0 && s.Min < 0 {
				mid = -1
			}
			statValues = append(statValues, StatValue{ID: s.ID, Value: mid})
		}
		// Get the template string (with {0}, {1} placeholders) for clean mod name.
		template := translator.Template(statValues)
		if template == "" {
			// Fallback: use the stat IDs joined.
			ids := make([]string, len(firstMod.Stats))
			for i, s := range firstMod.Stats {
				ids[i] = s.ID
			}
			template = strings.Join(ids, ", ")
		}
		modName := extractModName(template)

		// Collect stat IDs.
		statIDs := make([]string, len(firstMod.Stats))
		for i, s := range firstMod.Stats {
			statIDs[i] = s.ID
		}

		// Build tier array.
		var tiers []modTier
		for tierNum, entry := range mods {
			mod := entry.mod

			// Render each tier's stat text. Use min value for display; the
			// view shows (min-max) from the Min/Max fields directly.
			var tierStats []tierStat
			for _, s := range mod.Stats {
				sv := []StatValue{{ID: s.ID, Value: s.Min}}
				text := translator.Translate(sv)
				if text == "" {
					text = s.ID
				}

				tierStats = append(tierStats, tierStat{
					Text: text,
					Min:  s.Min,
					Max:  s.Max,
				})
			}

			// Extract max spawn weight (primary weight for the mod).
			maxWeight := 0
			for _, sw := range mod.SpawnWeights {
				if sw.Tag != "default" && sw.Weight > maxWeight {
					maxWeight = sw.Weight
				}
			}

			tiers = append(tiers, modTier{
				Tier:   tierNum + 1,
				Name:   mod.Name,
				Level:  mod.RequiredLevel,
				Stats:  tierStats,
				Weight: maxWeight,
			})
		}

		tiersJSON, _ := json.Marshal(tiers)
		statIDsJSON, _ := json.Marshal(statIDs)

		// Build item_class_spawns from first tier's spawn weights.
		spawnMap := make(map[string]int)
		for _, sw := range firstMod.SpawnWeights {
			if sw.Weight > 0 {
				spawnMap[sw.Tag] = sw.Weight
			}
		}
		spawnJSON, _ := json.Marshal(spawnMap)

		compositeID := k.typ + "|" + k.domain + "|" + k.genType

		result = append(result, ProcessedModGroup{
			ModID:           compositeID,
			ModName:         modName,
			GenerationType:  k.genType,
			Domain:          k.domain,
			ItemClassSpawns: string(spawnJSON),
			StatIDs:         string(statIDsJSON),
			Tiers:           string(tiersJSON),
		})
	}

	// Sort for deterministic output.
	sort.Slice(result, func(i, j int) bool {
		return result[i].ModID < result[j].ModID
	})

	return result, nil
}

func httpGet(url string) (*http.Response, error) {
	client := &http.Client{Timeout: 5 * time.Minute}
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
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	return resp, nil
}
