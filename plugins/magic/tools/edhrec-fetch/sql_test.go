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

	sql := BuildCommanderSQL(pc, combos, avg, nil)

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
	sql := BuildCommanderSQL(pc, nil, nil, nil)

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

func TestBuildCommanderSQL_TierData(t *testing.T) {
	pc := &ParsedCommander{
		ScryfallID: "atraxa-id",
		Name:       "Atraxa",
		Slug:       "atraxa-praetors-voice",
	}
	tiers := map[string]*TierBundle{
		"budget": {
			Meta: &TierMeta{AvgPrice: 174, NumDecksAvg: 4072, DeckSize: 84},
			Decks: []AverageDeckEntry{
				{CardName: "Sol Ring", Quantity: 1, Category: "artifacts"},
				{CardName: "Forest", Quantity: 8, Category: "basics"},
			},
		},
		"cedh": {
			Meta:  &TierMeta{AvgPrice: 5688, NumDecksAvg: 147, DeckSize: 94},
			Decks: []AverageDeckEntry{{CardName: "Mana Crypt", Quantity: 1, Category: "manaartifacts"}},
		},
	}
	sql := BuildCommanderSQL(pc, nil, nil, tiers)

	// Tier-meta inserts
	if !strings.Contains(sql, "INSERT INTO magic_edh_commander_tiers") {
		t.Errorf("expected INSERT INTO magic_edh_commander_tiers")
	}
	if !strings.Contains(sql, "'budget'") || !strings.Contains(sql, "'cedh'") {
		t.Errorf("expected both tier names in SQL: %s", sql)
	}
	if !strings.Contains(sql, "174") || !strings.Contains(sql, "5688") {
		t.Errorf("expected tier avg prices in SQL")
	}

	// Tier deck inserts
	if !strings.Contains(sql, "INSERT INTO magic_edh_average_decks_by_tier") {
		t.Errorf("expected INSERT INTO magic_edh_average_decks_by_tier")
	}
	if !strings.Contains(sql, "Mana Crypt") {
		t.Errorf("expected cedh card in SQL")
	}
}

func TestBuildCommanderSQL_NoTierData(t *testing.T) {
	pc := &ParsedCommander{
		ScryfallID: "atraxa-id",
		Name:       "Atraxa",
		Slug:       "atraxa-praetors-voice",
	}
	sql := BuildCommanderSQL(pc, nil, nil, nil)

	// Without tier data, no tier-related INSERTs.
	if strings.Contains(sql, "INSERT INTO magic_edh_commander_tiers") {
		t.Errorf("should not have tier metadata INSERT with nil tiers")
	}
	if strings.Contains(sql, "INSERT INTO magic_edh_average_decks_by_tier") {
		t.Errorf("should not have tier-deck INSERT with nil tiers")
	}
	// The DELETE for the tier tables should still run (idempotent re-run safety).
	if !strings.Contains(sql, "DELETE FROM magic_edh_commander_tiers") {
		t.Errorf("expected DELETE for tier metadata to clear stale rows")
	}
	if !strings.Contains(sql, "DELETE FROM magic_edh_average_decks_by_tier") {
		t.Errorf("expected DELETE for tier decks to clear stale rows")
	}
}

func TestBuildCommanderSQL_TierZeroDeckSize(t *testing.T) {
	// Some tiers may legitimately have 0 num_decks_avg (rare commanders).
	// We should still write the metadata row so downstream code can detect
	// "tier exists but has insufficient sample size".
	pc := &ParsedCommander{
		ScryfallID: "rare-id",
		Name:       "Rare Commander",
		Slug:       "rare-commander",
	}
	tiers := map[string]*TierBundle{
		"cedh": {
			Meta:  &TierMeta{AvgPrice: 0, NumDecksAvg: 0, DeckSize: 0},
			Decks: nil,
		},
	}
	sql := BuildCommanderSQL(pc, nil, nil, tiers)
	if !strings.Contains(sql, "INSERT INTO magic_edh_commander_tiers") {
		t.Errorf("expected tier metadata INSERT even when zero-valued")
	}
}

func TestBuildGameChangersSQL_Cards(t *testing.T) {
	cards := []string{"Mana Crypt", "Demonic Tutor", "Praetor's Counsel"}
	sql := BuildGameChangersSQL(cards)

	// Wipe-and-replace
	if !strings.Contains(sql, "DELETE FROM magic_game_changers") {
		t.Errorf("expected DELETE")
	}
	if !strings.Contains(sql, "INSERT INTO magic_game_changers") {
		t.Errorf("expected INSERT")
	}
	if !strings.Contains(sql, "Mana Crypt") {
		t.Errorf("expected Mana Crypt in SQL")
	}
	if !strings.Contains(sql, "Demonic Tutor") {
		t.Errorf("expected Demonic Tutor in SQL")
	}
	// Apostrophe escape
	if !strings.Contains(sql, "Praetor''s Counsel") {
		t.Errorf("expected escaped apostrophe")
	}
	// 3 INSERT rows
	if got := strings.Count(sql, "INSERT INTO magic_game_changers"); got != 3 {
		t.Errorf("expected 3 INSERTs, got %d", got)
	}
}

