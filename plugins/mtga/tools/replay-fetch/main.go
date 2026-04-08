// replay-fetch downloads 17Lands replay_data and populates D1 with per-turn
// gameplay statistics for the play_advisor reference module.
//
// Usage: go run ./plugins/mtga/tools/replay-fetch --d1-database-id=UUID
//
// Data source: 17Lands (17lands.com), licensed CC BY 4.0
//
// D1 population:
//   - mtga_play_card_timing, mtga_play_tempo, mtga_play_combat,
//     mtga_play_mulligan, mtga_play_turn_baselines tables via Cloudflare D1
//     bulk import API
package main

import (
	"context"
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/fetch"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/sets"
	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

const (
	replayDataURL = "https://17lands-public.s3.amazonaws.com/analysis_data/replay_data/replay_data_public.%s.PremierDraft.csv.gz"
	maxTurn       = 20 // aggregate turns beyond this into the last bucket
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
	d1DatabaseID := flag.String("d1-database-id", "", "D1 database ID (required)")
	setFilter := flag.String("set", "", "Process a single set (e.g., 'FDN'). If empty, processes all sets.")
	cacheDir := flag.String("cache-dir", cfapi.DefaultCacheDir(), "Local cache directory for downloaded CSVs")
	retry := flag.Bool("retry", false, "Retry mode: import cached SQL files without reprocessing CSVs")
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
		return fmt.Errorf("missing: %s", strings.Join(missing, ", "))
	}

	if *retry {
		sqlDir := filepath.Join(*cacheDir, "sql")
		return cfapi.RetryFromDisk(*cfAccountID, *d1DatabaseID, *cfAPIToken, sqlDir, "_replay.sql")
	}

	targetSets, err := sets.Resolve(context.Background(), *setFilter)
	if err != nil {
		return err
	}

	// Fetch arena_id → card info mapping from D1.
	arenaCards, err := fetchArenaCards(*cfAccountID, *d1DatabaseID, *cfAPIToken)
	if err != nil {
		return fmt.Errorf("fetching arena cards: %w", err)
	}
	fmt.Printf("Loaded %d arena ID → card name mappings from D1\n", len(arenaCards))

	// Process sets concurrently.
	type setWork struct {
		result *replayResult
		err    error
	}
	results := make([]setWork, len(targetSets))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4) // replay data is much larger, limit concurrency

	for i, set := range targetSets {
		wg.Add(1)
		go func(idx int, setCode string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			fmt.Printf("Processing %s replay data...\n", setCode)
			result, err := processReplayData(setCode, *cacheDir, arenaCards)
			if err != nil {
				fmt.Printf("  WARN: %s replay data failed: %v (skipping)\n", setCode, err)
				results[idx] = setWork{err: err}
				return
			}
			fmt.Printf("  %s: %d games, %d card timing rows, %d tempo rows, %d combat rows, %d mulligan rows, %d baseline rows\n",
				setCode, result.totalGames,
				len(result.cardTiming), len(result.tempo),
				len(result.combat), len(result.mulligan),
				len(result.baselines))
			results[idx] = setWork{result: result}
		}(i, set)
	}
	wg.Wait()

	// Collect successful results.
	var processed []*replayResult
	for _, r := range results {
		if r.err == nil && r.result != nil {
			processed = append(processed, r.result)
		}
	}
	fmt.Printf("Done processing %d sets.\n", len(processed))

	// Write SQL and import.
	sqlDir := filepath.Join(*cacheDir, "sql")
	if err := os.MkdirAll(sqlDir, 0755); err != nil {
		return fmt.Errorf("creating SQL cache dir: %w", err)
	}

	existingHashes, _ := cfapi.GetAllPipelineHashes(*cfAccountID, *d1DatabaseID, *cfAPIToken, "replay")
	if existingHashes == nil {
		existingHashes = make(map[string]string)
	}

	var importErrors []string
	for _, result := range processed {
		setCode := result.set

		csvPath := filepath.Join(*cacheDir, fmt.Sprintf("replay_data_public.%s.PremierDraft.csv.gz", setCode))
		csvHash, err := fetch.FileHash(csvPath)
		if err != nil {
			fmt.Printf("  WARN: could not hash CSV for %s: %v (importing anyway)\n", setCode, err)
			csvHash = ""
		}

		if csvHash != "" && existingHashes[setCode] == csvHash {
			fmt.Printf("  %s: unchanged (hash match), skipping\n", setCode)
			continue
		}

		sql := buildReplaySQL(result)
		sqlPath := filepath.Join(sqlDir, setCode+"_replay.sql")
		if err := os.WriteFile(sqlPath, []byte(sql), 0644); err != nil {
			return fmt.Errorf("writing SQL for %s: %w", setCode, err)
		}

		fmt.Printf("  %s: importing (%.1f MB)...\n", setCode, float64(len(sql))/1048576)
		if err := cfapi.ImportD1SQL(*cfAccountID, *d1DatabaseID, *cfAPIToken, sql); err != nil {
			fmt.Printf("  FAIL: %s import: %v\n", setCode, err)
			importErrors = append(importErrors, setCode)
			continue
		}
		os.Remove(sqlPath)

		if csvHash != "" {
			rowCount := len(result.cardTiming) + len(result.tempo) + len(result.combat) + len(result.mulligan) + len(result.baselines)
			if err := cfapi.UpdatePipelineState(*cfAccountID, *d1DatabaseID, *cfAPIToken, "replay", setCode, csvHash, rowCount); err != nil {
				fmt.Printf("  WARN: %s pipeline state update failed: %v\n", setCode, err)
			}
		}

		fmt.Printf("  %s: done\n", setCode)
	}

	if len(importErrors) > 0 {
		return fmt.Errorf("D1 import failed for %d sets: %s (SQL cached in %s for retry)", len(importErrors), strings.Join(importErrors, ", "), sqlDir)
	}

	fmt.Println("D1 population complete")
	return nil
}

