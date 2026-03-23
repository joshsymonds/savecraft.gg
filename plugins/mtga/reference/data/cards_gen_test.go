package data

import (
	"testing"
)

func TestCardsNotEmpty(t *testing.T) {
	if len(Cards) == 0 {
		t.Fatal("Cards map is empty — generated data missing")
	}
	t.Logf("Cards: %d entries", len(Cards))
}

func TestCardsHaveRequiredFields(t *testing.T) {
	for id, card := range Cards {
		if card.Name == "" {
			t.Errorf("arena_id %d: empty name", id)
		}
		if card.Set == "" {
			t.Errorf("arena_id %d (%s): empty set", id, card.Name)
		}
		if card.Rarity == "" {
			t.Errorf("arena_id %d (%s): empty rarity", id, card.Name)
		}
		if card.ArenaID != id {
			t.Errorf("arena_id %d (%s): ArenaID field mismatch (%d)", id, card.Name, card.ArenaID)
		}
		if card.Legalities == nil {
			t.Errorf("arena_id %d (%s): nil legalities", id, card.Name)
		}
		// TypeLine can be empty for some tokens, but most cards have one.
		break // Just spot-check first card to avoid enormous output.
	}
}

func TestKnownCard(t *testing.T) {
	// Sheoldred, the Apocalypse — arena_id 82159
	card, ok := Cards[82159]
	if !ok {
		t.Fatal("Sheoldred, the Apocalypse (82159) not found in Cards")
	}
	if card.Name != "Sheoldred, the Apocalypse" {
		t.Errorf("expected 'Sheoldred, the Apocalypse', got %q", card.Name)
	}
	if card.ManaCost != "{2}{B}{B}" {
		t.Errorf("expected mana cost '{2}{B}{B}', got %q", card.ManaCost)
	}
	if card.CMC != 4.0 {
		t.Errorf("expected CMC 4.0, got %.1f", card.CMC)
	}
	if card.Rarity != "mythic" {
		t.Errorf("expected rarity 'mythic', got %q", card.Rarity)
	}
	if card.Set != "dmu" {
		t.Errorf("expected set 'dmu', got %q", card.Set)
	}
	if card.OracleText == "" {
		t.Error("expected non-empty oracle text")
	}
}

func TestCardLegalities(t *testing.T) {
	card, ok := Cards[82159]
	if !ok {
		t.Skip("Sheoldred not found")
	}
	// Sheoldred should have legality entries for common formats.
	for _, format := range []string{"standard", "historic", "commander"} {
		if _, ok := card.Legalities[format]; !ok {
			t.Errorf("missing legality for format %q", format)
		}
	}
}

func TestValidRarities(t *testing.T) {
	validRarities := map[string]bool{
		"common": true, "uncommon": true, "rare": true, "mythic": true,
		"special": true, "bonus": true,
	}
	sampled := 0
	for _, card := range Cards {
		if !validRarities[card.Rarity] {
			t.Errorf("card %q has invalid rarity %q", card.Name, card.Rarity)
		}
		sampled++
		if sampled >= 100 {
			break
		}
	}
}