func TestBuildGameChangersSQL_Empty(t *testing.T) {
	sql := BuildGameChangersSQL(nil)
	if !strings.Contains(sql, "DELETE FROM magic_game_changers") {
		t.Errorf("expected DELETE for wipe even with empty input")
	}
	if strings.Contains(sql, "INSERT INTO magic_game_changers") {
		t.Errorf("should not contain INSERT with empty input")
	}
}

func TestBuildPreconSQL_HappyPath(t *testing.T) {
	precon := &ParsedPrecon{
		Slug:    "breed-lethality",
		Name:    "Breed Lethality",
		MSRPUSD: 30,
		SetCode: "C16",
		Year:    2016,
		Deck: []AverageDeckEntry{
			{CardName: "Sol Ring", Quantity: 1, Category: "Artifact"},
			{CardName: "Forest", Quantity: 7, Category: "Land"},
		},
		Upgrades: []PreconUpgrade{
			{CardName: "Inexorable Tide", Action: "add", Category: "cardstoadd", Inclusion: 93},
			{CardName: "Frumious Bandersnatch", Action: "cut", Category: "cardstocut"},
		},
		Commanders: []PreconCommanderRef{
			{CommanderName: "Atraxa, Praetors' Voice", DeckCount: 269, IsFace: true},
		},
	}
	sql := BuildPreconSQL([]*ParsedPrecon{precon})

	for _, table := range []string{
		"DELETE FROM magic_edh_precons",
		"DELETE FROM magic_edh_precon_decks",
		"DELETE FROM magic_edh_precon_upgrades",
		"DELETE FROM magic_edh_precon_commanders",
	} {
		if !strings.Contains(sql, table) {
			t.Errorf("missing DELETE: %s", table)
		}
	}
	for _, ins := range []string{
		"INSERT INTO magic_edh_precons",
		"INSERT INTO magic_edh_precon_decks",
		"INSERT INTO magic_edh_precon_upgrades",
		"INSERT INTO magic_edh_precon_commanders",
	} {
		if !strings.Contains(sql, ins) {
			t.Errorf("missing INSERT: %s", ins)
		}
	}
	if !strings.Contains(sql, "Praetors'' Voice") {
		t.Errorf("apostrophe must be SQL-escaped")
	}
	if !strings.Contains(sql, "Inexorable Tide") {
		t.Errorf("upgrade card name missing")
	}
	if !strings.Contains(sql, "Sol Ring") {
		t.Errorf("deck card missing")
	}
}

func TestBuildPreconSQL_Empty(t *testing.T) {
	sql := BuildPreconSQL(nil)
	// Wipe-only when no precons.
	if !strings.Contains(sql, "DELETE FROM magic_edh_precons") {
		t.Errorf("expected DELETE for wipe even with empty input")
	}
	if strings.Contains(sql, "INSERT INTO magic_edh_precons") {
		t.Errorf("should not INSERT with empty input")
	}
}

func TestGameChangersDiff(t *testing.T) {
	wotc := []string{"Mana Crypt", "Demonic Tutor", "Mystical Tutor"}
	derived := map[string]int{
		"Mana Crypt":           10,
		"Demonic Tutor":        8,
		"Imperial Seal":        3, // EDHREC has it; not in WotC list (drift signal)
		"Some Random New Card": 1, // EDHREC tagged once; possibly a tagging error
	}

	missing, extra := gameChangersDiff(wotc, derived)

	// Missing: WotC has it but EDHREC didn't index any commander with it.
	// "Mystical Tutor" is in WotC but not EDHREC's data.
	wantMissing := map[string]bool{"Mystical Tutor": true}
	if len(missing) != len(wantMissing) {
		t.Errorf("missing length = %d, want %d (entries: %v)", len(missing), len(wantMissing), missing)
	}
	for _, m := range missing {
		if !wantMissing[m] {
			t.Errorf("unexpected missing entry: %q", m)
		}
	}

	// Extra: EDHREC has it but WotC doesn't.
	wantExtra := map[string]bool{"Imperial Seal": true, "Some Random New Card": true}
	if len(extra) != len(wantExtra) {
		t.Errorf("extra length = %d, want %d (entries: %v)", len(extra), len(wantExtra), extra)
	}
	for _, e := range extra {
		if !wantExtra[e] {
			t.Errorf("unexpected extra entry: %q", e)
		}
	}
}