// arenaCardInfo holds resolved card metadata for an arena ID.
type arenaCardInfo struct {
	name string
	cmc  float64
}

// fetchArenaCards queries D1 for arena_id → (front_face_name, cmc) mapping.
func fetchArenaCards(accountID, databaseID, apiToken string) (map[int]arenaCardInfo, error) {
	rows, err := cfapi.QueryD1(accountID, databaseID, apiToken,
		"SELECT arena_id, front_face_name, cmc FROM mtga_cards WHERE is_default = 1 AND front_face_name != '' AND arena_id IS NOT NULL")
	if err != nil {
		return nil, fmt.Errorf("querying mtga_cards: %w", err)
	}

	cards := make(map[int]arenaCardInfo, len(rows))
	for _, row := range rows {
		arenaID, ok := row["arena_id"].(float64)
		if !ok {
			continue
		}
		name, ok := row["front_face_name"].(string)
		if !ok {
			continue
		}
		cmc, _ := row["cmc"].(float64)
		cards[int(arenaID)] = arenaCardInfo{name: name, cmc: cmc}
	}
	return cards, nil
}

// clampTurn clamps a turn number to [1, maxTurn].
func clampTurn(t int) int {
	if t < 1 {
		return 1
	}
	if t > maxTurn {
		return maxTurn
	}
	return t
}

// clampCreatures clamps creature count to [0, 4] for combat bucketing.
func clampCreatures(n int) int {
	if n < 0 {
		return 0
	}
	if n > 4 {
		return 4
	}
	return n
}

// manaSpentBucket clamps mana spent to [0, 5] for tempo bucketing.
func manaSpentBucket(mana float64) int {
	b := int(math.Round(mana))
	if b < 0 {
		return 0
	}
	if b > 5 {
		return 5
	}
	return b
}

// nonlandCMCBucket categorizes average nonland CMC into low/mid/high.
func nonlandCMCBucket(avgCMC float64) string {
	if avgCMC < 2.0 {
		return "low"
	}
	if avgCMC <= 3.0 {
		return "mid"
	}
	return "high"
}

// ── Replay data structures ───────────────────────────────────

// replayResult holds all aggregated replay data for a single set.
type replayResult struct {
	set        string
	totalGames int
	cardTiming []cardTimingRow
	tempo      []tempoRow
	combat     []combatRow
	mulligan   []mulliganRow
	baselines  []baselineRow
}

type cardTimingRow struct {
	CardName      string
	Archetype     string
	TurnNumber    int
	TimesDeployed int
	GamesWon      int
	TotalGames    int
}

