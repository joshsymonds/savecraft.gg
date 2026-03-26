package main

import (
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeTestCSV creates a gzipped CSV file at the given path with the given content.
func writeTestCSV(t *testing.T, path string, csvContent string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("creating test CSV: %v", err)
	}
	defer f.Close()
	gz := gzip.NewWriter(f)
	gz.Write([]byte(csvContent))
	gz.Close()
}

// openTestCSV opens a gzipped test CSV and returns a decompressed reader.
func openTestCSV(t *testing.T, cacheDir string, csvContent string) *gzipReadCloser {
	t.Helper()
	path := filepath.Join(cacheDir, "test.csv.gz")
	writeTestCSV(t, path, csvContent)
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("opening test CSV: %v", err)
	}
	gz, err := gzip.NewReader(f)
	if err != nil {
		f.Close()
		t.Fatalf("gzip reader: %v", err)
	}
	return &gzipReadCloser{gz: gz, body: f}
}

func TestProcessGameAndSynergyData_BasicPair(t *testing.T) {
	csv := "won,main_colors,deck_CardA,deck_CardB\n" +
		"True,WU,1,1\n" +
		"False,WU,1,1\n" +
		"True,WU,1,0\n" +
		"False,WU,0,1\n"

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, csv)
	defer r.Close()

	accums, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Synergies) != 0 {
		t.Errorf("expected 0 synergies (below threshold), got %d", len(result.Synergies))
	}

	// Verify card accums were populated.
	overall := accums["_overall"]
	if overall == nil {
		t.Fatal("expected _overall accums")
	}
	if a, ok := overall["CardA"]; !ok {
		t.Error("CardA not in _overall accums")
	} else if a.gamesInDeck != 3 {
		t.Errorf("CardA gamesInDeck = %d, want 3", a.gamesInDeck)
	}
}

func TestProcessGameAndSynergyData_AboveThreshold(t *testing.T) {
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB\n")
	for range 200 {
		b.WriteString("True,WU,1,1\n")
	}
	for range 100 {
		b.WriteString("False,WU,1,1\n")
	}
	for range 40 {
		b.WriteString("True,WU,1,0\n")
	}
	for range 60 {
		b.WriteString("False,WU,1,0\n")
	}
	for range 50 {
		b.WriteString("True,WU,0,1\n")
	}
	for range 50 {
		b.WriteString("False,WU,0,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Synergies) != 2 {
		t.Fatalf("expected 2 synergy rows (both directions), got %d", len(result.Synergies))
	}

	var found synergyRow
	for _, s := range result.Synergies {
		if s.CardA == "CardA" && s.CardB == "CardB" {
			found = s
			break
		}
	}
	if found.CardA == "" {
		t.Fatal("CardA→CardB direction not found")
	}

	if found.GamesTogether != 300 {
		t.Errorf("games_together = %d, want 300", found.GamesTogether)
	}

	expectedDelta := 0.2167
	if diff := found.SynergyDelta - expectedDelta; diff > 0.01 || diff < -0.01 {
		t.Errorf("synergy_delta = %.4f, want ≈%.4f", found.SynergyDelta, expectedDelta)
	}

	var reverse synergyRow
	for _, s := range result.Synergies {
		if s.CardA == "CardB" && s.CardB == "CardA" {
			reverse = s
			break
		}
	}
	if reverse.CardA == "" {
		t.Fatal("CardB→CardA reverse direction not found")
	}
	if reverse.SynergyDelta != found.SynergyDelta {
		t.Errorf("reverse delta = %.4f, forward = %.4f; should be equal", reverse.SynergyDelta, found.SynergyDelta)
	}
}

func TestProcessGameAndSynergyData_ThreeCards(t *testing.T) {
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB,deck_CardC\n")
	for range 250 {
		b.WriteString("True,WU,1,1,1\n")
	}
	for range 50 {
		b.WriteString("True,WU,1,0,0\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Synergies) != 6 {
		t.Errorf("expected 6 synergy rows (3 pairs × 2 directions), got %d", len(result.Synergies))
	}
}

func TestProcessGameAndSynergyData_CurvesNilCMC(t *testing.T) {
	csv := "won,main_colors,deck_CardA\n" +
		"True,WU,1\n"

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, csv)
	defer r.Close()

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Curves) != 0 {
		t.Errorf("expected 0 curves with nil CMC map, got %d", len(result.Curves))
	}
}

