// journal-fetch populates D1 with WoW dungeon/raid boss encounters and their
// abilities from the Blizzard Journal API. Used by the dungeon_guide reference
// module to prevent AI hallucination on boss mechanics.
//
// Data flow:
//  1. Fetch current expansion's instances (dungeons + raids)
//  2. For each instance, fetch encounters
//  3. For each encounter, extract abilities from nested sections
//  4. Import into D1 (wow_encounters + wow_encounter_abilities + wow_encounters_fts)
//
// Usage:
//
//	go run ./plugins/wow/tools/journal-fetch \
//	  --d1-database-id=UUID \
//	  --battlenet-client-id=ID --battlenet-client-secret=SECRET \
//	  [--battlenet-region=us] [--save-fixtures]
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// ---------------------------------------------------------------------------
// Blizzard OAuth (same as spell-fetch)
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

type expansionIndexResponse struct {
	Tiers []struct {
		Key  struct{ Href string } `json:"key"`
		Name string               `json:"name"`
		ID   int                  `json:"id"`
	} `json:"tiers"`
}

type expansionDetailResponse struct {
	ID       int `json:"id"`
	Name     string `json:"name"`
	Raids    []instanceRef `json:"raids"`
	Dungeons []instanceRef `json:"dungeons"`
}

type instanceRef struct {
	Key  struct{ Href string } `json:"key"`
	Name string               `json:"name"`
	ID   int                  `json:"id"`
}

type instanceDetailResponse struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	Encounters []struct {
		Key  struct{ Href string } `json:"key"`
		Name string               `json:"name"`
		ID   int                  `json:"id"`
	} `json:"encounters"`
}

