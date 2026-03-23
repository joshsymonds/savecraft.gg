package draftratings

import (
	"strings"
	"testing"
)

var testRatings = map[string]SetRatings{
	"TST": {
		Set:      "TST",
		Format:   "PremierDraft",
		SetStats: SetStats{TotalGames: 40000, CardCount: 3, AvgGIHWR: 0.5233},
		Cards: []CardRating{
			{
				Name: "Good Card",
				Overall: DraftStats{
					GamesInHand: 10000, GamesPlayed: 15000, GamesNotSeen: 5000,
					GIHWR: 0.60, OHWR: 0.58, GDWR: 0.62, GNSWR: 0.50,
					IWD: 0.12, ALSA: 2.5, ATA: 1.8,
				},
				ByColor: map[string]DraftStats{
					"UB": {
						GamesInHand: 3000, GamesPlayed: 4500, GamesNotSeen: 1500,
						GIHWR: 0.65, OHWR: 0.63, GDWR: 0.67, GNSWR: 0.52,
						IWD: 0.15, ALSA: 2.0, ATA: 1.5,
					},
					"WR": {
						GamesInHand: 2000, GamesPlayed: 3000, GamesNotSeen: 1000,
						GIHWR: 0.55, OHWR: 0.53, GDWR: 0.57, GNSWR: 0.48,
						IWD: 0.09, ALSA: 3.0, ATA: 2.5,
					},
				},
			},
			{
				Name: "Bad Card",
				Overall: DraftStats{
					GamesInHand: 8000, GamesPlayed: 12000, GamesNotSeen: 4000,
					GIHWR: 0.45, OHWR: 0.43, GDWR: 0.47, GNSWR: 0.52,
					IWD: -0.05, ALSA: 8.5, ATA: 7.0,
				},
				ByColor: map[string]DraftStats{
					"UB": {
						GamesInHand: 2500, GamesPlayed: 4000, GamesNotSeen: 1500,
						GIHWR: 0.48, OHWR: 0.46, GDWR: 0.50, GNSWR: 0.53,
						IWD: -0.03, ALSA: 7.5, ATA: 6.0,
					},
				},
			},
			{
				Name: "Average Card",
				Overall: DraftStats{
					GamesInHand: 9000, GamesPlayed: 13000, GamesNotSeen: 4000,
					GIHWR: 0.52, OHWR: 0.50, GDWR: 0.54, GNSWR: 0.51,
					IWD: 0.03, ALSA: 5.0, ATA: 4.0,
				},
			},
		},
	},
}

func TestCompareCards(t *testing.T) {
	result := Search(testRatings, Query{
		Set:   "TST",
		Cards: []string{"Good Card", "Bad Card"},
	})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Good Card") {
		t.Error("expected 'Good Card' in formatted output")
	}
	if !strings.Contains(result.Formatted, "Bad Card") {
		t.Error("expected 'Bad Card' in formatted output")
	}
	if !strings.Contains(result.Formatted, "60.0%") {
		t.Error("expected Good Card GIH WR '60.0%' in formatted output")
	}
	if !strings.Contains(result.Formatted, "set avg GIH WR: 52.3%") {
		t.Error("expected set average in formatted output")
	}
}

func TestCompareWithColors(t *testing.T) {
	result := Search(testRatings, Query{
		Set:    "TST",
		Cards:  []string{"Good Card", "Bad Card"},
		Colors: "UB",
	})
	if result == nil {
		t.Fatal("expected result")
	}
	// Should show UB-specific stats: Good Card 65.0%, not overall 60.0%.
	if !strings.Contains(result.Formatted, "65.0%") {
		t.Error("expected UB-specific GIH WR '65.0%' in formatted output")
	}
	if !strings.Contains(result.Formatted, "UB context") {
		t.Error("expected 'UB context' in header")
	}
}