func TestProcessGameAndSynergyData_CurvesWithCMC(t *testing.T) {
	// 10 winning WU games with CardA (CMC 2) and CardB (CMC 4) in deck.
	// 5 winning UB games with CardA (CMC 2) only.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB\n")
	for range 10 {
		b.WriteString("True,WU,1,1\n")
	}
	for range 5 {
		b.WriteString("True,UB,1,0\n")
	}
	// Losing games should not contribute to curves.
	for range 20 {
		b.WriteString("False,WU,1,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardCMC := map[string]float64{
		"CardA": 2.0,
		"CardB": 4.0,
	}

	_, result, err := processGameAndSynergyCSV(r, "TST", cardCMC, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// WU should have curves for CMC 2 (avg 1.0 CardA) and CMC 4 (avg 1.0 CardB).
	// UB should have curve for CMC 2 (avg 1.0 CardA).
	if len(result.Curves) < 2 {
		t.Fatalf("expected at least 2 curve rows, got %d", len(result.Curves))
	}

	// Find WU CMC 2 curve.
	var wuCMC2 curveRow
	for _, c := range result.Curves {
		if c.ColorPair == "WU" && c.CMC == 2 {
			wuCMC2 = c
			break
		}
	}
	if wuCMC2.ColorPair == "" {
		t.Fatal("WU CMC 2 curve not found")
	}
	if wuCMC2.TotalDecks != 10 {
		t.Errorf("WU total_decks = %d, want 10", wuCMC2.TotalDecks)
	}
	// 10 winning WU decks, each with 1 card at CMC 2 → avg 1.0
	if wuCMC2.AvgCount != 1.0 {
		t.Errorf("WU CMC 2 avg_count = %.2f, want 1.0", wuCMC2.AvgCount)
	}

	// Find UB CMC 2 curve.
	var ubCMC2 curveRow
	for _, c := range result.Curves {
		if c.ColorPair == "UB" && c.CMC == 2 {
			ubCMC2 = c
			break
		}
	}
	if ubCMC2.ColorPair == "" {
		t.Fatal("UB CMC 2 curve not found")
	}
	if ubCMC2.TotalDecks != 5 {
		t.Errorf("UB total_decks = %d, want 5", ubCMC2.TotalDecks)
	}
}

func TestProcessGameAndSynergyData_CurveCMC7Plus(t *testing.T) {
	// Cards with CMC >= 7 should all bucket into CMC 7.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_BigCard\n")
	for range 10 {
		b.WriteString("True,WU,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardCMC := map[string]float64{"BigCard": 9.0}

	_, result, err := processGameAndSynergyCSV(r, "TST", cardCMC, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var found curveRow
	for _, c := range result.Curves {
		if c.ColorPair == "WU" && c.CMC == 7 {
			found = c
			break
		}
	}
	if found.ColorPair == "" {
		t.Fatal("CMC 7+ bucket not found for WU")
	}
	if found.AvgCount != 1.0 {
		t.Errorf("avg_count = %.2f, want 1.0", found.AvgCount)
	}
}

func TestBuildSetSynergySQL(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		Synergies: []synergyRow{
			{CardA: "Card A", CardB: "Card B", SynergyDelta: 0.1234, GamesTogether: 500},
			{CardA: "Card B", CardB: "Card A", SynergyDelta: 0.1234, GamesTogether: 500},
		},
		Curves: []curveRow{
			{ColorPair: "WU", CMC: 2, AvgCount: 3.5, TotalDecks: 1000},
		},
	}

	sql := buildSetSynergySQL(result)

	// Per-set DELETEs with WHERE clause (not global DELETE)
	if !strings.Contains(sql, "DELETE FROM mtga_draft_synergies WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for synergies")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_archetype_curves WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for curves")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_deck_stats WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for deck stats")
	}
	// Must NOT contain global DELETEs
	if strings.Contains(sql, "DELETE FROM mtga_draft_synergies;") {
		t.Error("SQL should NOT contain global DELETE (no WHERE clause)")
	}

	if !strings.Contains(sql, "INSERT INTO mtga_draft_synergies") {
		t.Error("SQL should contain synergy INSERT")
	}
	if !strings.Contains(sql, "'WU'") {
		t.Error("SQL should contain color pair WU")
	}

	synergyCount := strings.Count(sql, "INSERT INTO mtga_draft_synergies")
	if synergyCount != 2 {
		t.Errorf("expected 2 synergy INSERTs, got %d", synergyCount)
	}
	curveCount := strings.Count(sql, "INSERT INTO mtga_draft_archetype_curves")
	if curveCount != 1 {
		t.Errorf("expected 1 curve INSERT, got %d", curveCount)
	}
}

func TestBuildSynergyImportSQL_EscapesQuotes(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		Synergies: []synergyRow{
			{CardA: "Frodo's Ring", CardB: "Sam's Pack", SynergyDelta: 0.05, GamesTogether: 300},
		},
	}

	sql := buildSetSynergySQL(result)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes")
	}
}

