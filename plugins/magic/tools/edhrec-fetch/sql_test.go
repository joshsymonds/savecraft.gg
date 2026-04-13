package main

import (
	"strings"
	"testing"
)

func TestBuildCommanderSQL(t *testing.T) {
	data := loadFixture(t, "atraxa_commander.json")
	pc, err := ParseCommanderPage(data)
	if err != nil {
		t.Fatalf("parse commander: %v", err)
	}
	combosData := loadFixture(t, "atraxa_combos.json")
	combos, err := ParseCombosPage(combosData)
	if err != nil {
		t.Fatalf("parse combos: %v", err)
	}
	avgData := loadFixture(t, "atraxa_average.json")
	avg, err := ParseAverageDecksPage(avgData)
	if err != nil {
		t.Fatalf("parse average: %v", err)
	}

	sql := BuildCommanderSQL(pc, combos, avg)

	// All seven tables cleared
	for _, table := range []string{
		"DELETE FROM magic_edh_commanders WHERE",
		"DELETE FROM magic_edh_commanders_fts WHERE",
		"DELETE FROM magic_edh_recommendations WHERE",
		"DELETE FROM magic_edh_combos WHERE",
		"DELETE FROM magic_edh_combos_fts WHERE",
		"DELETE FROM magic_edh_average_decks WHERE",
		"DELETE FROM magic_edh_mana_curves WHERE",
	} {
		if !strings.Contains(sql, table) {
			t.Errorf("missing DELETE: %s", table)
		}
	}

	// Commander row with scryfall ID bound
	if !strings.Contains(sql, "'d0d33d52-3d28-4635-b985-51e126289259'") {
		t.Errorf("missing commander scryfall ID")
	}

	// Apostrophe escaped in commander name (SQL form: Praetors'' Voice)
	if !strings.Contains(sql, "Praetors'' Voice") {
		t.Errorf("apostrophe in commander name not escaped")
	}

	// At least one recommendation row
	if !strings.Contains(sql, "INSERT INTO magic_edh_recommendations") {
		t.Errorf("no recommendations insert")
	}

	// At least one combo row
	if !strings.Contains(sql, "INSERT INTO magic_edh_combos") {
		t.Errorf("no combos insert")
	}

	// FTS combo row
	if !strings.Contains(sql, "INSERT INTO magic_edh_combos_fts") {
		t.Errorf("no combos FTS insert")
	}

	// Average deck row
	if !strings.Contains(sql, "INSERT INTO magic_edh_average_decks") {
		t.Errorf("no average decks insert")
	}

	// Mana curve row
	if !strings.Contains(sql, "INSERT INTO magic_edh_mana_curves") {
		t.Errorf("no mana curves insert")
	}
}

func TestBuildCommanderSQL_EmptyRecs(t *testing.T) {
	// Edge case: commander with no combos, no average, no recs.
	pc := &ParsedCommander{
		ScryfallID: "test-id",
		Name:       "Test's Commander",
		Slug:       "tests-commander",
	}
	sql := BuildCommanderSQL(pc, nil, nil)

	// Still has the commander insert
	if !strings.Contains(sql, "INSERT INTO magic_edh_commanders ") {
		t.Errorf("missing commander insert")
	}
	if !strings.Contains(sql, "INSERT INTO magic_edh_commanders_fts ") {
		t.Errorf("missing commander_fts insert")
	}

	// No child-table inserts when data is empty
	if strings.Contains(sql, "INSERT INTO magic_edh_recommendations") {
		t.Errorf("should not have recs insert with empty data")
	}
	if strings.Contains(sql, "INSERT INTO magic_edh_combos ") {
		t.Errorf("should not have combos insert with empty data")
	}

	// Apostrophe in test name escaped
	if !strings.Contains(sql, "Test''s Commander") {
		t.Errorf("apostrophe not escaped in test commander name")
	}
}
