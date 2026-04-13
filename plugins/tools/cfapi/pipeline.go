package cfapi

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PipelineGlobalSet is the set_code sentinel for tools that operate on
// global data (not per-set), like scryfall-fetch and rules-fetch.
const PipelineGlobalSet = "_global"

// DefaultCacheDir returns ~/.cache/savecraft/17lands.
func DefaultCacheDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(os.TempDir(), "savecraft", "17lands")
	}
	return filepath.Join(home, ".cache", "savecraft", "17lands")
}

// GetPipelineHash returns the content hash for a (tool, set_code) pair from
// magic_pipeline_state. Returns empty string if no record exists.
func GetPipelineHash(accountID, databaseID, apiToken, tool, setCode string) (string, error) {
	sql := fmt.Sprintf(
		"SELECT content_hash FROM magic_pipeline_state WHERE tool = %s AND set_code = %s",
		SQLQuote(tool), SQLQuote(setCode),
	)
	rows, err := QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return "", fmt.Errorf("querying pipeline state: %w", err)
	}
	if len(rows) == 0 {
		return "", nil
	}
	hash, _ := rows[0]["content_hash"].(string)
	return hash, nil
}

// GetAllPipelineHashes returns all content hashes for a tool as a map of
// set_code → hash. Single D1 query instead of N+1 per-set calls.
func GetAllPipelineHashes(accountID, databaseID, apiToken, tool string) (map[string]string, error) {
	sql := fmt.Sprintf(
		"SELECT set_code, content_hash FROM magic_pipeline_state WHERE tool = %s",
		SQLQuote(tool),
	)
	rows, err := QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return nil, fmt.Errorf("querying pipeline state: %w", err)
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		sc, _ := row["set_code"].(string)
		hash, _ := row["content_hash"].(string)
		if sc != "" {
			result[sc] = hash
		}
	}
	return result, nil
}

// UpdatePipelineState upserts a pipeline state record after a successful import.
func UpdatePipelineState(accountID, databaseID, apiToken, tool, setCode, contentHash string, rowCount int) error {
	sql := fmt.Sprintf(
		"INSERT OR REPLACE INTO magic_pipeline_state (tool, set_code, content_hash, imported_at, row_count) VALUES (%s, %s, %s, %s, %d)",
		SQLQuote(tool), SQLQuote(setCode), SQLQuote(contentHash),
		SQLQuote(time.Now().UTC().Format(time.RFC3339)), rowCount,
	)
	return ImportD1SQL(accountID, databaseID, apiToken, sql)
}

// RetryFromDisk scans sqlDir for cached SQL files matching the given suffix
// (e.g., ".sql" or "_roles.sql") and imports each via D1. Removes files on
// success, leaves them on failure. Returns error if any imports failed.
func RetryFromDisk(accountID, databaseID, apiToken, sqlDir, suffix string) error {
	entries, err := os.ReadDir(sqlDir)
	if err != nil {
		return fmt.Errorf("reading SQL cache dir %s: %w", sqlDir, err)
	}

	var sqlFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), suffix) {
			sqlFiles = append(sqlFiles, e.Name())
		}
	}

	if len(sqlFiles) == 0 {
		fmt.Println("No cached SQL files found — nothing to retry.")
		return nil
	}

	fmt.Printf("Found %d cached SQL files to retry:\n", len(sqlFiles))
	sort.Strings(sqlFiles)

	var importErrors []string
	for _, name := range sqlFiles {
		path := filepath.Join(sqlDir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			fmt.Printf("  SKIP %s: %v\n", name, err)
			continue
		}

		fmt.Printf("  %s: importing (%.1f KB)...\n", name, float64(len(data))/1024)
		if err := ImportD1SQL(accountID, databaseID, apiToken, string(data)); err != nil {
			fmt.Printf("  FAIL %s: %v\n", name, err)
			importErrors = append(importErrors, name)
			continue
		}
		os.Remove(path)
		fmt.Printf("  %s: done\n", name)
	}

	if len(importErrors) > 0 {
		return fmt.Errorf("retry failed for %d files: %s", len(importErrors), strings.Join(importErrors, ", "))
	}

	fmt.Println("Retry complete — all cached SQL imported successfully.")
	return nil
}