func TestProcessGameAndSynergyData_StratifiedDeconfounding(t *testing.T) {
	// Demonstrates the coattail effect: cards A and B co-occur in strong (WU)
	// and weak (BG) archetypes. Globally, synergy appears high because WU inflates
	// the co-occurrence WR. Stratified within each color pair, synergy is low.
	//
	// WU (strong archetype, ~75% WR):
	//   200 games A+B: 150 wins (WR=0.75)
	//    50 games A only: 37 wins (WR=0.74)
	//    50 games B only: 36 wins (WR=0.72)
	//   WU delta = 0.75 - (0.74+0.72)/2 = +0.02
	//
	// BG (weak archetype, ~40% WR):
	//    50 games A+B: 20 wins (WR=0.40)
	//    50 games A only: 20 wins (WR=0.40)
	//    50 games B only: 20 wins (WR=0.40)
	//   BG delta = 0.40 - (0.40+0.40)/2 = 0.00
	//
	// Unstratified global delta would be ~+0.115 (confounded).
	// Stratified weighted avg = (0.02×200 + 0.00×50) / 250 ≈ +0.016 (deconfounded).
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB\n")
	// WU: 200 games with both A+B (150 wins, 50 losses)
	for range 150 {
		b.WriteString("True,WU,1,1\n")
	}
	for range 50 {
		b.WriteString("False,WU,1,1\n")
	}
	// WU: 50 games with A only (37 wins)
	for range 37 {
		b.WriteString("True,WU,1,0\n")
	}
	for range 13 {
		b.WriteString("False,WU,1,0\n")
	}
	// WU: 50 games with B only (36 wins)
	for range 36 {
		b.WriteString("True,WU,0,1\n")
	}
	for range 14 {
		b.WriteString("False,WU,0,1\n")
	}
	// BG: 50 games with both A+B (20 wins)
	for range 20 {
		b.WriteString("True,BG,1,1\n")
	}
	for range 30 {
		b.WriteString("False,BG,1,1\n")
	}
	// BG: 50 games with A only (20 wins)
	for range 20 {
		b.WriteString("True,BG,1,0\n")
	}
	for range 30 {
		b.WriteString("False,BG,1,0\n")
	}
	// BG: 50 games with B only (20 wins)
	for range 20 {
		b.WriteString("True,BG,0,1\n")
	}
	for range 30 {
		b.WriteString("False,BG,0,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Total games together = 250 (200 WU + 50 BG), passes 200 threshold.
	if len(result.Synergies) != 2 {
		t.Fatalf("expected 2 synergy rows, got %d", len(result.Synergies))
	}

	var found synergyRow
	for _, s := range result.Synergies {
		if s.CardA == "CardA" && s.CardB == "CardB" {
			found = s
			break
		}
	}
	if found.CardA == "" {
		t.Fatal("CardA→CardB not found")
	}

	// Stratified delta should be close to +0.016, NOT the confounded +0.115.
	// WU: delta = 0.75 - (0.74+0.72)/2 = +0.02, weight 200
	// BG: delta = 0.40 - (0.40+0.40)/2 = 0.00, weight 50
	// Weighted avg = (0.02*200 + 0.00*50) / 250 = 0.016
	if found.SynergyDelta > 0.025 || found.SynergyDelta < 0.01 {
		t.Errorf("synergy_delta = %.4f, want 0.01–0.025 (deconfounded ~0.016)", found.SynergyDelta)
	}
}

func TestProcessGameAndSynergyData_RoleTargets(t *testing.T) {
	// 10 winning WU decks: each has CardA (creature) and CardB (removal) in deck.
	// 5 winning UB decks: each has CardA (creature) only.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB\n")
	for range 10 {
		b.WriteString("True,WU,1,1\n")
	}
	for range 5 {
		b.WriteString("True,UB,1,0\n")
	}
	// Losing games should not contribute to role targets.
	for range 20 {
		b.WriteString("False,WU,1,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardRoles := map[string]map[string]bool{
		"CardA": {"creature": true},
		"CardB": {"removal": true},
	}

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, cardRoles, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.RoleTargets) < 2 {
		t.Fatalf("expected at least 2 role target rows, got %d", len(result.RoleTargets))
	}

	// WU should have creature avg 1.0 and removal avg 1.0 (each of 10 winning decks has 1 of each).
	var wuCreature, wuRemoval roleTargetRow
	for _, rt := range result.RoleTargets {
		if rt.ColorPair == "WU" && rt.Role == "creature" {
			wuCreature = rt
		}
		if rt.ColorPair == "WU" && rt.Role == "removal" {
			wuRemoval = rt
		}
	}

	if wuCreature.ColorPair == "" {
		t.Fatal("WU creature role target not found")
	}
	if wuCreature.AvgCount != 1.0 {
		t.Errorf("WU creature avg_count = %.2f, want 1.0", wuCreature.AvgCount)
	}
	if wuCreature.TotalDecks != 10 {
		t.Errorf("WU creature total_decks = %d, want 10", wuCreature.TotalDecks)
	}

	if wuRemoval.ColorPair == "" {
		t.Fatal("WU removal role target not found")
	}
	if wuRemoval.AvgCount != 1.0 {
		t.Errorf("WU removal avg_count = %.2f, want 1.0", wuRemoval.AvgCount)
	}

	// UB should have creature avg 1.0 but no removal (CardB not in UB decks).
	var ubCreature roleTargetRow
	var ubRemovalFound bool
	for _, rt := range result.RoleTargets {
		if rt.ColorPair == "UB" && rt.Role == "creature" {
			ubCreature = rt
		}
		if rt.ColorPair == "UB" && rt.Role == "removal" {
			ubRemovalFound = true
		}
	}

	if ubCreature.ColorPair == "" {
		t.Fatal("UB creature role target not found")
	}
	if ubCreature.AvgCount != 1.0 {
		t.Errorf("UB creature avg_count = %.2f, want 1.0", ubCreature.AvgCount)
	}
	if ubRemovalFound {
		t.Error("UB should not have a removal role target (no removal cards in UB decks)")
	}
}

func TestProcessGameAndSynergyData_RoleTargetsMultiRole(t *testing.T) {
	// A card with multiple roles (creature + removal) should count toward both.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_Chupacabra\n")
	for range 10 {
		b.WriteString("True,WU,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardRoles := map[string]map[string]bool{
		"Chupacabra": {"creature": true, "removal": true},
	}

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, cardRoles, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var creatureCount, removalCount float64
	for _, rt := range result.RoleTargets {
		if rt.ColorPair == "WU" && rt.Role == "creature" {
			creatureCount = rt.AvgCount
		}
		if rt.ColorPair == "WU" && rt.Role == "removal" {
			removalCount = rt.AvgCount
		}
	}

	if creatureCount != 1.0 {
		t.Errorf("WU creature avg_count = %.2f, want 1.0", creatureCount)
	}
	if removalCount != 1.0 {
		t.Errorf("WU removal avg_count = %.2f, want 1.0", removalCount)
	}
}

func TestBuildSynergyImportSQL_RoleTargets(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		RoleTargets: []roleTargetRow{
			{ColorPair: "WU", Role: "creature", AvgCount: 14.5, TotalDecks: 1000},
			{ColorPair: "WU", Role: "removal", AvgCount: 4.2, TotalDecks: 1000},
		},
	}

	sql := buildSetSynergySQL(result)

	if !strings.Contains(sql, "DELETE FROM mtga_draft_role_targets WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for role targets")
	}

	rtCount := strings.Count(sql, "INSERT INTO mtga_draft_role_targets")
	if rtCount != 2 {
		t.Errorf("expected 2 role target INSERTs, got %d", rtCount)
	}

	if !strings.Contains(sql, "'creature'") {
		t.Error("SQL should contain creature role")
	}
	if !strings.Contains(sql, "'removal'") {
		t.Error("SQL should contain removal role")
	}
}

func TestProcessGameAndSynergyData_DeckStats(t *testing.T) {
	// Scenario: 2 archetypes (WU, UB) with different deck compositions.
	// WU: 10 winning decks, each with Land1 (land), Land2 (fixing land),
	//     Creature1 (creature), Spell1 (noncreature nonland).
	//     5 of the 10 WU decks have splash_colors set (splash decks).
	// UB: 5 winning decks with Land1, Creature1 only (no fixing, no splash).
	// Losing decks should NOT contribute.
	var b strings.Builder
	b.WriteString("won,main_colors,splash_colors,deck_Land1,deck_Land2,deck_Creature1,deck_Spell1\n")
	// WU winning, splash (5 decks): 8 lands, 1 fixing, 1 creature, 1 spell
	for range 5 {
		b.WriteString("True,WU,R,8,1,1,1\n")
	}
	// WU winning, no splash (5 decks): 9 lands, 1 fixing, 1 creature, 1 spell
	for range 5 {
		b.WriteString("True,WU,,9,1,1,1\n")
	}
	// WU losing (should be excluded from deck stats)
	for range 10 {
		b.WriteString("False,WU,,7,1,1,1\n")
	}
	// UB winning, no splash (5 decks): 7 lands, no fixing, 1 creature, no spell
	for range 5 {
		b.WriteString("True,UB,,7,0,1,0\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardLands := map[string]bool{"Land1": true, "Land2": true}
	cardFixing := map[string]bool{"Land2": true}
	cardRoles := map[string]map[string]bool{
		"Creature1": {"creature": true},
	}

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, cardRoles, cardLands, cardFixing)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.DeckStats) < 2 {
		t.Fatalf("expected at least 2 deck stat rows, got %d", len(result.DeckStats))
	}

	// Find WU deck stats.
	var wu deckStatsRow
	for _, ds := range result.DeckStats {
		if ds.ColorPair == "WU" {
			wu = ds
			break
		}
	}
	if wu.ColorPair == "" {
		t.Fatal("WU deck stats not found")
	}
	if wu.TotalDecks != 10 {
		t.Errorf("WU total_decks = %d, want 10", wu.TotalDecks)
	}
	// WU avg lands: 5 decks × (8+1)=9 lands + 5 decks × (9+1)=10 lands = 95/10 = 9.5
	if wu.AvgLands != 9.5 {
		t.Errorf("WU avg_lands = %.2f, want 9.5", wu.AvgLands)
	}
	// WU avg creatures: all 10 decks have 1 creature each = 1.0
	if wu.AvgCreatures != 1.0 {
		t.Errorf("WU avg_creatures = %.2f, want 1.0", wu.AvgCreatures)
	}
	// WU avg noncreatures: all 10 decks have 1 spell each = 1.0
	if wu.AvgNoncreatures != 1.0 {
		t.Errorf("WU avg_noncreatures = %.2f, want 1.0", wu.AvgNoncreatures)
	}
	// WU avg fixing: all 10 decks have 1 fixing land each = 1.0
	if wu.AvgFixing != 1.0 {
		t.Errorf("WU avg_fixing = %.2f, want 1.0", wu.AvgFixing)
	}
	// WU splash rate: 5 splash games / 20 total games = 0.25
	if wu.SplashRate != 0.25 {
		t.Errorf("WU splash_rate = %.4f, want 0.25", wu.SplashRate)
	}
	// WU splash avg sources (fixing in splash decks): 5 splash decks × 1 fixing = 1.0
	if wu.SplashAvgSources != 1.0 {
		t.Errorf("WU splash_avg_sources = %.2f, want 1.0", wu.SplashAvgSources)
	}

	// Find UB deck stats.
	var ub deckStatsRow
	for _, ds := range result.DeckStats {
		if ds.ColorPair == "UB" {
			ub = ds
			break
		}
	}
	if ub.ColorPair == "" {
		t.Fatal("UB deck stats not found")
	}
	if ub.TotalDecks != 5 {
		t.Errorf("UB total_decks = %d, want 5", ub.TotalDecks)
	}
	// UB avg lands: 5 decks × 7 lands = 7.0
	if ub.AvgLands != 7.0 {
		t.Errorf("UB avg_lands = %.2f, want 7.0", ub.AvgLands)
	}
	// UB avg fixing: 0 (no fixing lands)
	if ub.AvgFixing != 0.0 {
		t.Errorf("UB avg_fixing = %.2f, want 0.0", ub.AvgFixing)
	}
	// UB splash rate: 0 (no splash decks)
	if ub.SplashRate != 0.0 {
		t.Errorf("UB splash_rate = %.2f, want 0.0", ub.SplashRate)
	}
}

func TestProcessGameAndSynergyData_DeckStatsNilMaps(t *testing.T) {
	// When cardLands and cardFixing are nil, deck stats should be skipped.
	csv := "won,main_colors,deck_CardA\n" +
		"True,WU,1\n"

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, csv)
	defer r.Close()

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.DeckStats) != 0 {
		t.Errorf("expected 0 deck stats with nil maps, got %d", len(result.DeckStats))
	}
}

