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

func TestProcessSynergyData_BasicPair(t *testing.T) {
	csv := "won,main_colors,deck_CardA,deck_CardB\n" +
		"True,WU,1,1\n" +
		"False,WU,1,1\n" +
		"True,WU,1,0\n" +
		"False,WU,0,1\n"

	cacheDir := t.TempDir()
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), csv)

	result, err := processSynergyData("TST", cacheDir, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Synergies) != 0 {
		t.Errorf("expected 0 synergies (below threshold), got %d", len(result.Synergies))
	}
}

func TestProcessSynergyData_AboveThreshold(t *testing.T) {
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
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	result, err := processSynergyData("TST", cacheDir, nil, nil)
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

func TestProcessSynergyData_ThreeCards(t *testing.T) {
	var b strings.Builder
	b.WriteString("won,main_colors,deck_CardA,deck_CardB,deck_CardC\n")
	for range 250 {
		b.WriteString("True,WU,1,1,1\n")
	}
	for range 50 {
		b.WriteString("True,WU,1,0,0\n")
	}

	cacheDir := t.TempDir()
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	result, err := processSynergyData("TST", cacheDir, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Synergies) != 6 {
		t.Errorf("expected 6 synergy rows (3 pairs × 2 directions), got %d", len(result.Synergies))
	}
}

func TestProcessSynergyData_CurvesNilCMC(t *testing.T) {
	csv := "won,main_colors,deck_CardA\n" +
		"True,WU,1\n"

	cacheDir := t.TempDir()
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), csv)

	result, err := processSynergyData("TST", cacheDir, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Curves) != 0 {
		t.Errorf("expected 0 curves with nil CMC map, got %d", len(result.Curves))
	}
}

func TestProcessSynergyData_CurvesWithCMC(t *testing.T) {
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
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	cardCMC := map[string]float64{
		"CardA": 2.0,
		"CardB": 4.0,
	}

	result, err := processSynergyData("TST", cacheDir, cardCMC, nil)
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

func TestProcessSynergyData_CurveCMC7Plus(t *testing.T) {
	// Cards with CMC >= 7 should all bucket into CMC 7.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_BigCard\n")
	for range 10 {
		b.WriteString("True,WU,1\n")
	}

	cacheDir := t.TempDir()
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	cardCMC := map[string]float64{"BigCard": 9.0}

	result, err := processSynergyData("TST", cacheDir, cardCMC, nil)
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

func TestBuildSynergyImportSQL(t *testing.T) {
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

	sql := buildSynergyImportSQL([]synergyDataResult{result})

	if !strings.Contains(sql, "DELETE FROM mtga_draft_synergies;") {
		t.Error("SQL should contain DELETE for synergies")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_archetype_curves;") {
		t.Error("SQL should contain DELETE for curves")
	}
	if !strings.Contains(sql, "INSERT INTO mtga_draft_synergies") {
		t.Error("SQL should contain synergy INSERT")
	}
	if !strings.Contains(sql, "INSERT INTO mtga_draft_archetype_curves") {
		t.Error("SQL should contain curve INSERT")
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

	sql := buildSynergyImportSQL([]synergyDataResult{result})

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes")
	}
}

func TestProcessSynergyData_StratifiedDeconfounding(t *testing.T) {
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
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	result, err := processSynergyData("TST", cacheDir, nil, nil)
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

func TestProcessSynergyData_RoleTargets(t *testing.T) {
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
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	cardRoles := map[string]map[string]bool{
		"CardA": {"creature": true},
		"CardB": {"removal": true},
	}

	result, err := processSynergyData("TST", cacheDir, nil, cardRoles)
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

func TestProcessSynergyData_RoleTargetsMultiRole(t *testing.T) {
	// A card with multiple roles (creature + removal) should count toward both.
	var b strings.Builder
	b.WriteString("won,main_colors,deck_Chupacabra\n")
	for range 10 {
		b.WriteString("True,WU,1\n")
	}

	cacheDir := t.TempDir()
	writeTestCSV(t, filepath.Join(cacheDir, "game_data_public.TST.PremierDraft.csv.gz"), b.String())

	cardRoles := map[string]map[string]bool{
		"Chupacabra": {"creature": true, "removal": true},
	}

	result, err := processSynergyData("TST", cacheDir, nil, cardRoles)
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

	sql := buildSynergyImportSQL([]synergyDataResult{result})

	if !strings.Contains(sql, "DELETE FROM mtga_draft_role_targets;") {
		t.Error("SQL should contain DELETE for role targets")
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
