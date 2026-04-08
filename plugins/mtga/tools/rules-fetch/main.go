// rules-fetch downloads the MTG Comprehensive Rules and Scryfall Rulings,
// parses them into indexed JSON for the rules_search reference module.
//
// Usage: go run ./plugins/mtga/tools/rules-fetch
//
// Generated files:
//   - plugins/mtga/reference/data/rules.json (Comprehensive Rules, indexed by rule number)
//   - plugins/mtga/reference/data/rulings.json (Scryfall per-card rulings)
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
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const (
	compRulesURL = "https://media.wizards.com/2025/downloads/MagicCompRules%2020251114.txt"
	rulingsURL   = "https://api.scryfall.com/bulk-data"
)

// Rule is a single numbered rule with its text and subrules.
type Rule struct {
	Number  string   `json:"number"`
	Text    string   `json:"text"`
	Example string   `json:"example,omitempty"`
	SeeAlso []string `json:"seeAlso,omitempty"` // cross-referenced rule numbers
}

// CardRuling is an official ruling for a specific card.
type CardRuling struct {
	OracleID    string `json:"oracle_id"`
	PublishedAt string `json:"published_at"`
	Comment     string `json:"comment"`
}

// RulesData is the complete indexed rules dataset.
type RulesData struct {
	EffectiveDate string                  `json:"effectiveDate"`
	Rules         []Rule                  `json:"rules"`
	CardRulings   map[string][]CardRuling `json:"cardRulings"` // oracle_id → rulings
}

var ruleNumberPattern = regexp.MustCompile(`^(\d{3}\.\d+[a-z]?)\b`)
var seeAlsoPattern = regexp.MustCompile(`[Ss]ee rules? (\d{3}(?:\.\d+[a-z]?)?)`)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfAccountID := flag.String("cf-account-id", os.Getenv("CLOUDFLARE_ACCOUNT_ID"), "Cloudflare account ID")
	cfAPIToken := flag.String("cf-api-token", os.Getenv("CLOUDFLARE_API_TOKEN"), "Cloudflare API token")
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (enables D1 population)")
	vectorizeIndex := flag.String("vectorize-index", "", "Vectorize index name (enables Vectorize population)")
	flag.Parse()

	// Validate Cloudflare credentials early — don't download data we can't store.
	if *d1DatabaseID != "" || *vectorizeIndex != "" {
		var missing []string
		if *cfAccountID == "" {
			missing = append(missing, "--cf-account-id / CLOUDFLARE_ACCOUNT_ID")
		}
		if *cfAPIToken == "" {
			missing = append(missing, "--cf-api-token / CLOUDFLARE_API_TOKEN")
		}
		if len(missing) > 0 {
			return fmt.Errorf("Cloudflare output requested but missing: %s", strings.Join(missing, ", "))
		}
	}

	// ── Download all three sources concurrently ──────────────
	var (
		rulesText   string
		cardRulings map[string][]CardRuling
		cardNames   map[string]string

		rulesErr   error
		rulingsErr error
		cardNmErr  error
	)

	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		fmt.Println("Downloading Comprehensive Rules...")
		rulesText, rulesErr = downloadText(compRulesURL)
		if rulesErr == nil {
			fmt.Printf("Comprehensive Rules: %d bytes\n", len(rulesText))
		}
	}()

	go func() {
		defer wg.Done()
		fmt.Println("Downloading Scryfall Rulings...")
		cardRulings, rulingsErr = downloadAndParseRulings()
		if rulingsErr == nil {
			fmt.Printf("Card rulings: %d cards\n", len(cardRulings))
		}
	}()

	go func() {
		defer wg.Done()
		cardNames, cardNmErr = downloadCardNames()
	}()

	wg.Wait()

	if rulesErr != nil {
		return fmt.Errorf("downloading rules: %w", rulesErr)
	}
	if rulingsErr != nil {
		return fmt.Errorf("downloading rulings: %w", rulingsErr)
	}
	if cardNmErr != nil {
		return fmt.Errorf("downloading card names: %w", cardNmErr)
	}

	rules := parseComprehensiveRules(rulesText)
	fmt.Printf("Parsed %d rules\n", len(rules))

	// ── Cloudflare population (D1 + Vectorize concurrently) ──────────────
	needsD1 := *d1DatabaseID != ""
	needsVectorize := *vectorizeIndex != ""

	if needsD1 || needsVectorize {
		var cfWg sync.WaitGroup
		errs := make(chan error, 2)

		if needsD1 {
			cfWg.Go(func() {
				fmt.Println("\nPopulating D1 tables...")
				sql := buildImportSQL(rules, cardRulings, cardNames)

				// Content hash for change detection.
				h := sha256.Sum256([]byte(sql))
				contentHash := hex.EncodeToString(h[:])

				existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "rules", cfapi.PipelineGlobalSet)
				if err == nil && existing == contentHash {
					fmt.Println("D1 rules unchanged (hash match), skipping import")
					return
				}

				// Write SQL to disk before import.
				sqlDir := filepath.Join(os.TempDir(), "savecraft", "sql")
				os.MkdirAll(sqlDir, 0755)
				sqlPath := filepath.Join(sqlDir, "rules.sql")
				os.WriteFile(sqlPath, []byte(sql), 0644)

				fmt.Printf("Generated %.1f MB of SQL (%d rules, %d cards with rulings)\n", float64(len(sql))/1048576, len(rules), len(cardNames))
				if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
					errs <- fmt.Errorf("D1 import: %w (SQL cached at %s)", err, sqlPath)
					return
				}
				os.Remove(sqlPath)

				rowCount := len(rules) + len(cardNames)
				if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "rules", cfapi.PipelineGlobalSet, contentHash, rowCount); err != nil {
					fmt.Printf("WARN: pipeline state update failed: %v\n", err)
				}
				fmt.Println("D1 population complete")
			})
		}

		if needsVectorize {
			cfWg.Go(func() {
				fmt.Println("\nPopulating Vectorize index...")
				if err := populateVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, rules, cardRulings, cardNames); err != nil {
					errs <- fmt.Errorf("populating vectorize: %w", err)
					return
				}
				fmt.Println("Vectorize population complete")
			})
		}

		cfWg.Wait()
		close(errs)

		// Return the first error encountered.
		for err := range errs {
			return err
		}
	}

	return nil
}