func TestProcessGameAndSynergyData_DeckStatsSplashWinrates(t *testing.T) {
	// Verify splash vs non-splash win rates are tracked correctly.
	// We need BOTH winning and losing games to compute win rates.
	var b strings.Builder
	b.WriteString("won,main_colors,splash_colors,deck_Land1,deck_Creature1\n")
	// WU splash wins: 3
	for range 3 {
		b.WriteString("True,WU,G,7,1\n")
	}
	// WU splash losses: 1
	b.WriteString("False,WU,G,7,1\n")
	// WU non-splash wins: 4
	for range 4 {
		b.WriteString("True,WU,,7,1\n")
	}
	// WU non-splash losses: 2
	for range 2 {
		b.WriteString("False,WU,,7,1\n")
	}

	cacheDir := t.TempDir()
	r := openTestCSV(t, cacheDir, b.String())
	defer r.Close()

	cardLands := map[string]bool{"Land1": true}
	cardFixing := map[string]bool{}

	_, result, err := processGameAndSynergyCSV(r, "TST", nil, nil, cardLands, cardFixing)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var wu deckStatsRow
	for _, ds := range result.DeckStats {
		if ds.ColorPair == "WU" {
			wu = ds
			break
		}
	}
	if wu.ColorPair == "" {
		t.Fatal("WU deck stats not found")
	}

	// Total decks = wins only for composition stats = 7 (3 splash + 4 non-splash wins)
	// But win rates need ALL games.
	// Splash: 3 wins / 4 games = 0.75
	// Non-splash: 4 wins / 6 games ≈ 0.6667
	if diff := wu.SplashWinrate - 0.75; diff > 0.01 || diff < -0.01 {
		t.Errorf("WU splash_winrate = %.4f, want ≈0.75", wu.SplashWinrate)
	}
	if diff := wu.NonsplashWinrate - 0.6667; diff > 0.01 || diff < -0.01 {
		t.Errorf("WU nonsplash_winrate = %.4f, want ≈0.6667", wu.NonsplashWinrate)
	}
}