type tempoRow struct {
	Archetype       string
	TurnNumber      int
	OnPlay          bool
	ManaSpentBucket int
	GamesWon        int
	TotalGames      int
}

type combatRow struct {
	AttackerName       string
	TurnNumber         int
	UserCreaturesCount int
	OppoCreaturesCount int
	Attacked           bool
	GamesWon           int
	TotalGames         int
}

type mulliganRow struct {
	Archetype       string
	OnPlay          bool
	LandCount       int
	NonlandCMCBuckt string
	NumMulligans    int
	GamesWon        int
	TotalGames      int
}

type baselineRow struct {
	Archetype              string
	TurnNumber             int
	OnPlay                 bool
	TotalManaSpent         float64
	TotalCreaturesCast     int
	TotalSpellsCast        int
	TotalCreaturesAttacked int
	TotalAttacksPossible   int
	GamesWon               int
	TotalGames             int
}

// ── Accumulators ─────────────────────────────────────────────

type cardTimingKey struct {
	cardName  string
	archetype string
	turn      int
}

type cardTimingAccum struct {
	timesDeployed int
	gamesWon      int
	totalGames    int
}

type tempoKey struct {
	archetype       string
	turn            int
	onPlay          bool
	manaSpentBucket int
}

type tempoAccum struct {
	gamesWon   int
	totalGames int
}

type combatKey struct {
	attackerName       string
	turn               int
	userCreaturesCount int
	oppoCreaturesCount int
	attacked           bool
}

type combatAccum struct {
	gamesWon   int
	totalGames int
}

type mulliganKey struct {
	archetype       string
	onPlay          bool
	landCount       int
	nonlandCMCBuckt string
	numMulligans    int
}

type mulliganAccum struct {
	gamesWon   int
	totalGames int
}

type baselineKey struct {
	archetype string
	turn      int
	onPlay    bool
}

type baselineAccum struct {
	totalManaSpent         float64
	totalCreaturesCast     int
	totalSpellsCast        int
	totalCreaturesAttacked int
	totalAttacksPossible   int
	gamesWon               int
	totalGames             int
}

// ── Column parsing helpers ───────────────────────────────────

// turnColRegex matches per-turn column names like "user_turn_3_creatures_cast".
var turnColRegex = regexp.MustCompile(`^(user|oppo)_turn_(\d+)_(.+)$`)

// parseTurnColumns builds a map from (side, turn, field) → column index.
type turnColKey struct {
	side  string // "user" or "oppo"
	turn  int
	field string
}

func parseTurnColumns(header []string) map[turnColKey]int {
	cols := make(map[turnColKey]int, len(header))
	for i, h := range header {
		m := turnColRegex.FindStringSubmatch(h)
		if m == nil {
			continue
		}
		turn, _ := strconv.Atoi(m[2])
		cols[turnColKey{side: m[1], turn: turn, field: m[3]}] = i
	}
	return cols
}

// resolveCardIDs takes a pipe-separated string of arena IDs (e.g., "93965|95194")
// and resolves them to card names. Unresolvable IDs (tokens) are skipped.
func resolveCardIDs(pipeStr string, arenaCards map[int]arenaCardInfo) []string {
	if pipeStr == "" {
		return nil
	}
	parts := strings.Split(pipeStr, "|")
	names := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		id, err := strconv.Atoi(p)
		if err != nil {
			continue
		}
		if card, ok := arenaCards[id]; ok {
			names = append(names, card.name)
		}
	}
	return names
}

// countCreatures counts creatures in a pipe-separated arena ID string.
// Counts all valid IDs including tokens (unresolvable IDs are still on the battlefield).
func countCreatures(pipeStr string) int {
	if pipeStr == "" {
		return 0
	}
	count := 0
	for _, p := range strings.Split(pipeStr, "|") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, err := strconv.Atoi(p); err == nil {
			count++
		}
	}
	return count
}

// getCol safely reads a column value from a row.
func getCol(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return row[idx]
}

// getColFloat safely reads a float column value.
func getColFloat(row []string, idx int) float64 {
	s := getCol(row, idx)
	if s == "" {
		return 0
	}
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

// getColInt safely reads an integer column value.
func getColInt(row []string, idx int) int {
	s := getCol(row, idx)
	if s == "" {
		return 0
	}
	i, _ := strconv.Atoi(s)
	return i
}
