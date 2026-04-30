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

func TestBuildCardPricesSQL_AllVendors(t *testing.T) {
	tcg := 1.29
	ck := 1.99
	scg := 1.49
	mtgs := 1.19
	prices := []*CardPrice{
		{
			CardName:         "Sol Ring",
			TCGPlayerPrice:   &tcg,
			CardKingdomPrice: &ck,
			SCGPrice:         &scg,
			MTGStocksPrice:   &mtgs,
		},
	}
	sql := BuildCardPricesSQL(prices)
	if !strings.Contains(sql, "DELETE FROM magic_edh_card_prices") {
		t.Errorf("expected DELETE for wipe-and-replace")
	}
	if !strings.Contains(sql, "INSERT INTO magic_edh_card_prices") {
		t.Errorf("expected INSERT")
	}
	if !strings.Contains(sql, "Sol Ring") {
		t.Errorf("expected card name in SQL")
	}
	if !strings.Contains(sql, "1.29") {
		t.Errorf("expected TCGPlayer price 1.29")
	}
	if !strings.Contains(sql, "1.99") {
		t.Errorf("expected Card Kingdom price 1.99")
	}
}

func TestBuildCardPricesSQL_NilPricesAsNULL(t *testing.T) {
	tcg := 5.00
	prices := []*CardPrice{
		{
			CardName:       "Sparse",
			TCGPlayerPrice: &tcg,
		},
	}
	sql := BuildCardPricesSQL(prices)
	if !strings.Contains(sql, "5") {
		t.Errorf("expected TCGPlayer price 5")
	}
	if !strings.Contains(sql, "NULL") {
		t.Errorf("expected NULL for missing vendor prices")
	}
}

func TestBuildCardPricesSQL_EscapesApostrophes(t *testing.T) {
	tcg := 0.50
	prices := []*CardPrice{
		{CardName: "Praetor's Counsel", TCGPlayerPrice: &tcg},
	}
	sql := BuildCardPricesSQL(prices)
	if !strings.Contains(sql, "Praetor''s Counsel") {
		t.Errorf("apostrophe must be SQL-escaped, got SQL: %s", sql)
	}
}

func TestBuildCardPricesSQL_Empty(t *testing.T) {
	sql := BuildCardPricesSQL(nil)
	if !strings.Contains(sql, "DELETE FROM magic_edh_card_prices") {
		t.Errorf("expected DELETE even with empty input")
	}
	if strings.Contains(sql, "INSERT INTO magic_edh_card_prices") {
		t.Errorf("should not contain INSERT when no prices")
	}
}
