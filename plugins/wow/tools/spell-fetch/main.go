// spell-fetch populates D1 with WoW spell/ability data from the Blizzard
// Game Data API. Each spell is stored with its class/spec assignments so the
// ability_lookup reference module can verify which abilities belong to which specs.
//
// Data flow:
//  1. Fetch all playable specs → get class info + talent tree URLs
//  2. Fetch talent trees (class-wide + spec-specific) → extract spell IDs
//  3. Fetch individual spell details for resolved descriptions
//  4. Generate SQL inserts for wow_spells + wow_spells_fts
//  5. Import into D1 via Cloudflare API
//
// Usage:
//
//	go run ./plugins/wow/tools/spell-fetch \
//	  --d1-database-id=UUID \
//	  --battlenet-client-id=ID --battlenet-client-secret=SECRET \
//	  [--battlenet-region=us] [--save-fixtures]
package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// ---------------------------------------------------------------------------
// Blizzard OAuth
// ---------------------------------------------------------------------------

func getAppToken(clientID, clientSecret, region string) (string, error) {
	tokenURL := "https://oauth.battle.net/token"
	if region == "kr" || region == "tw" {
		tokenURL = "https://apac.oauth.battle.net/token"
	}

	resp, err := http.PostForm(tokenURL, url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
	})
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request: HTTP %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding token: %w", err)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("empty access_token in response")
	}

	return result.AccessToken, nil
}

// ---------------------------------------------------------------------------
// Blizzard API types
// ---------------------------------------------------------------------------

type keyedRef struct {
	Key  struct{ Href string } `json:"key"`
	Name string                `json:"name"`
	ID   int                   `json:"id"`
}

type specIndexResponse struct {
	CharacterSpecializations []keyedRef `json:"character_specializations"`
}

type specDetailResponse struct {
	ID             int      `json:"id"`
	Name           string   `json:"name"`
	PlayableClass  keyedRef `json:"playable_class"`
	SpecTalentTree struct {
		Key  struct{ Href string } `json:"key"`
		Name string                `json:"name"`
	} `json:"spec_talent_tree"`
}

type talentTreeResponse struct {
	// talent_nodes is the correct field name (not class_talent_nodes).
	// Contains all class-wide talent nodes shared across specs.
	TalentNodes     []talentNode `json:"talent_nodes"`
	HeroTalentTrees []struct {
		HeroTalentNodes []talentNode `json:"hero_talent_nodes"`
	} `json:"hero_talent_trees"`
}

type specTalentTreeResponse struct {
	SpecTalentNodes []talentNode `json:"spec_talent_nodes"`
}

type talentNode struct {
	Ranks []struct {
		Tooltip          *tooltipEntry  `json:"tooltip"`
		ChoiceOfTooltips []tooltipEntry `json:"choice_of_tooltips"`
	} `json:"ranks"`
	// Some talent tree formats use a flat entry list instead of ranks
	Entries []struct {
		Tooltip          *tooltipEntry  `json:"tooltip"`
		ChoiceOfTooltips []tooltipEntry `json:"choice_of_tooltips"`
	} `json:"entries"`
}

// localizedString handles both plain strings and localized objects like {"en_US": "text"}.
type localizedString struct {
	Value string
}

func (ls *localizedString) UnmarshalJSON(data []byte) error {
	// Try plain string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		ls.Value = s
		return nil
	}
	// Try localized object
	var obj map[string]string
	if err := json.Unmarshal(data, &obj); err == nil {
		if v, ok := obj["en_US"]; ok {
			ls.Value = v
		} else if v, ok := obj["en_GB"]; ok {
			ls.Value = v
		} else {
			// Take any value
			for _, v := range obj {
				ls.Value = v
				break
			}
		}
		return nil
	}
	return nil // Return empty string on unparseable input
}

type tooltipEntry struct {
	SpellTooltip *struct {
		Spell *struct {
			Name localizedString `json:"name"`
			ID   int             `json:"id"`
		} `json:"spell"`
		Description localizedString `json:"description"`
	} `json:"spell_tooltip"`
}