type encounterDetailResponse struct {
	ID          int              `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Sections    []encounterSection `json:"sections"`
}

type encounterSection struct {
	Title    string `json:"title"`
	BodyText string `json:"body_text"`
	Spell    *struct {
		Key  struct{ Href string } `json:"key"`
		Name string               `json:"name"`
		ID   int                  `json:"id"`
	} `json:"spell"`
	Sections []encounterSection `json:"sections"`
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type encounterEntry struct {
	encounterID   int
	encounterName string
	instanceID    int
	instanceName  string
}

type abilityEntry struct {
	encounterID      int
	abilityName      string
	abilityDescription string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// extractAbilities recursively extracts spell abilities from encounter sections.
func extractAbilities(sections []encounterSection, encounterID int) []abilityEntry {
	var abilities []abilityEntry
	seen := make(map[int]bool)

	var walk func(sections []encounterSection)
	walk = func(sections []encounterSection) {
		for _, s := range sections {
			if s.Spell != nil && s.Spell.ID > 0 && !seen[s.Spell.ID] {
				seen[s.Spell.ID] = true
				desc := s.BodyText
				abilities = append(abilities, abilityEntry{
					encounterID:      encounterID,
					abilityName:      s.Spell.Name,
					abilityDescription: desc,
				})
			}
			walk(s.Sections)
		}
	}
	walk(sections)
	return abilities
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

	// Step 2: Get current expansion's instances
	fmt.Println("Fetching expansion index...")
	var expIndex expansionIndexResponse
	if err := blizzardGet(fmt.Sprintf("%s/data/wow/journal-expansion/index?%s", base, ns), token, &expIndex); err != nil {
		return fmt.Errorf("expansion index: %w", err)
	}

	// Find latest expansion (highest ID)
	latestID := 0
	latestName := ""
	for _, t := range expIndex.Tiers {
		if t.ID > latestID {
			latestID = t.ID
			latestName = t.Name
		}
	}
	fmt.Printf("  Latest expansion: %s (ID %d)\n", latestName, latestID)

	var expDetail expansionDetailResponse
	if err := blizzardGet(fmt.Sprintf("%s/data/wow/journal-expansion/%d?%s", base, latestID, ns), token, &expDetail); err != nil {
		return fmt.Errorf("expansion detail: %w", err)
	}

	allInstances := append(expDetail.Raids, expDetail.Dungeons...)
	fmt.Printf("  %d raids + %d dungeons = %d instances\n", len(expDetail.Raids), len(expDetail.Dungeons), len(allInstances))

	// Step 3: Fetch each instance → encounters
	fmt.Println("Fetching instances and encounters...")
	var encounters []encounterEntry
	var abilities []abilityEntry

	for _, inst := range allInstances {
		fmt.Printf("  %s (ID %d)...\n", inst.Name, inst.ID)

		var instDetail instanceDetailResponse
		if err := blizzardGet(fmt.Sprintf("%s/data/wow/journal-instance/%d?%s", base, inst.ID, ns), token, &instDetail); err != nil {
			fmt.Printf("    WARN: skip instance %d: %v\n", inst.ID, err)
			continue
		}

		for _, enc := range instDetail.Encounters {
			encounters = append(encounters, encounterEntry{
				encounterID:   enc.ID,
				encounterName: enc.Name,
				instanceID:    inst.ID,
				instanceName:  inst.Name,
			})

			// Fetch encounter detail for abilities
			var encDetail encounterDetailResponse
			if err := blizzardGet(fmt.Sprintf("%s/data/wow/journal-encounter/%d?%s", base, enc.ID, ns), token, &encDetail); err != nil {
				fmt.Printf("    WARN: skip encounter %d (%s): %v\n", enc.ID, enc.Name, err)
				continue
			}

			encAbilities := extractAbilities(encDetail.Sections, enc.ID)
			abilities = append(abilities, encAbilities...)
			fmt.Printf("    %s: %d abilities\n", enc.Name, len(encAbilities))

			if *saveFixtures && enc.ID == instDetail.Encounters[0].ID {
				saveJSON(fmt.Sprintf("plugins/wow/testdata/blizzard-encounter-%d.json", enc.ID), encDetail)
			}

			time.Sleep(50 * time.Millisecond)
		}

		if *saveFixtures {
			saveJSON(fmt.Sprintf("plugins/wow/testdata/blizzard-instance-%d.json", inst.ID), instDetail)
		}

		time.Sleep(100 * time.Millisecond)
	}

	fmt.Printf("  ✓ %d encounters, %d abilities\n", len(encounters), len(abilities))

	// Step 4: Generate SQL
	fmt.Println("Generating SQL...")

	// Sort for deterministic output
	sort.Slice(encounters, func(i, j int) bool {
		if encounters[i].instanceName != encounters[j].instanceName {
			return encounters[i].instanceName < encounters[j].instanceName
		}
		return encounters[i].encounterName < encounters[j].encounterName
	})

	var sb strings.Builder
	sb.WriteString("DELETE FROM wow_encounters;\nDELETE FROM wow_encounter_abilities;\nDELETE FROM wow_encounters_fts;\n")

	for _, e := range encounters {
		fmt.Fprintf(&sb,
			"INSERT INTO wow_encounters (encounter_id, encounter_name, instance_id, instance_name) VALUES (%d, %s, %d, %s);\n",
			e.encounterID, cfapi.SQLQuote(e.encounterName), e.instanceID, cfapi.SQLQuote(e.instanceName),
		)
		// One FTS5 row per encounter
		fmt.Fprintf(&sb,
			"INSERT INTO wow_encounters_fts (encounter_id, encounter_name, instance_name) VALUES (%d, %s, %s);\n",
			e.encounterID, cfapi.SQLQuote(e.encounterName), cfapi.SQLQuote(e.instanceName),
		)
	}

	for _, a := range abilities {
		fmt.Fprintf(&sb,
			"INSERT INTO wow_encounter_abilities (encounter_id, ability_name, ability_description) VALUES (%d, %s, %s);\n",
			a.encounterID, cfapi.SQLQuote(a.abilityName), cfapi.SQLQuote(a.abilityDescription),
		)
	}

	sql := sb.String()
	fmt.Printf("  %d encounters, %d abilities\n", len(encounters), len(abilities))
	fmt.Printf("  SQL size: %.1f KB\n", float64(len(sql))/1024)

	// Step 5: Import to D1
	fmt.Println("Importing to D1...")
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}
	fmt.Printf("  ✓ Imported %d encounters + %d abilities to D1\n", len(encounters), len(abilities))

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
	fmt.Printf("    Saved fixture: %s\n", path)
}
