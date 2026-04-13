package main

import (
	"math"
	"strings"
	"testing"
)

func TestCalibrateBaseline(t *testing.T) {
	tests := []struct {
		name       string
		cards      []cardResult
		wantNil    bool
		wantCenter float64
		wantSteep  [2]float64 // min, max range
	}{
		{
			name: "percentile calibration: spread distribution",
			cards: func() []cardResult {
				// 20 cards with GIH WR spread: 0.45 to 0.64
				// P10 = values[2] = 0.47, P50 = values[10] = 0.55, P90 = values[18] = 0.63
				// Steepness = 3.0 / (0.63 - 0.47) = 3.0/0.16 ~ 18.75
				var cards []cardResult
				for i := range 20 {
					cards = append(cards, cardResult{
						Overall: setCardStats{
							GIHWR:       0.45 + float64(i)*0.01,
							GamesInHand: 500,
						},
					})
				}
				return cards
			}(),
			wantCenter: 0.55, // median of 0.45..0.64
			wantSteep:  [2]float64{15, 22},
		},
		{
			name: "fewer than 10 cards",
			cards: []cardResult{
				{Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}},
			},
			wantNil: true,
		},
		{
			name: "10 cards but fewer than 10 with sufficient games",
			cards: func() []cardResult {
				var cards []cardResult
				for i := range 10 {
					gih := 500
					if i >= 5 {
						gih = 50 // Below the 200 threshold.
					}
					cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.50, GamesInHand: gih}})
				}
				return cards
			}(),
			wantNil: true,
		},
		{
			name: "degenerate: all identical win rates",
			cards: func() []cardResult {
				var cards []cardResult
				for range 20 {
					cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.5000, GamesInHand: 500}})
				}
				return cards
			}(),
			wantNil: true, // P90 - P10 < 0.01 triggers nil return.
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sr := setResult{Set: "TST", Cards: tt.cards}
			cal := calibrateBaseline(sr)

			if tt.wantNil {
				if cal != nil {
					t.Fatalf("expected nil, got center=%g steepness=%g", cal.Center, cal.Steepness)
				}
				return
			}

			if cal == nil {
				t.Fatal("expected non-nil calibration")
			}
			if cal.Axis != "baseline" {
				t.Errorf("axis = %q, want baseline", cal.Axis)
			}
			if math.Abs(cal.Center-tt.wantCenter) > 0.02 {
				t.Errorf("center = %g, want ~%g", cal.Center, tt.wantCenter)
			}
			if cal.Steepness < tt.wantSteep[0] || cal.Steepness > tt.wantSteep[1] {
				t.Errorf("steepness = %g, want [%g, %g]", cal.Steepness, tt.wantSteep[0], tt.wantSteep[1])
			}
		})
	}
}

func TestCalibrateBaseline_PercentileFormula(t *testing.T) {
	// 10 cards: five at 0.50, five at 0.60.
	// Sorted: [0.50 x5, 0.60 x5]
	// P10 = values[1] = 0.50, P50 = values[5] = 0.60, P90 = values[9] = 0.60
	// Spread = 0.60 - 0.50 = 0.10
	// Steepness = 3.0 / 0.10 = 30.0
	var cards []cardResult
	for range 5 {
		cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}})
	}
	for range 5 {
		cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.60, GamesInHand: 500}})
	}

	cal := calibrateBaseline(setResult{Set: "TST", Cards: cards})
	if cal == nil {
		t.Fatal("expected non-nil calibration")
	}

	wantSteepness := 30.0
	if math.Abs(cal.Steepness-wantSteepness) > 1.0 {
		t.Errorf("steepness = %g, want ~%g", cal.Steepness, wantSteepness)
	}
}

func TestCalibrateSignal(t *testing.T) {
	tests := []struct {
		name    string
		cards   []cardResult
		wantNil bool
	}{
		{
			name: "happy path: ATA distribution",
			cards: func() []cardResult {
				var cards []cardResult
				for i := range 20 {
					cards = append(cards, cardResult{
						Overall: setCardStats{
							ATA:         1.0 + float64(i)*0.5,
							GamesInHand: 500,
						},
					})
				}
				return cards
			}(),
		},
		{
			name: "fewer than 10 cards with ATA",
			cards: []cardResult{
				{Overall: setCardStats{ATA: 5.0, GamesInHand: 500}},
			},
			wantNil: true,
		},
		{
			name: "all identical ATA",
			cards: func() []cardResult {
				var cards []cardResult
				for range 20 {
					cards = append(cards, cardResult{Overall: setCardStats{ATA: 5.0, GamesInHand: 500}})
				}
				return cards
			}(),
			wantNil: true, // P90 - P10 < 0.5 triggers nil.
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sr := setResult{Set: "TST", Cards: tt.cards}
			cal := calibrateSignal(sr)

			if tt.wantNil {
				if cal != nil {
					t.Fatalf("expected nil, got center=%g steepness=%g", cal.Center, cal.Steepness)
				}
				return
			}

			if cal == nil {
				t.Fatal("expected non-nil calibration")
			}
			if cal.Axis != "signal" {
				t.Errorf("axis = %q, want signal", cal.Axis)
			}
			if cal.Steepness <= 0 {
				t.Errorf("steepness = %g, want > 0", cal.Steepness)
			}
		})
	}
}

