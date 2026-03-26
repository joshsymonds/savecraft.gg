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
			name: "happy path: 4/stddev formula",
			cards: func() []cardResult {
				// 10 cards with GIH WR spread: 0.48, 0.50, 0.52, 0.54, 0.56 (repeated twice)
				// Mean = 0.52, sigma = sqrt((0.0016+0.0004+0+0.0004+0.0016)/5) = sqrt(0.0008) ~ 0.0283
				// Steepness = 4/0.0283 ~ 141.4
				var cards []cardResult
				for _, wr := range []float64{0.48, 0.50, 0.52, 0.54, 0.56, 0.48, 0.50, 0.52, 0.54, 0.56} {
					cards = append(cards, cardResult{Overall: setCardStats{GIHWR: wr, GamesInHand: 500}})
				}
				return cards
			}(),
			wantCenter: 0.52,
			wantSteep:  [2]float64{100, 200},
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
				// Only 5 have enough games, rest have too few.
				for i := range 10 {
					gih := 500
					if i >= 5 {
						gih = 50 // Below the 200 threshold in calibrateBaseline.
					}
					cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.50, GamesInHand: gih}})
				}
				return cards
			}(),
			wantNil: true,
		},
		{
			name: "stddev near zero: all identical win rates",
			cards: func() []cardResult {
				var cards []cardResult
				for range 20 {
					cards = append(cards, cardResult{Overall: setCardStats{GIHWR: 0.5000, GamesInHand: 500}})
				}
				return cards
			}(),
			wantNil: true, // stddev < 0.001 triggers nil return.
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
			if math.Abs(cal.Center-tt.wantCenter) > 0.01 {
				t.Errorf("center = %g, want ~%g", cal.Center, tt.wantCenter)
			}
			if cal.Steepness < tt.wantSteep[0] || cal.Steepness > tt.wantSteep[1] {
				t.Errorf("steepness = %g, want [%g, %g]", cal.Steepness, tt.wantSteep[0], tt.wantSteep[1])
			}
		})
	}
}

func TestCalibrateBaseline_Formula(t *testing.T) {
	// Verify the 4/stddev formula exactly with known values.
	// 10 cards: five at 0.50, five at 0.60.
	// Mean = 0.55, stddev = sqrt((5*0.0025 + 5*0.0025)/10) = sqrt(0.0025) = 0.05
	// Steepness = 4/0.05 = 80
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

	wantCenter := 0.55
	wantSteepness := 80.0

	if math.Abs(cal.Center-wantCenter) > 0.001 {
		t.Errorf("center = %g, want %g", cal.Center, wantCenter)
	}
	if math.Abs(cal.Steepness-wantSteepness) > 1.0 {
		t.Errorf("steepness = %g, want %g", cal.Steepness, wantSteepness)
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
			name: "stddev near zero: all identical deltas",
			rows: func() []synergyRow {
				var s []synergyRow
				for range 30 {
					s = append(s, synergyRow{SynergyDelta: 0.05})
				}
				return s
			}(),
			wantNil: true, // stddev < 0.0001 triggers nil return.
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
			// Center should be near 0 (mean of -0.15 to +0.14 ~ -0.005)
			if math.Abs(cal.Center) > 0.02 {
				t.Errorf("center = %g, want near 0", cal.Center)
			}
			if cal.Steepness <= 0 {
				t.Errorf("steepness = %g, want > 0", cal.Steepness)
			}
		})
	}
}

func TestCalibrateSynergy_Formula(t *testing.T) {
	// Verify 4/stddev formula with known uniform distribution.
	// 20 values: 0.0, 0.1, 0.2, ..., 1.9
	// Mean = 0.95
	// Variance = sum((x - 0.95)^2)/20
	var rows []synergyRow
	for i := range 20 {
		rows = append(rows, synergyRow{SynergyDelta: float64(i) * 0.1})
	}

	cal := calibrateSynergy(rows)
	if cal == nil {
		t.Fatal("expected non-nil calibration")
	}

	// Compute expected stddev.
	mean := 0.95
	var sumSq float64
	for i := range 20 {
		diff := float64(i)*0.1 - mean
		sumSq += diff * diff
	}
	expectedStddev := math.Sqrt(sumSq / 20)
	expectedSteepness := round4(4 / expectedStddev)

	if math.Abs(cal.Steepness-expectedSteepness) > 0.01 {
		t.Errorf("steepness = %g, want %g (4/stddev where stddev=%g)", cal.Steepness, expectedSteepness, expectedStddev)
	}
}

func TestComputeCalibration_AllAxes(t *testing.T) {
	sr := setResult{Set: "TST"}
	for i := range 20 {
		sr.Cards = append(sr.Cards, cardResult{
			Name:    string(rune('A' + i)),
			Overall: setCardStats{GIHWR: 0.45 + float64(i)*0.01, GamesInHand: 500},
		})
	}

	var synergies []synergyRow
	for i := range 30 {
		synergies = append(synergies, synergyRow{SynergyDelta: float64(i-15) * 0.01})
	}

	rows := computeCalibration(sr, synergies)

	// Should have 5 axes: baseline, synergy, curve, signal, role
	if len(rows) != 5 {
		t.Fatalf("expected 5 calibration rows, got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
		if r.Steepness <= 0 {
			t.Errorf("axis %s: steepness = %g, want > 0", r.Axis, r.Steepness)
		}
	}

	for _, expected := range []string{"baseline", "synergy", "curve", "signal", "role"} {
		if !axes[expected] {
			t.Errorf("missing axis %q", expected)
		}
	}
}

func TestComputeCalibration_DegenerateInputs(t *testing.T) {
	// Both baseline and synergy have insufficient data — should still
	// return the 3 fixed axes (curve, signal, role).
	sr := setResult{Set: "TST", Cards: []cardResult{
		{Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}},
	}}

	rows := computeCalibration(sr, nil)

	if len(rows) != 3 {
		t.Fatalf("expected 3 calibration rows (fixed axes only), got %d", len(rows))
	}

	axes := make(map[string]bool)
	for _, r := range rows {
		axes[r.Axis] = true
	}
	for _, expected := range []string{"curve", "signal", "role"} {
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