func TestCardDetail(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Card: "Good Card"})
	if result == nil {
		t.Fatal("expected result")
	}
	// Should include overall stats and color breakdowns.
	if !strings.Contains(result.Formatted, "Good Card — TST") {
		t.Error("expected card name in header")
	}
	if !strings.Contains(result.Formatted, "Overall:") {
		t.Error("expected 'Overall:' section")
	}
	if !strings.Contains(result.Formatted, "By archetype:") {
		t.Error("expected 'By archetype:' section")
	}
	if !strings.Contains(result.Formatted, "UB") {
		t.Error("expected UB color pair in breakdowns")
	}
	if !strings.Contains(result.Formatted, "WR") {
		t.Error("expected WR color pair in breakdowns")
	}
}

func TestCardDetailNotFound(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Card: "Nonexistent"})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "No cards matching") {
		t.Error("expected 'No cards matching' message")
	}
}

func TestLeaderboard(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Sort: "gihwr", Limit: 10})
	if result == nil {
		t.Fatal("expected result")
	}
	// Should be sorted by GIH WR desc.
	lines := strings.Split(result.Formatted, "\n")
	foundGood := -1
	foundBad := -1
	for i, line := range lines {
		if strings.Contains(line, "Good Card") {
			foundGood = i
		}
		if strings.Contains(line, "Bad Card") {
			foundBad = i
		}
	}
	if foundGood < 0 || foundBad < 0 {
		t.Fatal("expected both cards in output")
	}
	if foundGood > foundBad {
		t.Error("expected Good Card before Bad Card when sorted by GIH WR desc")
	}
}

func TestLeaderboardByIWD(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Sort: "iwd", Limit: 10})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Top cards by IWD") {
		t.Error("expected 'IWD' in header")
	}
}

func TestLeaderboardWithColorFilter(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Sort: "gihwr", Colors: "UB", Limit: 10})
	if result == nil {
		t.Fatal("expected result")
	}
	// Average Card has no UB data, so only 2 cards should appear.
	if strings.Contains(result.Formatted, "Average Card") {
		t.Error("Average Card has no UB data, should not appear")
	}
	if !strings.Contains(result.Formatted, "Showing 1–2 of 2") {
		t.Errorf("expected 'Showing 1–2 of 2', got:\n%s", result.Formatted)
	}
}

func TestOverview(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST"})
	if result == nil {
		t.Fatal("expected result")
	}
	// Overview should have set stats, top/bottom cards, IWD leaders.
	if !strings.Contains(result.Formatted, "40.0K games") {
		t.Error("expected total games in overview")
	}
	if !strings.Contains(result.Formatted, "Set avg GIH WR: 52.3%") {
		t.Error("expected set average in overview")
	}
	if !strings.Contains(result.Formatted, "Top 5 by GIH WR") {
		t.Error("expected top 5 section")
	}
	if !strings.Contains(result.Formatted, "Top 5 by IWD") {
		t.Error("expected IWD section")
	}
}

func TestOverviewIncludesSetStats(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST"})
	if result == nil {
		t.Fatal("expected result")
	}
	if result.SetStats.TotalGames != 40000 {
		t.Errorf("expected totalGames 40000, got %d", result.SetStats.TotalGames)
	}
	if result.SetStats.AvgGIHWR != 0.5233 {
		t.Errorf("expected avgGIHWR 0.5233, got %v", result.SetStats.AvgGIHWR)
	}
}

func TestInvalidSet(t *testing.T) {
	result := Search(testRatings, Query{Set: "XXX"})
	if result != nil {
		t.Error("expected nil for unknown set")
	}
}

func TestPagination(t *testing.T) {
	result := Search(testRatings, Query{Set: "TST", Sort: "gihwr", Limit: 1, Offset: 0})
	if result == nil {
		t.Fatal("expected result")
	}
	if !strings.Contains(result.Formatted, "Showing 1–1 of 3") {
		t.Errorf("expected pagination info, got:\n%s", result.Formatted)
	}
	if !strings.Contains(result.Formatted, "2 more results. Use offset=1") {
		t.Error("expected pagination hint")
	}
}

func TestAvailableSets(t *testing.T) {
	sets := AvailableSets(testRatings)
	if len(sets) != 1 {
		t.Fatalf("expected 1 set, got %d", len(sets))
	}
	if sets[0] != "TST" {
		t.Errorf("expected 'TST', got %q", sets[0])
	}
}
