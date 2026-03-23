package data

import (
	"testing"
)

func TestDraftRatingsNotEmpty(t *testing.T) {
	if len(DraftRatings) == 0 {
		t.Fatal("DraftRatings map is empty — generated data missing")
	}
	t.Logf("DraftRatings: %d sets", len(DraftRatings))
}

func TestDraftRatingsHaveCards(t *testing.T) {
	for set, sr := range DraftRatings {
		if len(sr.Cards) == 0 {
			t.Errorf("set %q has no cards", set)
		}
		if sr.Format != "PremierDraft" {
			t.Errorf("set %q: expected format 'PremierDraft', got %q", set, sr.Format)
		}
		// Spot-check first card has valid stats.
		card := sr.Cards[0]
		if card.Name == "" {
			t.Errorf("set %q: first card has empty name", set)
		}
		if card.Overall.GamesPlayed == 0 {
			t.Errorf("set %q, card %q: zero games played", set, card.Name)
		}
		if card.Overall.GIHWR < 0 || card.Overall.GIHWR > 1 {
			t.Errorf("set %q, card %q: GIHWR out of range: %v", set, card.Name, card.Overall.GIHWR)
		}
	}
}

func TestDraftRatingsKnownSets(t *testing.T) {
	// These sets should all have data.
	expected := []string{"DSK", "BLB", "MOM", "DMU", "NEO"}
	for _, set := range expected {
		sr, ok := DraftRatings[set]
		if !ok {
			t.Errorf("expected set %q in DraftRatings", set)
			continue
		}
		if len(sr.Cards) < 100 {
			t.Errorf("set %q: expected at least 100 cards, got %d", set, len(sr.Cards))
		}
	}
}

func TestDraftRatingsColorBreakdowns(t *testing.T) {
	// At least some cards should have color pair breakdowns.
	setsWithColor := 0
	for set, sr := range DraftRatings {
		for _, card := range sr.Cards {
			if len(card.ByColor) > 0 {
				setsWithColor++
				for cp, stats := range card.ByColor {
					if stats.GamesPlayed == 0 {
						t.Errorf("set %q, card %q, color %q: zero games played in color breakdown", set, card.Name, cp)
					}
					if stats.GIHWR < 0 || stats.GIHWR > 1 {
						t.Errorf("set %q, card %q, color %q: GIHWR out of range: %v", set, card.Name, cp, stats.GIHWR)
					}
				}
				break
			}
		}
	}
	// Most sets should have color breakdowns; small/old sets may not meet the 100-game threshold.
	if setsWithColor < len(DraftRatings)-3 {
		t.Errorf("expected most sets to have color breakdowns, got %d/%d", setsWithColor, len(DraftRatings))
	}
}

func TestDraftRatingsALSA(t *testing.T) {
	// Verify ALSA (from draft data) is populated for at least some cards.
	for set, sr := range DraftRatings {
		hasALSA := false
		for _, card := range sr.Cards {
			if card.Overall.ALSA > 0 {
				hasALSA = true
				break
			}
		}
		if !hasALSA {
			t.Errorf("set %q: no cards have ALSA data (draft data may not have been processed)", set)
		}
		break // Just check one set.
	}
}

func TestDraftRatingsIWDConsistency(t *testing.T) {
	// IWD should be approximately GDWR - GNSWR.
	for _, sr := range DraftRatings {
		for _, card := range sr.Cards[:min(10, len(sr.Cards))] {
			expected := card.Overall.GDWR - card.Overall.GNSWR
			diff := card.Overall.IWD - expected
			if diff > 0.001 || diff < -0.001 {
				t.Errorf("card %q: IWD (%.4f) != GDWR (%.4f) - GNSWR (%.4f) = %.4f",
					card.Name, card.Overall.IWD, card.Overall.GDWR, card.Overall.GNSWR, expected)
			}
		}
		break
	}
}
