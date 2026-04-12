// pob-fetch populates all PoE reference data tables in D1 from Path of Building's
// local data files. It replaces both repoe-fetch and poeninja-fetch with a single
// tool that reads from a local PoB checkout.
//
// Usage: go run ./plugins/poe/tools/pob-fetch --d1-database-id=UUID [--pob-dir=PATH]
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (required unless --dry-run)")
	pobDir := flag.String("pob-dir", ".reference/pob", "Path to PoB checkout")
	dryRun := flag.Bool("dry-run", false, "Print SQL without importing")
	flag.Parse()

	if *d1DatabaseID == "" && !*dryRun {
		return fmt.Errorf("--d1-database-id is required (or use --dry-run)")
	}
	if !*dryRun {
		if *cfAccountID == "" {
			return fmt.Errorf("--cf-account-id or CLOUDFLARE_ACCOUNT_ID is required")
		}
		if *cfAPIToken == "" {
			return fmt.Errorf("--cf-api-token or CLOUDFLARE_API_TOKEN is required")
		}
	}

	dataDir := filepath.Join(*pobDir, "src", "Data")

	// ── Parse gems ────────────────────────────────────────────
	fmt.Println("Parsing gems...")
	gemsData, err := os.ReadFile(filepath.Join(dataDir, "Gems.lua"))
	if err != nil {
		return fmt.Errorf("reading Gems.lua: %w", err)
	}
	gems, err := parseGemsLua(string(gemsData))
	if err != nil {
		return fmt.Errorf("parsing Gems.lua: %w", err)
	}
	fmt.Printf("  %d gem entries\n", len(gems))

	// Parse all skill files
	allSkills := make(map[string]SkillData)
	skillFiles := []string{
		"act_str.lua", "act_dex.lua", "act_int.lua",
		"sup_str.lua", "sup_dex.lua", "sup_int.lua",
	}
	for _, f := range skillFiles {
		data, err := os.ReadFile(filepath.Join(dataDir, "Skills", f))
		if err != nil {
			return fmt.Errorf("reading Skills/%s: %w", f, err)
		}
		skills, err := parseSkillsLua(string(data))
		if err != nil {
			return fmt.Errorf("parsing Skills/%s: %w", f, err)
		}
		for k, v := range skills {
			allSkills[k] = v
		}
	}
	fmt.Printf("  %d skill entries\n", len(allSkills))

	joined := joinGemsAndSkills(gems, allSkills)
	fmt.Printf("  %d joined gems\n", len(joined))

	// ── Parse stat descriptions ───────────────────────────────
	fmt.Println("Parsing stat descriptions...")
	translator := &StatDescTranslator{entries: make(map[string]*statDescEntry)}
	descFiles := []string{
		"skill_stat_descriptions.lua",
		"stat_descriptions.lua",
		"gem_stat_descriptions.lua",
		"active_skill_gem_stat_descriptions.lua",
		"aura_skill_stat_descriptions.lua",
		"minion_skill_stat_descriptions.lua",
		"buff_skill_stat_descriptions.lua",
		"curse_skill_stat_descriptions.lua",
	}
	for _, f := range descFiles {
		data, err := os.ReadFile(filepath.Join(dataDir, "StatDescriptions", f))
		if err != nil {
			fmt.Printf("  WARN: %s not found, skipping\n", f)
			continue
		}
		partial, err := parseStatDescriptions(string(data))
		if err != nil {
			fmt.Printf("  WARN: parsing %s: %v\n", f, err)
			continue
		}
		translator.Merge(partial)
	}
	fmt.Printf("  %d stat translations\n", len(translator.entries))

	// ── Parse uniques ─────────────────────────────────────────
	fmt.Println("Parsing uniques...")
	var allUniques []UniqueItem
	uniqueDir := filepath.Join(dataDir, "Uniques")
	uniqueFiles, err := os.ReadDir(uniqueDir)
	if err != nil {
		return fmt.Errorf("reading Uniques dir: %w", err)
	}
	for _, f := range uniqueFiles {
		if !strings.HasSuffix(f.Name(), ".lua") || f.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(uniqueDir, f.Name()))
		if err != nil {
			return fmt.Errorf("reading Uniques/%s: %w", f.Name(), err)
		}
		items, err := parseUniquesFile(string(data))
		if err != nil {
			fmt.Printf("  WARN: Uniques/%s: %v\n", f.Name(), err)
			continue
		}
		allUniques = append(allUniques, items...)
	}
	// Also parse Special/ subdirectory
	specialDir := filepath.Join(uniqueDir, "Special")
	if specialFiles, err := os.ReadDir(specialDir); err == nil {
		for _, f := range specialFiles {
			if !strings.HasSuffix(f.Name(), ".lua") || f.IsDir() {
				continue
			}
			data, err := os.ReadFile(filepath.Join(specialDir, f.Name()))
			if err != nil {
				continue
			}
			items, err := parseUniquesFile(string(data))
			if err != nil {
				continue
			}
			allUniques = append(allUniques, items...)
		}
	}
	fmt.Printf("  %d unique items\n", len(allUniques))

	// ── Parse mods ────────────────────────────────────────────
	fmt.Println("Parsing mods...")
	var allMods []ModTier
	modFiles := []string{
		"ModItem.lua", "ModFlask.lua", "ModJewel.lua",
		"ModJewelAbyss.lua", "ModJewelCluster.lua", "ModJewelCharm.lua",
		"ModVeiled.lua", "ModGraft.lua", "ModTincture.lua",
	}
	for _, f := range modFiles {
		data, err := os.ReadFile(filepath.Join(dataDir, f))
		if err != nil {
			fmt.Printf("  WARN: %s not found, skipping\n", f)
			continue
		}
		mods, err := parseModsLua(string(data))
		if err != nil {
			fmt.Printf("  WARN: %s: %v\n", f, err)
			continue
		}
		allMods = append(allMods, mods...)
	}
	fmt.Printf("  %d mod tiers\n", len(allMods))

	// ── Parse base items ──────────────────────────────────────
	fmt.Println("Parsing base items...")
	var allBases []BaseItem
	baseDir := filepath.Join(dataDir, "Bases")
	baseFiles, err := os.ReadDir(baseDir)
	if err != nil {
		return fmt.Errorf("reading Bases dir: %w", err)
	}
	for _, f := range baseFiles {
		if !strings.HasSuffix(f.Name(), ".lua") || f.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(baseDir, f.Name()))
		if err != nil {
			return fmt.Errorf("reading Bases/%s: %w", f.Name(), err)
		}
		bases, err := parseBasesLua(string(data))
		if err != nil {
			fmt.Printf("  WARN: Bases/%s: %v\n", f.Name(), err)
			continue
		}
		allBases = append(allBases, bases...)
	}
	fmt.Printf("  %d base items\n", len(allBases))

	// ── Parse passive tree ────────────────────────────────────
	fmt.Println("Parsing passive tree...")
	treeDir := filepath.Join(*pobDir, "src", "TreeData")
	treeVersion, err := detectNewestTreeVersion(treeDir)
	if err != nil {
		return fmt.Errorf("detecting tree version: %w", err)
	}
	fmt.Printf("  Tree version: %s\n", treeVersion)

	treeData, err := os.ReadFile(filepath.Join(treeDir, treeVersion, "tree.lua"))
	if err != nil {
		return fmt.Errorf("reading tree.lua: %w", err)
	}
	nodes, err := parseTreeLua(string(treeData))
	if err != nil {
		return fmt.Errorf("parsing tree: %w", err)
	}
	fmt.Printf("  %d passive nodes\n", len(nodes))

	// ── Build SQL ─────────────────────────────────────────────
	fmt.Println("\nBuilding SQL...")
	sql := buildSQL(joined, translator, allUniques, allMods, allBases, nodes)

	if *dryRun {
		fmt.Println(sql)
		return nil
	}

	// Content hash for change detection
	h := sha256.Sum256([]byte(sql))
	contentHash := hex.EncodeToString(h[:])

	existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "pob", cfapi.PipelineGlobalSet)
	if err == nil && existing == contentHash {
		fmt.Println("D1 data unchanged (hash match), skipping import")
		return nil
	}

	fmt.Printf("Generated %.1f MB of SQL (%d gems, %d uniques, %d mods, %d bases, %d nodes, %d translations)\n",
		float64(len(sql))/1048576, len(joined), len(allUniques), len(allMods), len(allBases), len(nodes), len(translator.entries))

	fmt.Println("Importing to D1...")
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}

	totalRows := len(joined) + len(allUniques) + len(allMods) + len(allBases) + len(nodes) + len(translator.entries)
	if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "pob", cfapi.PipelineGlobalSet, contentHash, totalRows); err != nil {
		fmt.Printf("WARN: pipeline state update failed: %v\n", err)
	}

	fmt.Println("D1 population complete")
	return nil
}
