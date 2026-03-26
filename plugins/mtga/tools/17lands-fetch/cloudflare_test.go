package main

import (
	"strings"
	"testing"
)

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
