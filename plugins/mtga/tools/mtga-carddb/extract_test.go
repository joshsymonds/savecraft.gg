package main

import (
	"os"
	"slices"
	"testing"
)

const testCardDBPath = "../../../../.reference/mtga-carddb/Raw_CardDatabase.mtga"

func skipIfNoCardDB(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(testCardDBPath); err != nil {
		t.Skipf("Raw_CardDatabase.mtga not available: %v", err)
	}
}

func findCard(cards []FullCard, arenaID int) *FullCard {
	for i := range cards {
		if cards[i].ArenaID == arenaID {
			return &cards[i]
		}
	}
	return nil
}

func findDefaultByName(cards []FullCard, name string) *FullCard {
	for i := range cards {
		if cards[i].FrontFaceName == name && cards[i].IsDefault {
			return &cards[i]
		}
	}
	return nil
}

func TestExtractFullCards_Kavaero(t *testing.T) {
	skipIfNoCardDB(t)

	cards, err := extractFullCards(testCardDBPath)
	if err != nil {
		t.Fatalf("extractFullCards: %v", err)
	}

	// Kavaero, Mind-Bitten — arena_id 97973, set om1
	c := findCard(cards, 97973)
	if c == nil {
		t.Fatal("Kavaero (97973) not found")
	}

	if c.Name != "Kavaero, Mind-Bitten" {
		t.Errorf("Name = %q, want %q", c.Name, "Kavaero, Mind-Bitten")
	}
	if c.ManaCost != "{2}{U}{B}" {
		t.Errorf("ManaCost = %q, want %q", c.ManaCost, "{2}{U}{B}")
	}
	if c.CMC != 4.0 {
		t.Errorf("CMC = %f, want 4.0", c.CMC)
	}
	if !slices.Equal(c.Colors, []string{"U", "B"}) {
		t.Errorf("Colors = %v, want [U B]", c.Colors)
	}
	if c.Rarity != "mythic" {
		t.Errorf("Rarity = %q, want %q", c.Rarity, "mythic")
	}
	if c.Set != "om1" {
		t.Errorf("Set = %q, want %q", c.Set, "om1")
	}
	if c.Power != "4" {
		t.Errorf("Power = %q, want %q", c.Power, "4")
	}
	if c.Toughness != "4" {
		t.Errorf("Toughness = %q, want %q", c.Toughness, "4")
	}
	// Type line should contain Creature and Spider, Human, Hero subtypes.
	if c.TypeLine == "" {
		t.Error("TypeLine is empty")
	}
	// Oracle text should be present (ability text assembled).
	if c.OracleText == "" {
		t.Error("OracleText is empty")
	}
	if !c.IsDefault {
		t.Error("IsDefault should be true (only printing)")
	}
}

func TestExtractFullCards_BreedingPool(t *testing.T) {
	skipIfNoCardDB(t)

	cards, err := extractFullCards(testCardDBPath)
	if err != nil {
		t.Fatalf("extractFullCards: %v", err)
	}

	// Breeding Pool — a land that produces U and G.
	c := findDefaultByName(cards, "Breeding Pool")
	if c == nil {
		t.Fatal("Breeding Pool (is_default) not found")
	}

	if c.ManaCost != "" {
		t.Errorf("ManaCost = %q, want empty (land)", c.ManaCost)
	}
	if c.CMC != 0 {
		t.Errorf("CMC = %f, want 0", c.CMC)
	}

	// Should produce U and G.
	wantMana := []string{"G", "U"}
	if !slices.Equal(c.ProducedMana, wantMana) {
		t.Errorf("ProducedMana = %v, want %v", c.ProducedMana, wantMana)
	}
}

func TestExtractFullCards_DFC(t *testing.T) {
	skipIfNoCardDB(t)

	cards, err := extractFullCards(testCardDBPath)
	if err != nil {
		t.Fatalf("extractFullCards: %v", err)
	}

	// Agadeem's Awakening (front, IsPrimaryCard=1) and Agadeem, the Undercrypt (back)
	// Front: arena_id 73284
	front := findCard(cards, 73284)
	if front == nil {
		t.Fatal("Agadeem's Awakening (73284) not found")
	}
	if front.FrontFaceName != "Agadeem's Awakening" {
		t.Errorf("FrontFaceName = %q, want %q", front.FrontFaceName, "Agadeem's Awakening")
	}
	if !front.IsPrimaryCard {
		t.Error("IsPrimaryCard should be true for front face")
	}

	// Back: arena_id 73285
	back := findCard(cards, 73285)
	if back == nil {
		t.Fatal("Agadeem, the Undercrypt (73285) not found")
	}
	if back.IsPrimaryCard {
		t.Error("IsPrimaryCard should be false for back face")
	}
}

func TestExtractFullCards_CountIsReasonable(t *testing.T) {
	skipIfNoCardDB(t)

	cards, err := extractFullCards(testCardDBPath)
	if err != nil {
		t.Fatalf("extractFullCards: %v", err)
	}

	// The MTGA client has ~18000+ non-token cards.
	if len(cards) < 15000 {
		t.Errorf("Expected at least 15000 cards, got %d", len(cards))
	}
}
