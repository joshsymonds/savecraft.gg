package main

import (
	"strings"
	"testing"
)

func TestBuildDraftRatingsImportSQL(t *testing.T) {
	sets := []setResult{
		{
			Set:        "DSK",
			TotalGames: 250000,
			CardCount:  2,
			AvgGIHWR:   0.515,
			Cards: []cardResult{
				{
					Name: "Gloomlake Verge",
					Overall: setCardStats{
						GamesInHand: 15000, GamesPlayed: 20000, GamesNotSeen: 5000,
						GIHWR: 0.564, OHWR: 0.62, GDWR: 0.54, GNSWR: 0.48, IWD: 0.06,
						ALSA: 8.5, ATA: 9.2,
					},
					ByColor: map[string]setCardStats{
						"UB": {
							GamesInHand: 3000, GamesPlayed: 4000, GamesNotSeen: 1000,
							GIHWR: 0.59, OHWR: 0.63, GDWR: 0.56, GNSWR: 0.49, IWD: 0.07,
							ALSA: 7.2, ATA: 8.0,
						},
					},
				},
				{
					Name: "Lightning Bolt",
					Overall: setCardStats{
						GamesInHand: 10000, GamesPlayed: 12000, GamesNotSeen: 2000,
						GIHWR: 0.58, OHWR: 0.60, GDWR: 0.55, GNSWR: 0.50, IWD: 0.05,
						ALSA: 3.0, ATA: 2.5,
					},
				},
			},
		},
	}

	sql := buildDraftRatingsImportSQL(sets)

	// Should start with DELETE statements
	if !strings.HasPrefix(sql, "DELETE FROM mtga_draft_ratings_fts;") {
		t.Error("SQL should start with DELETE FROM mtga_draft_ratings_fts")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_color_stats;") {
		t.Error("SQL should contain DELETE FROM mtga_draft_color_stats")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_ratings;") {
		t.Error("SQL should contain DELETE FROM mtga_draft_ratings")
	}
	if !strings.Contains(sql, "DELETE FROM mtga_draft_set_stats;") {
		t.Error("SQL should contain DELETE FROM mtga_draft_set_stats")
	}

	// Should contain INSERT into set stats
	if !strings.Contains(sql, "INSERT INTO mtga_draft_set_stats") {
		t.Error("SQL should contain INSERT INTO mtga_draft_set_stats")
	}
	if !strings.Contains(sql, "'DSK'") {
		t.Error("SQL should contain set code DSK")
	}

	// Should contain INSERT into overall ratings for both cards
	if !strings.Contains(sql, "Gloomlake Verge") {
		t.Error("SQL should contain card name Gloomlake Verge")
	}
	if !strings.Contains(sql, "Lightning Bolt") {
		t.Error("SQL should contain card name Lightning Bolt")
	}

	// Should contain INSERT into color stats for UB
	if !strings.Contains(sql, "INSERT INTO mtga_draft_color_stats") {
		t.Error("SQL should contain INSERT INTO mtga_draft_color_stats")
	}
	if !strings.Contains(sql, "'UB'") {
		t.Error("SQL should contain color pair UB")
	}

	// Should contain INSERT into FTS5 for both cards
	if !strings.Contains(sql, "INSERT INTO mtga_draft_ratings_fts") {
		t.Error("SQL should contain INSERT INTO mtga_draft_ratings_fts")
	}

	// Count overall rating INSERTs: 2 cards
	overallCount := strings.Count(sql, "INSERT INTO mtga_draft_ratings (")
	if overallCount != 2 {
		t.Errorf("expected 2 overall rating INSERTs, got %d", overallCount)
	}

	// Count color stat INSERTs: 1 (only Gloomlake has UB)
	colorCount := strings.Count(sql, "INSERT INTO mtga_draft_color_stats")
	if colorCount != 1 {
		t.Errorf("expected 1 color stat INSERT, got %d", colorCount)
	}

	// Count FTS5 INSERTs: 2 (one per card)
	ftsCount := strings.Count(sql, "INSERT INTO mtga_draft_ratings_fts")
	if ftsCount != 2 {
		t.Errorf("expected 2 FTS5 INSERTs, got %d", ftsCount)
	}
}

func TestBuildDraftRatingsImportSQL_EscapesSingleQuotes(t *testing.T) {
	sets := []setResult{
		{
			Set: "LTR",
			Cards: []cardResult{
				{
					Name:    "Frodo's Ring",
					Overall: setCardStats{GamesInHand: 100, GamesPlayed: 200},
				},
			},
		},
	}

	sql := buildDraftRatingsImportSQL(sets)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes in card names")
	}
}

func TestBuildDraftRatingsImportSQL_EmptySets(t *testing.T) {
	sql := buildDraftRatingsImportSQL(nil)

	// Should still have DELETE statements
	if !strings.Contains(sql, "DELETE FROM mtga_draft_ratings_fts;") {
		t.Error("SQL should contain DELETE even with no sets")
	}

	// Should NOT contain any INSERT statements
	if strings.Contains(sql, "INSERT") {
		t.Error("SQL should not contain INSERT with empty sets")
	}
}

func TestBuildDraftRatingsImportSQL_MultipleSets(t *testing.T) {
	sets := []setResult{
		{
			Set:       "DSK",
			AvgGIHWR:  0.51,
			CardCount: 1,
			Cards:     []cardResult{{Name: "Card A", Overall: setCardStats{GIHWR: 0.51}}},
		},
		{
			Set:       "BLB",
			AvgGIHWR:  0.52,
			CardCount: 1,
			Cards:     []cardResult{{Name: "Card B", Overall: setCardStats{GIHWR: 0.52}}},
		},
	}

	sql := buildDraftRatingsImportSQL(sets)

	// Should have 2 set stats INSERTs
	setStatsCount := strings.Count(sql, "INSERT INTO mtga_draft_set_stats")
	if setStatsCount != 2 {
		t.Errorf("expected 2 set stats INSERTs, got %d", setStatsCount)
	}
}
