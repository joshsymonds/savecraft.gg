package dropcalc

import (
	"math"
	"testing"
)

// Cross-validation tests against known-good D2R drop calculator results.
// These pin our output to match expected values within rounding tolerance.
// All tests use: players=3, party_size=1, mf=33.

type crossCheckCase struct {
	name       string
	monster    string
	difficulty int
	itemCode   string
	expected   float64 // known-good 1:X value
	area       string  // optional area override
}

func runCrossCheck(t *testing.T, cases []crossCheckCase) {
	t.Helper()
	c := NewCalculator()

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			drops, err := c.ResolveWithQuality(tc.monster, tc.difficulty, 0, 3, 1, 33, tc.area)
			if err != nil {
				t.Fatal(err)
			}

			var uniqueProb float64
			for _, d := range drops {
				if d.Code == tc.itemCode {
					uniqueProb = d.Quality.Unique
					break
				}
			}
			if uniqueProb == 0 {
				t.Fatalf("%s not in drops", tc.itemCode)
			}

			got := 1 / uniqueProb
			pctDiff := math.Abs(got-tc.expected) / tc.expected * 100
			if pctDiff > 1.0 {
				t.Errorf("got 1:%.0f, want 1:%.0f (%.1f%% off)", got, tc.expected, pctDiff)
			}
			t.Logf("1:%.0f (want 1:%.0f, %.2f%% diff)", got, tc.expected, pctDiff)
		})
	}
}

// Skin of the Vipermagi (unique Serpentskin Armor, code "xea")
func TestCrossCheckVipermagiUnique(t *testing.T) {
	runCrossCheck(t, []crossCheckCase{
		{"Baal Normal", "baalcrab", 0, "xea", 700, ""},
		{"Mephisto NM", "mephisto", 1, "xea", 750, ""},
		{"Andariel NM", "andariel", 1, "xea", 783, ""},
		{"Diablo NM", "diablo", 1, "xea", 783, ""},
		{"Baal NM", "baalcrab", 1, "xea", 811, ""},
		{"Mephisto Hell", "mephisto", 2, "xea", 915, ""},
		{"Diablo Hell", "diablo", 2, "xea", 939, ""},
		{"Baal Hell", "baalcrab", 2, "xea", 947, ""},
	})
}

// Magefist (unique Light Gauntlets, code "tgl")
// Area level override used for Hell difficulty to match area-specific results.
func TestCrossCheckMagefistUnique(t *testing.T) {
	runCrossCheck(t, []crossCheckCase{
		{"Abominable Normal", "snowyeti2", 0, "tgl", 301807, ""},
		{"Abominable NM Drifter Cavern", "snowyeti2", 1, "tgl", 402397, "Drifter Cavern"},
		{"Abominable NM Ancients Way", "snowyeti2", 1, "tgl", 410721, "The Ancients' Way"},
		{"Abominable NM Icy Cellar", "snowyeti2", 1, "tgl", 410721, "Icy Cellar"},
		{"Abominable Hell Drifter Cavern", "snowyeti2", 2, "tgl", 496063, "Drifter Cavern"},
		{"Abominable Hell Ancients Way", "snowyeti2", 2, "tgl", 489302, "The Ancients' Way"},
		{"Abominable Hell Icy Cellar", "snowyeti2", 2, "tgl", 496063, "Icy Cellar"},
	})
}