type spellResponse struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type specInfo struct {
	specID       int
	specName     string
	classID      int
	className    string
	talentTreeID int    // extracted from spec_talent_tree URL
	treeURL      string // full URL to fetch spec talent tree
}

type spellEntry struct {
	spellID     int
	name        string
	description string
	source      string // "blizzard_api", "talent_tree", "spell_name_csv"
	classID     int
	className   string
	specID      int
	specName    string
}

// spellFromTree stores the name and description extracted from talent tree tooltips.
// These serve as a fallback when the Blizzard spell detail API returns 404.
type spellFromTree struct {
	name        string
	description string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

var treeIDRegex = regexp.MustCompile(`/talent-tree/(\d+)/`)

func blizzardGet(apiURL, token string, out any) error {
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: HTTP %d", apiURL, resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func extractSpellIDs(nodes []talentNode) map[int]spellFromTree {
	spells := make(map[int]spellFromTree)
	for _, node := range nodes {
		for _, rank := range node.Ranks {
			if rank.Tooltip != nil {
				extractFromTooltip(rank.Tooltip, spells)
			}
			for i := range rank.ChoiceOfTooltips {
				extractFromTooltip(&rank.ChoiceOfTooltips[i], spells)
			}
		}
		for _, entry := range node.Entries {
			if entry.Tooltip != nil {
				extractFromTooltip(entry.Tooltip, spells)
			}
			for i := range entry.ChoiceOfTooltips {
				extractFromTooltip(&entry.ChoiceOfTooltips[i], spells)
			}
		}
	}
	return spells
}

func extractFromTooltip(t *tooltipEntry, spells map[int]spellFromTree) {
	if t.SpellTooltip != nil && t.SpellTooltip.Spell != nil && t.SpellTooltip.Spell.ID > 0 {
		s := t.SpellTooltip.Spell
		existing, exists := spells[s.ID]
		// Keep the entry with the longest description (most informative)
		desc := t.SpellTooltip.Description.Value
		if !exists || len(desc) > len(existing.description) {
			spells[s.ID] = spellFromTree{
				name:        s.Name.Value,
				description: desc,
			}
		}
	}
}

func ensureNamespace(href, ns string) string {
	if strings.Contains(href, "namespace=") {
		return href
	}
	if strings.Contains(href, "?") {
		return href + "&" + ns
	}
	return href + "?" + ns
}

// ---------------------------------------------------------------------------
// Wago.tools DB2 CSV fetching
// ---------------------------------------------------------------------------

// fetchSpecializationSpells downloads the SpecializationSpells DB2 table from wago.tools.
// Returns a map of specID → []spellID for base class/spec abilities.
func fetchSpecializationSpells() (map[int][]int, error) {
	resp, err := http.Get("https://wago.tools/db2/SpecializationSpells/csv")
	if err != nil {
		return nil, fmt.Errorf("fetching SpecializationSpells: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("SpecializationSpells: HTTP %d", resp.StatusCode)
	}

	reader := csv.NewReader(bufio.NewReader(resp.Body))
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("reading CSV header: %w", err)
	}

	// Find column indices
	specIDCol, spellIDCol := -1, -1
	for i, col := range header {
		switch col {
		case "SpecID":
			specIDCol = i
		case "SpellID":
			spellIDCol = i
		}
	}
	if specIDCol < 0 || spellIDCol < 0 {
		return nil, fmt.Errorf("SpecializationSpells CSV missing required columns (found: %v)", header)
	}

	result := make(map[int][]int)
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue // Skip malformed rows
		}
		if specIDCol >= len(record) || spellIDCol >= len(record) {
			continue
		}

		specID, err1 := strconv.Atoi(record[specIDCol])
		spellID, err2 := strconv.Atoi(record[spellIDCol])
		if err1 != nil || err2 != nil || spellID == 0 {
			continue
		}

		result[specID] = append(result[specID], spellID)
	}

	return result, nil
}

