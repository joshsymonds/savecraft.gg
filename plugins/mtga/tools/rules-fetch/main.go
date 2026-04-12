// rules-fetch downloads the MTG Comprehensive Rules, parses them into
// indexed JSON for the rules_search reference module.
//
// Scryfall card rulings were intentionally removed — they can go stale when
// rules change between set releases and caused LLMs to cite outdated rulings
// over the current Comprehensive Rules.
//
// Usage: go run ./plugins/mtga/tools/rules-fetch
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
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const compRulesURL = "https://media.wizards.com/2025/downloads/MagicCompRules%2020251114.txt"

// Rule is a single numbered rule with its text and subrules.
type Rule struct {
	Number  string   `json:"number"`
	Text    string   `json:"text"`
	Example string   `json:"example,omitempty"`
	SeeAlso []string `json:"seeAlso,omitempty"` // cross-referenced rule numbers
}

// Interaction is a curated rules interaction pattern for LLM reasoning guidance.
type Interaction struct {
	Title       string `json:"title"`
	Mechanics   string `json:"mechanics"`
	CardNames   string `json:"card_names"`
	RuleNumbers string `json:"rule_numbers"`
	Breakdown   string `json:"breakdown"`
	CommonError string `json:"common_error"`
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

	// ── Download Comprehensive Rules ────────────────────────
	fmt.Println("Downloading Comprehensive Rules...")
	rulesText, err := downloadText(compRulesURL)
	if err != nil {
		return fmt.Errorf("downloading rules: %w", err)
	}
	fmt.Printf("Comprehensive Rules: %d bytes\n", len(rulesText))

	rules := parseComprehensiveRules(rulesText)
	fmt.Printf("Parsed %d rules\n", len(rules))

	// ── Load interaction patterns ───────────────────────────
	interactions, err := loadInteractions()
	if err != nil {
		return fmt.Errorf("loading interactions: %w", err)
	}
	fmt.Printf("Loaded %d interaction patterns\n", len(interactions))

	// ── Cloudflare population (D1 + Vectorize concurrently) ──────────────
	needsD1 := *d1DatabaseID != ""
	needsVectorize := *vectorizeIndex != ""

	if needsD1 || needsVectorize {
		var cfWg sync.WaitGroup
		errs := make(chan error, 4)

		if needsD1 {
			cfWg.Go(func() {
				fmt.Println("\nPopulating D1 rules tables...")
				sql := buildImportSQL(rules)

				// Content hash for change detection.
				h := sha256.Sum256([]byte(sql))
				contentHash := hex.EncodeToString(h[:])

				existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "rules", cfapi.PipelineGlobalSet)
				if err == nil && existing == contentHash {
					fmt.Println("D1 rules unchanged (hash match), skipping import")
					return
				}

				fmt.Printf("Generated %.1f MB of SQL (%d rules)\n", float64(len(sql))/1048576, len(rules))
				if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
					errs <- fmt.Errorf("D1 rules import: %w", err)
					return
				}

				if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "rules", cfapi.PipelineGlobalSet, contentHash, len(rules)); err != nil {
					fmt.Printf("WARN: rules pipeline state update failed: %v\n", err)
				}
				fmt.Println("D1 rules population complete")
			})

			cfWg.Go(func() {
				fmt.Println("\nPopulating D1 interactions tables...")
				sql := buildInteractionsImportSQL(interactions)

				h := sha256.Sum256([]byte(sql))
				contentHash := hex.EncodeToString(h[:])

				existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "interactions", cfapi.PipelineGlobalSet)
				if err == nil && existing == contentHash {
					fmt.Println("D1 interactions unchanged (hash match), skipping import")
					return
				}

				fmt.Printf("Generated %.1f KB of SQL (%d interactions)\n", float64(len(sql))/1024, len(interactions))
				if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
					errs <- fmt.Errorf("D1 interactions import: %w", err)
					return
				}

				if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "interactions", cfapi.PipelineGlobalSet, contentHash, len(interactions)); err != nil {
					fmt.Printf("WARN: interactions pipeline state update failed: %v\n", err)
				}
				fmt.Println("D1 interactions population complete")
			})
		}

		if needsVectorize {
			cfWg.Go(func() {
				fmt.Println("\nPopulating Vectorize rules index...")
				if err := populateVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, rules); err != nil {
					errs <- fmt.Errorf("populating rules vectorize: %w", err)
					return
				}
				fmt.Println("Vectorize rules population complete")
			})

			cfWg.Go(func() {
				fmt.Println("\nPopulating Vectorize interactions index...")
				if err := populateInteractionsVectorize(*cfAccountID, *vectorizeIndex, *cfAPIToken, interactions); err != nil {
					errs <- fmt.Errorf("populating interactions vectorize: %w", err)
					return
				}
				fmt.Println("Vectorize interactions population complete")
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

// loadInteractions reads interaction patterns from the data/interactions.json file.
func loadInteractions() ([]Interaction, error) {
	// Resolve path relative to this source file.
	_, thisFile, _, _ := runtime.Caller(0)
	dataPath := filepath.Join(filepath.Dir(thisFile), "..", "..", "data", "interactions.json")

	data, err := os.ReadFile(dataPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", dataPath, err)
	}

	var interactions []Interaction
	if err := json.Unmarshal(data, &interactions); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", dataPath, err)
	}

	return interactions, nil
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