func parseComprehensiveRules(text string) []Rule {
	lines := strings.Split(text, "\n")
	var rules []Rule

	for i := 0; i < len(lines); i++ {
		line := strings.TrimRight(lines[i], "\r\n ")

		m := ruleNumberPattern.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		ruleNum := m[1]
		ruleText := strings.TrimSpace(line[len(m[0]):])

		// Collect example lines that follow.
		example := ""
		for i+1 < len(lines) {
			next := strings.TrimRight(lines[i+1], "\r\n ")
			if strings.HasPrefix(next, "Example:") {
				i++
				example += strings.TrimSpace(next) + "\n"
			} else {
				break
			}
		}
		example = strings.TrimRight(example, "\n")

		// Extract cross-references.
		var seeAlso []string
		for _, match := range seeAlsoPattern.FindAllStringSubmatch(ruleText+" "+example, -1) {
			seeAlso = append(seeAlso, match[1])
		}

		rules = append(rules, Rule{
			Number:  ruleNum,
			Text:    ruleText,
			Example: example,
			SeeAlso: seeAlso,
		})
	}

	return rules
}

func downloadAndParseRulings() (map[string][]CardRuling, error) {
	// Get the rulings bulk data URL from Scryfall.
	resp, err := httpGet(rulingsURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var bulk struct {
		Data []struct {
			Type        string `json:"type"`
			DownloadURI string `json:"download_uri"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&bulk); err != nil {
		return nil, err
	}

	var downloadURL string
	for _, d := range bulk.Data {
		if d.Type == "rulings" {
			downloadURL = d.DownloadURI
			break
		}
	}
	if downloadURL == "" {
		return nil, fmt.Errorf("rulings bulk data not found")
	}
	// Validate the download URL is from Scryfall's data domain.
	if !strings.HasPrefix(downloadURL, "https://data.scryfall.io/") {
		return nil, fmt.Errorf("unexpected rulings download URL: %s", downloadURL)
	}

	fmt.Printf("Downloading rulings from %s...\n", downloadURL)
	resp2, err := httpGet(downloadURL)
	if err != nil {
		return nil, err
	}
	defer resp2.Body.Close()

	// Parse the rulings JSON array. Each entry has oracle_id, published_at, comment.
	// We need to map oracle_id → card name. We'll use our existing Scryfall cards data
	// for this mapping, but since we're a standalone tool, we'll just store by oracle_id
	// and let the query engine resolve names at runtime.
	//
	// Actually, Scryfall rulings also have a "source" field we don't need, and we need
	// to group by some identifier. Let's just store them grouped by oracle_id.
	dec := json.NewDecoder(resp2.Body)
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return nil, fmt.Errorf("expected '[', got %v", tok)
	}

	byOracleID := make(map[string][]CardRuling)
	count := 0
	for dec.More() {
		var ruling struct {
			OracleID    string `json:"oracle_id"`
			Source      string `json:"source"`
			PublishedAt string `json:"published_at"`
			Comment     string `json:"comment"`
		}
		if err := dec.Decode(&ruling); err != nil {
			continue
		}
		byOracleID[ruling.OracleID] = append(byOracleID[ruling.OracleID], CardRuling{
			OracleID:    ruling.OracleID,
			PublishedAt: ruling.PublishedAt,
			Comment:     ruling.Comment,
		})
		count++
	}

	fmt.Printf("Parsed %d individual rulings for %d cards\n", count, len(byOracleID))
	return byOracleID, nil
}

func downloadText(url string) (string, error) {
	resp, err := httpGet(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	// Cap response at 50MB to prevent OOM from misbehaving upstream.
	limited := io.LimitReader(resp.Body, 50*1024*1024)
	data, err := io.ReadAll(limited)
	if err != nil {
		return "", err
	}
	return string(data), nil
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
