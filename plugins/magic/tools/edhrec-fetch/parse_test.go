package main

import (
	"os"
	"path/filepath"
	"testing"
)

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return data
}

func TestParseCommanderPage(t *testing.T) {
	data := loadFixture(t, "atraxa_commander.json")
	pc, err := ParseCommanderPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if pc.Name != "Atraxa, Praetors' Voice" {
		t.Errorf("Name = %q", pc.Name)
	}
	if pc.Slug != "atraxa-praetors-voice" {
		t.Errorf("Slug = %q", pc.Slug)
	}
	if pc.ScryfallID != "d0d33d52-3d28-4635-b985-51e126289259" {
		t.Errorf("ScryfallID = %q", pc.ScryfallID)
	}
	if len(pc.ColorIdentity) != 4 {
		t.Errorf("ColorIdentity = %v, want 4 colors", pc.ColorIdentity)
	}
	if pc.DeckCount == 0 {
		t.Errorf("DeckCount should be non-zero")
	}
	if pc.Rank == 0 {
		t.Errorf("Rank should be set")
	}

	// Themes — Atraxa has 182 tag links
	if len(pc.Themes) < 100 {
		t.Errorf("Themes = %d, want >=100", len(pc.Themes))
	}
	foundInfect := false
	for _, th := range pc.Themes {
		if th.Slug == "infect" {
			foundInfect = true
			if th.Count == 0 {
				t.Errorf("infect theme count should be non-zero")
			}
		}
	}
	if !foundInfect {
		t.Errorf("expected infect theme")
	}

	// Similar commanders
	if len(pc.Similar) == 0 {
		t.Errorf("Similar should be non-empty")
	}

	// Mana curve
	if len(pc.Curve) == 0 {
		t.Errorf("Curve should be non-empty")
	}

	// Recommendations — should have entries across multiple categories
	if len(pc.Recs) < 50 {
		t.Errorf("Recs = %d, want >=50", len(pc.Recs))
	}
	categorySet := make(map[string]bool)
	for _, r := range pc.Recs {
		categorySet[r.Category] = true
	}
	for _, want := range []string{"highsynergycards", "topcards", "creatures", "lands"} {
		if !categorySet[want] {
			t.Errorf("missing category %q", want)
		}
	}

	// Spot-check: no categories we explicitly drop (like "piechart" or similar UI things)
	for _, r := range pc.Recs {
		if !keptCategories[r.Category] {
			t.Errorf("unexpected category %q leaked through", r.Category)
		}
	}
}

func TestParseCombosPage(t *testing.T) {
	data := loadFixture(t, "atraxa_combos.json")
	combos, err := ParseCombosPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(combos) == 0 {
		t.Fatalf("no combos parsed")
	}
	if len(combos) < 50 {
		t.Errorf("combos = %d, want >=50", len(combos))
	}

	c := combos[0]
	if c.ComboID == "" {
		t.Errorf("ComboID empty")
	}
	if len(c.CardNames) == 0 {
		t.Errorf("CardNames empty")
	}
	if len(c.CardIDs) == 0 {
		t.Errorf("CardIDs empty")
	}
	if c.Colors == "" {
		t.Errorf("Colors empty")
	}
	if c.DeckCount == 0 {
		t.Errorf("DeckCount should be non-zero")
	}
}

func TestParseAverageDecksPage(t *testing.T) {
	data := loadFixture(t, "atraxa_average.json")
	entries, err := ParseAverageDecksPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(entries) < 80 {
		t.Errorf("entries = %d, want >=80 (typical Commander deck ~91)", len(entries))
	}

	// First entry should be Atraxa herself
	if entries[0].CardName != "Atraxa, Praetors' Voice" {
		t.Errorf("first entry = %q", entries[0].CardName)
	}
	if entries[0].Quantity != 1 {
		t.Errorf("first entry quantity = %d", entries[0].Quantity)
	}

	// Some basics should have Quantity > 1
	foundMulti := false
	for _, e := range entries {
		if e.Quantity > 1 {
			foundMulti = true
			break
		}
	}
	if !foundMulti {
		t.Errorf("expected at least one multi-copy entry (basics)")
	}

	// Categories should be populated for at least most entries
	withCat := 0
	for _, e := range entries {
		if e.Category != "" {
			withCat++
		}
	}
	if withCat < len(entries)/2 {
		t.Errorf("only %d/%d entries have categories", withCat, len(entries))
	}
}