func TestCalibrateSynergy(t *testing.T) {
	tests := []struct {
		name    string
		rows    []synergyRow
		wantNil bool
	}{
		{
			name: "happy path: per-card sums from pairwise deltas",
			rows: func() []synergyRow {
				// 10 cards, each with 5 pairwise synergies.
				// Card "A" has deltas: -0.02, -0.01, 0, +0.01, +0.02 → sum = 0
				// Card "B" has deltas: +0.01 x5 → sum = 0.05
				// etc. — creates a spread of per-card sums.
				var s []synergyRow
				cards := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J"}
				for i, card := range cards {
					for j := range 5 {
						s = append(s, synergyRow{
							CardA:        card,
							CardB:        cards[(i+j+1)%len(cards)],
							SynergyDelta: float64(i-5)*0.01 + float64(j-2)*0.005,
						})
					}
				}
				return s
			}(),
		},
		{
			name:    "fewer than 20 rows",
			rows:    []synergyRow{{CardA: "X", SynergyDelta: 0.1}},
			wantNil: true,
		},
		{
			name: "all cards have identical sums",
			rows: func() []synergyRow {
				var s []synergyRow
				for range 30 {
					s = append(s, synergyRow{CardA: "X", SynergyDelta: 0.05})
				}
				return s
			}(),
			wantNil: true, // Only 1 card → fewer than 10 per-card sums.
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cal := calibrateSynergy(tt.rows)

			if tt.wantNil {
				if cal != nil {
					t.Fatalf("expected nil, got center=%g steepness=%g", cal.Center, cal.Steepness)
				}
				return
			}

			if cal == nil {
				t.Fatal("expected non-nil calibration")
			}
			if cal.Axis != "synergy" {
				t.Errorf("axis = %q, want synergy", cal.Axis)
			}
			if cal.Steepness <= 0 {
				t.Errorf("steepness = %g, want > 0", cal.Steepness)
			}
		})
	}
}

func TestComputeCalibration_AllAxes(t *testing.T) {
	sr := setResult{Set: "TST"}
	for i := range 20 {
		sr.Cards = append(sr.Cards, cardResult{
			Name: string(rune('A' + i)),
			Overall: setCardStats{
				GIHWR:       0.45 + float64(i)*0.01,
				GamesInHand: 500,
				ATA:         1.0 + float64(i)*0.5,
			},
		})
	}

	// 15 cards, each with 10 pairwise synergies — creates 150 rows with
	// 15 unique per-card sums spread across a meaningful range.
	cards := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"}
	var synergies []synergyRow
	for i, card := range cards {
		for j := range 10 {
			synergies = append(synergies, synergyRow{
				CardA:        card,
				CardB:        cards[(i+j+1)%len(cards)],
				SynergyDelta: float64(i-7)*0.02 + float64(j-5)*0.005,
			})
		}
	}

	rows := computeCalibration(sr, synergies)

	// Should have 10 axes: baseline, synergy, signal + 5 state-dependent + 2 priors
	if len(rows) != 10 {
		t.Fatalf("expected 10 calibration rows, got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
		// Prior axes have steepness 0 — skip the > 0 check for them.
		if r.Axis != "archetype_prior" && r.Axis != "synergy_prior" && r.Steepness <= 0 {
			t.Errorf("axis %s: steepness = %g, want > 0", r.Axis, r.Steepness)
		}
	}

	for _, expected := range []string{
		"baseline", "synergy", "signal",
		"castability", "color_commitment", "opportunity_cost", "curve", "role",
		"archetype_prior", "synergy_prior",
	} {
		if !axes[expected] {
			t.Errorf("missing axis %q", expected)
		}
	}
}

func TestComputeCalibration_DegenerateInputs(t *testing.T) {
	// Both baseline, synergy, and signal have insufficient data —
	// should still return the 5 state-dependent axes.
	sr := setResult{Set: "TST", Cards: []cardResult{
		{Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}},
	}}

	rows := computeCalibration(sr, nil)

	if len(rows) != 7 {
		t.Fatalf("expected 7 calibration rows (state-dependent + priors), got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
	}
	for _, expected := range []string{"castability", "color_commitment", "opportunity_cost", "curve", "role", "archetype_prior", "synergy_prior"} {
		if !axes[expected] {
			t.Errorf("missing axis %q", expected)
		}
	}
}

func TestBuildSynergyImportSQL_Calibration(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		Calibration: []calibrationRow{
			{Axis: "baseline", Center: 0.535, Steepness: 25},
			{Axis: "synergy", Center: 0, Steepness: 4},
		},
	}

	sql := buildSetSynergySQL(result)

	if !strings.Contains(sql, "DELETE FROM magic_draft_calibration WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for calibration")
	}

	calCount := strings.Count(sql, "INSERT INTO magic_draft_calibration")
	if calCount != 2 {
		t.Errorf("expected 2 calibration INSERTs, got %d", calCount)
	}

	if !strings.Contains(sql, "'baseline'") {
		t.Error("SQL should contain baseline axis")
	}
	if !strings.Contains(sql, "'synergy'") {
		t.Error("SQL should contain synergy axis")
	}
}

func TestPercentileSigmoid(t *testing.T) {
	// 100 values uniformly from 0.0 to 0.99
	// P10 = values[10] = 0.10, P50 = values[50] = 0.50, P90 = values[90] = 0.90
	// Steepness = 3.0 / (0.90 - 0.10) = 3.0 / 0.80 = 3.75
	values := make([]float64, 100)
	for i := range 100 {
		values[i] = float64(i) * 0.01
	}

	cal := percentileSigmoid("test", values, 0.01)
	if cal == nil {
		t.Fatal("expected non-nil")
	}
	if math.Abs(cal.Center-0.50) > 0.02 {
		t.Errorf("center = %g, want ~0.50", cal.Center)
	}
	if math.Abs(cal.Steepness-3.75) > 0.5 {
		t.Errorf("steepness = %g, want ~3.75", cal.Steepness)
	}
}
