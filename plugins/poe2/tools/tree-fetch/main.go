// tree-fetch populates the poe2_passive_nodes reference table in D1 from
// GGG's official PoE2 skill tree export
// (https://github.com/grindinggear/poe2-skilltree-export).
//
// Usage: go run ./plugins/poe2/tools/tree-fetch --d1-database-id=UUID [--tree-tag=0.5.2]
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// treeDataURLTemplate builds the raw data.json URL for a given release tag.
// GGG doesn't attach data.json as a release asset — it's committed at the
// tagged ref, so the raw.githubusercontent.com content URL is what resolves.
const treeDataURLTemplate = "https://raw.githubusercontent.com/grindinggear/poe2-skilltree-export/%s/data.json"

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
	treeTag := flag.String("tree-tag", "0.5.2", "poe2-skilltree-export release tag to fetch data.json from")
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

	fmt.Printf("Fetching PoE2 tree data (tag %s)...\n", *treeTag)
	data, err := fetchTreeData(*treeTag)
	if err != nil {
		return fmt.Errorf("fetching tree data: %w", err)
	}

	nodes, err := parseTreeData(data)
	if err != nil {
		return fmt.Errorf("parsing tree data: %w", err)
	}
	fmt.Printf("  %d passive nodes\n", len(nodes))

	fmt.Println("\nBuilding SQL...")
	sql := buildSQL(nodes)

	if *dryRun {
		fmt.Println(sql)
		return nil
	}

	// Content hash for change detection.
	h := sha256.Sum256([]byte(sql))
	contentHash := hex.EncodeToString(h[:])

	existing, err := cfapi.GetPipelineHash(*cfAccountID, *d1DatabaseID, *cfAPIToken, "poe2-tree", cfapi.PipelineGlobalSet)
	if err == nil && existing == contentHash {
		fmt.Println("D1 data unchanged (hash match), skipping import")
		return nil
	}

	fmt.Printf("Generated %.1f MB of SQL (%d nodes)\n", float64(len(sql))/1048576, len(nodes))

	fmt.Println("Importing to D1...")
	if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
		return fmt.Errorf("D1 import: %w", err)
	}

	if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "poe2-tree", cfapi.PipelineGlobalSet, contentHash, len(nodes)); err != nil {
		fmt.Printf("WARN: pipeline state update failed: %v\n", err)
	}

	fmt.Println("D1 population complete")
	return nil
}

// fetchTreeData downloads data.json for the given poe2-skilltree-export release tag.
func fetchTreeData(tag string) ([]byte, error) {
	url := fmt.Sprintf(treeDataURLTemplate, tag)
	client := &http.Client{Timeout: 60 * time.Second}

	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d fetching %s", resp.StatusCode, url)
	}

	return io.ReadAll(resp.Body)
}