func TestParseCardPage_RealSolRing(t *testing.T) {
	data := loadFixture(t, "sol_ring_card.json")
	cp, err := ParseCardPage("Sol Ring", data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cp.CardName != "Sol Ring" {
		t.Errorf("CardName = %q, want %q", cp.CardName, "Sol Ring")
	}
	// Sol Ring should have all four primary vendor prices populated.
	if cp.TCGPlayerPrice == nil || *cp.TCGPlayerPrice <= 0 {
		t.Errorf("TCGPlayerPrice = %v, want positive", cp.TCGPlayerPrice)
	}
	// Sol Ring TCGPlayer mid is typically $1-3.
	if cp.TCGPlayerPrice != nil && (*cp.TCGPlayerPrice < 0.50 || *cp.TCGPlayerPrice > 10.0) {
		t.Errorf("TCGPlayerPrice = %v, want in range [0.5, 10] for Sol Ring", *cp.TCGPlayerPrice)
	}
	if cp.CardKingdomPrice == nil {
		t.Errorf("CardKingdomPrice should be present")
	}
	if cp.SCGPrice == nil {
		t.Errorf("SCGPrice should be present")
	}
	if cp.MTGStocksPrice == nil {
		t.Errorf("MTGStocksPrice should be present")
	}
}

func TestParseCardPage_TCGPlayerSubTypeFoil(t *testing.T) {
	// When TCGPlayer's subType is "Foil", we must NOT use that price — only
	// "Normal" qualifies for tcgplayer_price (foils are a different market).
	raw := []byte(`{"container":{"json_dict":{"card":{"prices":{
		"tcgplayer": {"price": 50.0, "subType": "Foil"},
		"cardkingdom": {"price": 1.99}
	}}}}}`)
	cp, err := ParseCardPage("Test Card", raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cp.TCGPlayerPrice != nil {
		t.Errorf("TCGPlayerPrice = %v, want nil for Foil subType", *cp.TCGPlayerPrice)
	}
	if cp.CardKingdomPrice == nil || *cp.CardKingdomPrice != 1.99 {
		t.Errorf("CardKingdomPrice = %v, want 1.99", cp.CardKingdomPrice)
	}
}

func TestParseCardPage_MissingVendors(t *testing.T) {
	// Some cards may have only a subset of vendor prices — missing vendors
	// should produce nil pointers, not crash.
	raw := []byte(`{"container":{"json_dict":{"card":{"prices":{
		"tcgplayer": {"price": 5.00, "subType": "Normal"}
	}}}}}`)
	cp, err := ParseCardPage("Sparse Card", raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cp.TCGPlayerPrice == nil || *cp.TCGPlayerPrice != 5.00 {
		t.Errorf("TCGPlayerPrice = %v, want 5.00", cp.TCGPlayerPrice)
	}
	if cp.CardKingdomPrice != nil {
		t.Errorf("CardKingdomPrice should be nil")
	}
	if cp.SCGPrice != nil {
		t.Errorf("SCGPrice should be nil")
	}
	if cp.MTGStocksPrice != nil {
		t.Errorf("MTGStocksPrice should be nil")
	}
}

func TestParseCardPage_NullPriceTolerated(t *testing.T) {
	// A vendor block with explicitly null price must not crash and must produce nil.
	raw := []byte(`{"container":{"json_dict":{"card":{"prices":{
		"tcgplayer": {"price": null, "subType": "Normal"},
		"cardkingdom": {"price": 2.50}
	}}}}}`)
	cp, err := ParseCardPage("Null Price Card", raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cp.TCGPlayerPrice != nil {
		t.Errorf("TCGPlayerPrice should be nil for null price, got %v", *cp.TCGPlayerPrice)
	}
	if cp.CardKingdomPrice == nil || *cp.CardKingdomPrice != 2.50 {
		t.Errorf("CardKingdomPrice = %v, want 2.50", cp.CardKingdomPrice)
	}
}

func TestParseCardPage_EmptyPrices(t *testing.T) {
	// Card page with no prices object — all vendor fields nil, no error.
	raw := []byte(`{"container":{"json_dict":{"card":{}}}}`)
	cp, err := ParseCardPage("Unpriced Card", raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cp.TCGPlayerPrice != nil || cp.CardKingdomPrice != nil ||
		cp.SCGPrice != nil || cp.MTGStocksPrice != nil {
		t.Errorf("all vendor prices should be nil for empty prices block")
	}
}

func TestParseTierPage_AtraxaBudget(t *testing.T) {
	data := loadFixture(t, "atraxa_budget.json")
	meta, decks, err := ParseTierPage(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if meta == nil {
		t.Fatal("expected non-nil tier metadata")
	}
	// Tolerate small movement since EDHREC numbers update over time.
	if meta.AvgPrice < 100 || meta.AvgPrice > 300 {
		t.Errorf("AvgPrice = %v, want roughly 174", meta.AvgPrice)
	}
	if meta.NumDecksAvg < 1000 {
		t.Errorf("NumDecksAvg = %d, want > 1000 for a popular budget tier", meta.NumDecksAvg)
	}
	if len(decks) < 50 {
		t.Errorf("decks length = %d, want at least 50 cards in a budget Atraxa list", len(decks))
	}
	// Categories should be populated for most entries (consistent with
	// ParseAverageDecksPage behavior).
	withCat := 0
	for _, e := range decks {
		if e.Category != "" {
			withCat++
		}
	}
	if withCat < len(decks)/2 {
		t.Errorf("only %d/%d entries have categories", withCat, len(decks))
	}
}

func TestParseTierPage_EmptyResponse(t *testing.T) {
	// Some commanders may not have all four tiers populated. The parser must
	// not crash on minimal/empty JSON; metadata should be zero-valued.
	raw := []byte(`{}`)
	meta, decks, err := ParseTierPage(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if meta == nil {
		t.Fatal("expected non-nil tier metadata even for empty response")
	}
	if meta.AvgPrice != 0 || meta.NumDecksAvg != 0 {
		t.Errorf("expected zero-valued metadata, got %+v", meta)
	}
	if len(decks) != 0 {
		t.Errorf("expected no decks, got %d", len(decks))
	}
}

func TestParsePreconPage_BreedLethality(t *testing.T) {
	data := loadFixture(t, "breed_lethality.json")
	pp, err := ParsePreconPage("breed-lethality", data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if pp.Slug != "breed-lethality" {
		t.Errorf("Slug = %q", pp.Slug)
	}
	// Decklist should contain both lands and non-lands. The commander itself
	// is excluded from the deck (it lives on its own).
	if len(pp.Deck) < 80 {
		t.Errorf("Deck length = %d, want at least 80 cards", len(pp.Deck))
	}
	// Atraxa is the face commander (highest count).
	if len(pp.Commanders) == 0 {
		t.Fatal("expected at least one commander reference")
	}
	face := pp.Commanders[0]
	if face.CommanderName != "Atraxa, Praetors' Voice" {
		t.Errorf("face commander = %q, want Atraxa", face.CommanderName)
	}
	if !face.IsFace {
		t.Errorf("first commander should be marked IsFace")
	}
	if face.DeckCount < 100 {
		t.Errorf("face deck count = %d, want > 100", face.DeckCount)
	}
	// Upgrade pool: cardstoadd entries.
	addCount := 0
	cutCount := 0
	for _, u := range pp.Upgrades {
		switch u.Action {
		case "add", "land_add":
			addCount++
		case "cut", "land_cut":
			cutCount++
		}
	}
	if addCount < 30 {
		t.Errorf("expected at least 30 'add' upgrades, got %d", addCount)
	}
	if cutCount < 20 {
		t.Errorf("expected at least 20 'cut' upgrades, got %d", cutCount)
	}
	// Specific entry (Inexorable Tide is in the cardstoadd list).
	foundInexorable := false
	for _, u := range pp.Upgrades {
		if u.CardName == "Inexorable Tide" && u.Action == "add" {
			foundInexorable = true
			break
		}
	}
	if !foundInexorable {
		t.Errorf("expected Inexorable Tide in add upgrades")
	}
}

func TestParsePreconPage_DeckCardsShape(t *testing.T) {
	// The peculiar [name, quantity] tuple shape per type. Parser must handle:
	//   "cards": {"Land": [["Forest", 7], ["Island", 4]], "Creature": [["Atraxa", 1]]}
	raw := []byte(`{
		"deck": {
			"commander": ["Atraxa, Praetors' Voice"],
			"cards": {
				"Land":     [["Forest", 7], ["Island", 4]],
				"Creature": [["Birds of Paradise", 1]]
			}
		},
		"precon_commander_counts": [],
		"container": {"json_dict": {"cardlists": []}}
	}`)
	pp, err := ParsePreconPage("test-slug", raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(pp.Deck) != 3 {
		t.Errorf("Deck length = %d, want 3 (Forest, Island, Birds)", len(pp.Deck))
	}
	byName := map[string]AverageDeckEntry{}
	for _, e := range pp.Deck {
		byName[e.CardName] = e
	}
	if byName["Forest"].Quantity != 7 {
		t.Errorf("Forest quantity = %d, want 7", byName["Forest"].Quantity)
	}
	if byName["Forest"].Category != "Land" {
		t.Errorf("Forest category = %q, want Land", byName["Forest"].Category)
	}
	if byName["Birds of Paradise"].Quantity != 1 {
		t.Errorf("Birds quantity = %d, want 1", byName["Birds of Paradise"].Quantity)
	}
}

func TestDiscoverPreconSlugs(t *testing.T) {
	data := loadFixture(t, "atraxa_commander.json")
	slugs := discoverPreconSlugs(data)
	// Atraxa's commander page links to /precon/breed-lethality.
	if len(slugs) == 0 {
		t.Fatal("expected at least one precon slug from Atraxa's links")
	}
	found := false
	for _, s := range slugs {
		if s == "breed-lethality" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected breed-lethality in slugs, got %v", slugs)
	}
}