// fetchSpellNames downloads the SpellName DB2 table from wago.tools.
// Returns a map of spellID → name for all spells in the game.
func fetchSpellNames() (map[int]string, error) {
	resp, err := http.Get("https://wago.tools/db2/SpellName/csv")
	if err != nil {
		return nil, fmt.Errorf("fetching SpellName: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("SpellName: HTTP %d", resp.StatusCode)
	}

	reader := csv.NewReader(bufio.NewReader(resp.Body))
	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("reading CSV header: %w", err)
	}

	// Find column indices
	idCol, nameCol := -1, -1
	for i, col := range header {
		switch col {
		case "ID":
			idCol = i
		case "Name_lang":
			nameCol = i
		}
	}
	if idCol < 0 || nameCol < 0 {
		return nil, fmt.Errorf("SpellName CSV missing required columns (found: %v)", header)
	}

	result := make(map[int]string)
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}
		if idCol >= len(record) || nameCol >= len(record) {
			continue
		}

		id, err := strconv.Atoi(record[idCol])
		if err != nil || id == 0 {
			continue
		}
		name := record[nameCol]
		if name != "" {
			result[id] = name
		}
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
	bnetClientID := flag.String("battlenet-client-id", os.Getenv("BATTLENET_CLIENT_ID"), "Battle.net client ID")
	bnetClientSecret := flag.String("battlenet-client-secret", os.Getenv("BATTLENET_CLIENT_SECRET"), "Battle.net client secret")
	bnetRegion := flag.String("battlenet-region", envOrDefault("BATTLENET_REGION", "us"), "Battle.net region")
	saveFixtures := flag.Bool("save-fixtures", false, "Save raw API responses to plugins/wow/testdata/")
	flag.Parse()

	var missing []string
	if *cfAccountID == "" {
		missing = append(missing, "--cf-account-id / CLOUDFLARE_ACCOUNT_ID")
	}
	if *cfAPIToken == "" {
		missing = append(missing, "--cf-api-token / CLOUDFLARE_API_TOKEN")
	}
	if *d1DatabaseID == "" {
		missing = append(missing, "--d1-database-id")
	}
	if *bnetClientID == "" {
		missing = append(missing, "--battlenet-client-id / BATTLENET_CLIENT_ID")
	}
	if *bnetClientSecret == "" {
		missing = append(missing, "--battlenet-client-secret / BATTLENET_CLIENT_SECRET")
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required flags: %s", strings.Join(missing, ", "))
	}

	region := *bnetRegion
	base := fmt.Sprintf("https://%s.api.blizzard.com", region)
	ns := fmt.Sprintf("namespace=static-%s&locale=en_US", region)

	// Step 1: Auth
	fmt.Println("Authenticating with Battle.net...")
	token, err := getAppToken(*bnetClientID, *bnetClientSecret, region)
	if err != nil {
		return fmt.Errorf("auth: %w", err)
	}
	fmt.Println("  ✓ Got app token")

	// Step 2: Fetch all specs
	fmt.Println("Fetching specialization index...")
	var specIndex specIndexResponse
	if err := blizzardGet(fmt.Sprintf("%s/data/wow/playable-specialization/index?%s", base, ns), token, &specIndex); err != nil {
		return fmt.Errorf("spec index: %w", err)
	}
	fmt.Printf("  Found %d specializations\n", len(specIndex.CharacterSpecializations))

	// Step 3: Fetch each spec detail → class info + talent tree URL
	fmt.Println("Fetching specialization details...")
	var specs []specInfo
	for _, s := range specIndex.CharacterSpecializations {
		var detail specDetailResponse
		specURL := fmt.Sprintf("%s/data/wow/playable-specialization/%d?%s", base, s.ID, ns)
		if err := blizzardGet(specURL, token, &detail); err != nil {
			fmt.Printf("  WARN: skip spec %d (%s): %v\n", s.ID, s.Name, err)
			continue
		}

		// Extract talent tree ID from URL like ".../talent-tree/786/playable-specialization/263"
		treeID := 0
		if m := treeIDRegex.FindStringSubmatch(detail.SpecTalentTree.Key.Href); m != nil {
			fmt.Sscanf(m[1], "%d", &treeID)
		}

		specs = append(specs, specInfo{
			specID:       detail.ID,
			specName:     detail.Name,
			classID:      detail.PlayableClass.ID,
			className:    detail.PlayableClass.Name,
			talentTreeID: treeID,
			treeURL:      detail.SpecTalentTree.Key.Href,
		})
		time.Sleep(50 * time.Millisecond)
	}
	fmt.Printf("  ✓ Got %d spec details\n", len(specs))

	if *saveFixtures {
		saveJSON("plugins/wow/testdata/blizzard-spec-index.json", specIndex)
		if len(specs) > 0 {
			var detail specDetailResponse
			blizzardGet(fmt.Sprintf("%s/data/wow/playable-specialization/%d?%s", base, specs[0].specID, ns), token, &detail)
			saveJSON("plugins/wow/testdata/blizzard-spec-detail.json", detail)
		}
	}

	// Step 4: Fetch talent trees
	fmt.Println("Fetching talent trees...")

	// Group specs by talent tree ID (class-wide tree is shared)
	treeToSpecs := make(map[int][]specInfo)
	for _, s := range specs {
		if s.talentTreeID > 0 {
			treeToSpecs[s.talentTreeID] = append(treeToSpecs[s.talentTreeID], s)
		}
	}

	type spellSpec struct {
		spellID     int
		treeName    string // name from talent tree tooltip
		treeDesc    string // description from talent tree tooltip
		spec        specInfo
	}
	var allSpellSpecs []spellSpec

	for treeID, classSpecs := range treeToSpecs {
		className := classSpecs[0].className
		fmt.Printf("  %s (tree %d, %d specs)...\n", className, treeID, len(classSpecs))

		// Fetch the class talent tree (shared nodes)
		var classTree talentTreeResponse
		treeURL := fmt.Sprintf("%s/data/wow/talent-tree/%d?%s", base, treeID, ns)
		if err := blizzardGet(treeURL, token, &classTree); err != nil {
			fmt.Printf("    WARN: skip class tree %d: %v\n", treeID, err)
			continue
		}

		// Class-wide talent nodes → all specs of this class
		classSpellIDs := extractSpellIDs(classTree.TalentNodes)
		for spellID, spellName := range classSpellIDs {
			for _, s := range classSpecs {
				allSpellSpecs = append(allSpellSpecs, spellSpec{spellID, spellName.name, spellName.description, s})
			}
		}
		fmt.Printf("    %d class-wide spells\n", len(classSpellIDs))

		// Hero talent trees → all specs of this class
		heroCount := 0
		for _, heroTree := range classTree.HeroTalentTrees {
			heroSpellIDs := extractSpellIDs(heroTree.HeroTalentNodes)
			for spellID, spellName := range heroSpellIDs {
				for _, s := range classSpecs {
					allSpellSpecs = append(allSpellSpecs, spellSpec{spellID, spellName.name, spellName.description, s})
				}
			}
			heroCount += len(heroSpellIDs)
		}
		if heroCount > 0 {
			fmt.Printf("    %d hero talent spells\n", heroCount)
		}

		// Spec-specific talent trees
		for _, s := range classSpecs {
			if s.treeURL == "" {
				continue
			}
			var specTree specTalentTreeResponse
			if err := blizzardGet(ensureNamespace(s.treeURL, ns), token, &specTree); err != nil {
				fmt.Printf("    WARN: skip spec tree for %s: %v\n", s.specName, err)
				continue
			}
			specSpellIDs := extractSpellIDs(specTree.SpecTalentNodes)
			for spellID, spellName := range specSpellIDs {
				allSpellSpecs = append(allSpellSpecs, spellSpec{spellID, spellName.name, spellName.description, s})
			}
			fmt.Printf("    %s: %d spec spells\n", s.specName, len(specSpellIDs))
		}

		time.Sleep(100 * time.Millisecond)
	}
	fmt.Printf("  ✓ %d spell-spec assignments from talent trees\n", len(allSpellSpecs))

	// Step 4b: Fetch base abilities from wago.tools SpecializationSpells
	fmt.Println("Fetching base abilities from wago.tools SpecializationSpells...")
	specSpellMap, err := fetchSpecializationSpells()
	if err != nil {
		fmt.Printf("  WARN: SpecializationSpells fetch failed: %v (continuing with talent tree data only)\n", err)
	} else {
		// Build specID → specInfo lookup
		specByID := make(map[int]specInfo)
		for _, s := range specs {
			specByID[s.specID] = s
		}

		baseAbilityCount := 0
		for specID, spellIDs := range specSpellMap {
			si, ok := specByID[specID]
			if !ok {
				continue // Not a player spec (might be NPC or pet)
			}
			for _, spellID := range spellIDs {
				allSpellSpecs = append(allSpellSpecs, spellSpec{
					spellID:  spellID,
					treeName: "", // Will be resolved from SpellName CSV or Blizzard API
					treeDesc: "",
					spec:     si,
				})
				baseAbilityCount++
			}
		}
		fmt.Printf("  ✓ %d base ability assignments from SpecializationSpells\n", baseAbilityCount)
	}

	// Step 4c: Fetch spell names from wago.tools SpellName
	fmt.Println("Fetching spell names from wago.tools SpellName...")
	spellNameMap, err := fetchSpellNames()
	if err != nil {
		fmt.Printf("  WARN: SpellName fetch failed: %v (will rely on Blizzard API only)\n", err)
		spellNameMap = make(map[int]string)
	} else {
		fmt.Printf("  ✓ %d spell names loaded\n", len(spellNameMap))
	}

	fmt.Printf("  Total: %d spell-spec assignments (talent trees + base abilities)\n", len(allSpellSpecs))

	// Step 5: Fetch unique spell descriptions (concurrent, max 10)
	uniqueSpellIDs := make(map[int]bool)
	for _, ss := range allSpellSpecs {
		uniqueSpellIDs[ss.spellID] = true
	}
	fmt.Printf("Fetching %d unique spell descriptions...\n", len(uniqueSpellIDs))

	spellDetails := make(map[int]*spellResponse)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)
	fetchErrors := 0

	sortedIDs := make([]int, 0, len(uniqueSpellIDs))
	for id := range uniqueSpellIDs {
		sortedIDs = append(sortedIDs, id)
	}
	sort.Ints(sortedIDs)

	for i, spellID := range sortedIDs {
		wg.Add(1)
		sem <- struct{}{}
		go func(id int) {
			defer wg.Done()
			defer func() { <-sem }()

			var spell spellResponse
			if err := blizzardGet(fmt.Sprintf("%s/data/wow/spell/%d?%s", base, id, ns), token, &spell); err != nil {
				mu.Lock()
				fetchErrors++
				mu.Unlock()
				return
			}
			mu.Lock()
			spellDetails[id] = &spell
			mu.Unlock()
		}(spellID)

		if (i+1)%200 == 0 {
			wg.Wait()
			fmt.Printf("  %d/%d fetched...\n", i+1, len(sortedIDs))
		}
	}
	wg.Wait()
	fmt.Printf("  ✓ %d spell descriptions (%d errors)\n", len(spellDetails), fetchErrors)

	if *saveFixtures {
		// Save a few example spells
		count := 0
		for _, id := range sortedIDs {
			if detail, ok := spellDetails[id]; ok && count < 3 {
				saveJSON(fmt.Sprintf("plugins/wow/testdata/blizzard-spell-%d.json", id), detail)
				count++
			}
		}
	}

	// Step 6: Build SQL
	fmt.Println("Generating SQL...")
	var entries []spellEntry
	seen := make(map[string]bool)

	for _, ss := range allSpellSpecs {
		key := fmt.Sprintf("%d-%d", ss.spellID, ss.spec.specID)
		if seen[key] {
			continue
		}
		seen[key] = true

		// Priority: Blizzard spell API > talent tree tooltip > SpellName CSV
		name := ss.treeName
		description := ss.treeDesc
		if detail, ok := spellDetails[ss.spellID]; ok {
			name = detail.Name
			if detail.Description != "" {
				description = detail.Description
			}
		}
		if name == "" {
			if csvName, ok := spellNameMap[ss.spellID]; ok {
				name = csvName
			}
		}
		if name == "" {
			continue // Skip entries with no name at all
		}

		// Determine data source for provenance tracking
		source := "spell_name_csv" // fallback
		if _, ok := spellDetails[ss.spellID]; ok {
			source = "blizzard_api"
		} else if ss.treeDesc != "" {
			source = "talent_tree"
		} else if ss.treeName != "" {
			source = "talent_tree"
		}

		entries = append(entries, spellEntry{
			spellID:     ss.spellID,
			name:        name,
			description: description,
			source:      source,
			classID:     ss.spec.classID,
			className:   ss.spec.className,
			specID:      ss.spec.specID,
			specName:    ss.spec.specName,
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].className != entries[j].className {
			return entries[i].className < entries[j].className
		}
		if entries[i].specName != entries[j].specName {
			return entries[i].specName < entries[j].specName
		}
		return entries[i].name < entries[j].name
	})

	// Count entries with and without descriptions
	withDesc := 0
	for _, e := range entries {
		if e.description != "" {
			withDesc++
		}
	}
	fmt.Printf("  %d unique spell-spec entries (%d with descriptions, %d name-only)\n",
		len(entries), withDesc, len(entries)-withDesc)

	var sb strings.Builder
	sb.WriteString("DELETE FROM wow_spells;\nDELETE FROM wow_spells_fts;\n")

	// Track which spell_ids we've already written to FTS5 (one row per unique spell)
	ftsWritten := make(map[int]bool)

	for _, e := range entries {
		fmt.Fprintf(&sb,
			"INSERT INTO wow_spells (spell_id, name, description, source, class_id, class_name, spec_id, spec_name) VALUES (%d, %s, %s, %s, %d, %s, %d, %s);\n",
			e.spellID, cfapi.SQLQuote(e.name), cfapi.SQLQuote(e.description), cfapi.SQLQuote(e.source),
			e.classID, cfapi.SQLQuote(e.className), e.specID, cfapi.SQLQuote(e.specName),
		)
		// FTS5: one row per unique spell_id (avoids cartesian products on JOIN)
		if !ftsWritten[e.spellID] {
			fmt.Fprintf(&sb,
				"INSERT INTO wow_spells_fts (spell_id, name, description) VALUES (%d, %s, %s);\n",
				e.spellID, cfapi.SQLQuote(e.name), cfapi.SQLQuote(e.description),
			)
			ftsWritten[e.spellID] = true
		}
	}

	sql := sb.String()
	fmt.Printf("  SQL size: %.1f KB\n", float64(len(sql))/1024)

	// Step 7: Import to D1
	fmt.Println("Importing to D1...")
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}
	fmt.Printf("  ✓ Imported %d spell-spec entries to D1\n", len(entries))

	return nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func saveJSON(path string, v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Printf("  WARN: couldn't marshal fixture: %v\n", err)
		return
	}
	if err := os.MkdirAll("plugins/wow/testdata", 0o755); err != nil {
		fmt.Printf("  WARN: couldn't create testdata dir: %v\n", err)
		return
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		fmt.Printf("  WARN: couldn't write fixture %s: %v\n", path, err)
		return
	}
	fmt.Printf("  Saved fixture: %s\n", path)
}