func TestBuildSynergyImportSQL_DeckStats(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		DeckStats: []deckStatsRow{
			{
				ColorPair:        "WU",
				AvgLands:         17.2,
				AvgCreatures:     15.5,
				AvgNoncreatures:  7.3,
				AvgFixing:        1.8,
				SplashRate:       0.35,
				SplashAvgSources: 2.1,
				SplashWinrate:    0.52,
				NonsplashWinrate: 0.55,
				TotalDecks:       1000,
			},
		},
	}

	sql := buildSetSynergySQL(result)

	if !strings.Contains(sql, "DELETE FROM mtga_draft_deck_stats WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for deck stats")
	}

	dsCount := strings.Count(sql, "INSERT INTO mtga_draft_deck_stats")
	if dsCount != 1 {
		t.Errorf("expected 1 deck stats INSERT, got %d", dsCount)
	}

	if !strings.Contains(sql, "'WU'") {
		t.Error("SQL should contain color pair WU")
	}
}


func TestBuildSetRatingsSQL(t *testing.T) {
	sr := setResult{
		Set:        "DSK",
		TotalGames: 250_000,
		CardCount:  2,
		AvgGIHWR:   0.515,
		Cards: []cardResult{
			{
				Name: "Gloomlake Verge",
				Overall: setCardStats{
					GamesInHand: 15_000, GamesPlayed: 20_000, GamesNotSeen: 5000,
					GIHWR: 0.564, OHWR: 0.62, GDWR: 0.54, GNSWR: 0.48, IWD: 0.06,
					ALSA: 8.5, ATA: 9.2, ATAStddev: 3.1,
				},
				ByColor: map[string]setCardStats{
					"UB": {
						GamesInHand: 3000, GamesPlayed: 4000, GamesNotSeen: 1000,
						GIHWR: 0.59, OHWR: 0.63, GDWR: 0.56, GNSWR: 0.49, IWD: 0.07,
						ALSA: 7.2, ATA: 8.0, ATAStddev: 2.8,
					},
				},
			},
			{
				Name: "Lightning Bolt",
				Overall: setCardStats{
					GamesInHand: 10_000, GamesPlayed: 12_000, GamesNotSeen: 2000,
					GIHWR: 0.58, OHWR: 0.60, GDWR: 0.55, GNSWR: 0.50, IWD: 0.05,
					ALSA: 3.0, ATA: 2.5, ATAStddev: 1.2,
				},
			},
		},
	}

	sql := buildSetRatingsSQL(sr)

	// Per-set DELETEs with WHERE clause
	if !strings.Contains(sql, "DELETE FROM mtga_draft_ratings_fts WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for ratings_fts")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_ratings WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for ratings")
	}
	// Must NOT contain global DELETEs
	if strings.Contains(sql, "DELETE FROM mtga_draft_ratings;") {
		t.Error("SQL should NOT contain global DELETE (no WHERE clause)")
	}

	if !strings.Contains(sql, "INSERT INTO mtga_draft_set_stats") {
		t.Error("SQL should contain INSERT INTO mtga_draft_set_stats")
	}
	if !strings.Contains(sql, "Gloomlake Verge") {
		t.Error("SQL should contain card name")
	}
	if !strings.Contains(sql, "INSERT INTO mtga_draft_color_stats") {
		t.Error("SQL should contain INSERT INTO mtga_draft_color_stats")
	}
	if !strings.Contains(sql, "'UB'") {
		t.Error("SQL should contain color pair UB")
	}
	if !strings.Contains(sql, "ata_stddev") {
		t.Error("SQL should contain ata_stddev column")
	}

	overallCount := strings.Count(sql, "INSERT INTO mtga_draft_ratings (")
	if overallCount != 2 {
		t.Errorf("expected 2 overall rating INSERTs, got %d", overallCount)
	}
	colorCount := strings.Count(sql, "INSERT INTO mtga_draft_color_stats")
	if colorCount != 1 {
		t.Errorf("expected 1 color stat INSERT, got %d", colorCount)
	}
	ftsCount := strings.Count(sql, "INSERT INTO mtga_draft_ratings_fts")
	if ftsCount != 2 {
		t.Errorf("expected 2 FTS5 INSERTs, got %d", ftsCount)
	}
}

func TestBuildSetRatingsSQL_EscapesSingleQuotes(t *testing.T) {
	sr := setResult{
		Set: "LTR",
		Cards: []cardResult{
			{
				Name:    "Frodo's Ring",
				Overall: setCardStats{GamesInHand: 100, GamesPlayed: 200},
			},
		},
	}

	sql := buildSetRatingsSQL(sr)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes in card names")
	}
}

func TestBuildSetRatingsSQL_EmptyCards(t *testing.T) {
	sr := setResult{Set: "DSK"}
	sql := buildSetRatingsSQL(sr)

	// Should still have per-set DELETE statements
	if !strings.Contains(sql, "DELETE FROM mtga_draft_ratings WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE even with no cards")
	}
	// Should contain set_stats INSERT (even with 0 cards)
	if !strings.Contains(sql, "INSERT INTO mtga_draft_set_stats") {
		t.Error("SQL should contain set stats INSERT")
	}
	// No card-level INSERTs
	if strings.Contains(sql, "INSERT INTO mtga_draft_ratings (") {
		t.Error("SQL should not contain card rating INSERT with empty cards")
	}
}
