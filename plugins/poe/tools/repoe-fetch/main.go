// repoe-fetch populates PoE game data tables in D1 from RePoE and GGG's
// skill tree export. It is the sole writer to poe_gems, poe_base_items,
// poe_stat_translations, and poe_passive_nodes.
//
// Usage: go run ./plugins/poe/tools/repoe-fetch --d1-database-id=UUID
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
	"strings"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const (
	gemsURL             = "https://raw.githubusercontent.com/repoe-fork/repoe/master/RePoE/data/gems.json"
	baseItemsURL        = "https://raw.githubusercontent.com/repoe-fork/repoe/master/RePoE/data/base_items.json"
	statTranslationsURL = "https://raw.githubusercontent.com/repoe-fork/repoe/master/RePoE/data/stat_translations.json"
	passiveTreeURL      = "https://raw.githubusercontent.com/grindinggear/skilltree-export/refs/tags/3.28.0/data.json"
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
	Level    int `json:"level"`
	Strength int `json:"str"`
	Dexterity int `json:"dex"`
	Intelligence int `json:"int"`
}

// GemLevel holds per-level stats for a gem.
type GemLevel struct {
	ManaCost        *int               `json:"mana_cost"`
	Stats           []GemStat          `json:"stats"`
	QualityStats    []GemQualityStat   `json:"quality_stats"`
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
	Name         string           `json:"name"`
	ItemClass    string           `json:"item_class"`
	ReleaseState string           `json:"release_state"`
	Requirements *BaseItemReqs    `json:"requirements"`
	Implicits    []string         `json:"implicits"`
	Properties   json.RawMessage  `json:"properties"`
	Tags         []string         `json:"tags"`
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
	Skill          int      `json:"skill"`
	Name           string   `json:"name"`
	Stats          []string `json:"stats"`
	IsNotable      bool     `json:"isNotable"`
	IsKeystone     bool     `json:"isKeystone"`
	IsMastery      bool     `json:"isMastery"`
	AscendancyName string   `json:"ascendancyName"`
	Group          *int     `json:"group"`
	Orbit          *int     `json:"orbit"`
	OrbitIndex     *int     `json:"orbitIndex"`
	ClassStartIndex *int    `json:"classStartIndex"`
	IsProxy        bool     `json:"isProxy"`
}

// ProcessedGem holds the processed gem data ready for SQL generation.
type ProcessedGem struct {
	GemID           string
	Name            string
	IsSupport       bool
	Color           string
	Tags            []string
	LevelReq        int
	StrReq          int
	DexReq          int
	IntReq          int
	CastTime        float64
	ManaCost        string // JSON string or empty
	Description     string
	StatsAt20       string // JSON array
	QualityStats    string // JSON array
	SupportsTags    string // empty or JSON array
}

// ProcessedBaseItem holds the processed base item data ready for SQL generation.
type ProcessedBaseItem struct {
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
	SkillID       int
	Name          string
	IsNotable     bool
	IsKeystone    bool
	IsMastery     bool
	IsAscendancy  bool
	AscendancyName string
	Stats         string // JSON array
	GroupID       *int
	Orbit         *int
	OrbitIndex    *int
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
	flag.Parse()

	if *d1DatabaseID == "" {
		return fmt.Errorf("--d1-database-id is required")
	}

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

	// Build SQL.
	fmt.Println("\nBuilding SQL...")
	sql := buildSQL(gems, baseItems, statTranslations, passiveNodes)

	// Content hash for change detection.
	h := sha256.Sum256([]byte(sql))
	contentHash := hex.EncodeToString(h[:])

	existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "repoe", cfapi.PipelineGlobalSet)
	if err == nil && existing == contentHash {
		fmt.Println("D1 data unchanged (hash match), skipping import")
		return nil
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

	fmt.Printf("Generated %.1f MB of SQL (%d gems, %d base items, %d stat translations, %d passive nodes)\n",
		float64(len(sql))/1048576, len(gems), len(baseItems), len(statTranslations), len(passiveNodes))

	fmt.Println("Importing to D1...")
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w (SQL cached at %s)", err, sqlPath)
	}
	os.Remove(sqlPath)

	totalRows := len(gems) + len(baseItems) + len(statTranslations) + len(passiveNodes)
	if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "repoe", cfapi.PipelineGlobalSet, contentHash, totalRows); err != nil {
		fmt.Printf("WARN: pipeline state update failed: %v\n", err)
	}

	fmt.Println("D1 population complete")
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
	for _, item := range raw {
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
