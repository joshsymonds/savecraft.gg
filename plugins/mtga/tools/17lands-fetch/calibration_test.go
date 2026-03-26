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
				// P10 ~ 0.47, P50 ~ 0.545, P90 ~ 0.62
				// Steepness = 4.4 / (0.62 - 0.47) = 4.4/0.15 ~ 29.3
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
			wantCenter: 0.545, // median of 0.45..0.64
			wantSteep:  [2]float64{25, 35},
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
	// Steepness = 4.4 / 0.10 = 44.0
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

	wantSteepness := 44.0
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
			name: "happy path",
			rows: func() []synergyRow {
				var s []synergyRow
				for i := range 30 {
					s = append(s, synergyRow{SynergyDelta: float64(i-15) * 0.01})
				}
				return s
			}(),
		},
		{
			name:    "fewer than 20 rows",
			rows:    []synergyRow{{SynergyDelta: 0.1}},
			wantNil: true,
		},
		{
			name: "all identical deltas",
			rows: func() []synergyRow {
				var s []synergyRow
				for range 30 {
					s = append(s, synergyRow{SynergyDelta: 0.05})
				}
				return s
			}(),
			wantNil: true, // P90 - P10 < 0.001 triggers nil.
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

	var synergies []synergyRow
	for i := range 30 {
		synergies = append(synergies, synergyRow{SynergyDelta: float64(i-15) * 0.01})
	}

	rows := computeCalibration(sr, synergies)

	// Should have 8 axes: baseline, synergy, signal + 5 state-dependent
	if len(rows) != 8 {
		t.Fatalf("expected 8 calibration rows, got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
		if r.Steepness <= 0 {
			t.Errorf("axis %s: steepness = %g, want > 0", r.Axis, r.Steepness)
		}
	}

	for _, expected := range []string{
		"baseline", "synergy", "signal",
		"castability", "color_commitment", "opportunity_cost", "curve", "role",
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

	if len(rows) != 5 {
		t.Fatalf("expected 5 calibration rows (state-dependent only), got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
	}
	for _, expected := range []string{"castability", "color_commitment", "opportunity_cost", "curve", "role"} {
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

	if !strings.Contains(sql, "DELETE FROM mtga_draft_calibration WHERE set_code = 'DSK';") {
		t.Error("SQL should contain per-set DELETE for calibration")
	}

	calCount := strings.Count(sql, "INSERT INTO mtga_draft_calibration")
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
	// Steepness = 4.4 / (0.90 - 0.10) = 4.4 / 0.80 = 5.5
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
	if math.Abs(cal.Steepness-5.5) > 0.5 {
		t.Errorf("steepness = %g, want ~5.5", cal.Steepness)
	}
}
