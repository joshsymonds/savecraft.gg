package main

import (
	"math"
	"strings"
	"testing"
)

func TestCalibrateBaseline(t *testing.T) {
	// 5 cards with GIH WR spread: 0.48, 0.50, 0.52, 0.54, 0.56
	// Mean = 0.52, σ = sqrt((0.0016+0.0004+0+0.0004+0.0016)/5) = sqrt(0.0008) ≈ 0.0283
	// Steepness = 4/0.0283 ≈ 141.4
	sr := setResult{
		Set: "TST",
		Cards: []cardResult{
			{Name: "A", Overall: setCardStats{GIHWR: 0.48, GamesInHand: 500}},
			{Name: "B", Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}},
			{Name: "C", Overall: setCardStats{GIHWR: 0.52, GamesInHand: 500}},
			{Name: "D", Overall: setCardStats{GIHWR: 0.54, GamesInHand: 500}},
			{Name: "E", Overall: setCardStats{GIHWR: 0.56, GamesInHand: 500}},
			// Add more cards to meet the 10-card minimum.
			{Name: "F", Overall: setCardStats{GIHWR: 0.48, GamesInHand: 500}},
			{Name: "G", Overall: setCardStats{GIHWR: 0.50, GamesInHand: 500}},
			{Name: "H", Overall: setCardStats{GIHWR: 0.52, GamesInHand: 500}},
			{Name: "I", Overall: setCardStats{GIHWR: 0.54, GamesInHand: 500}},
			{Name: "J", Overall: setCardStats{GIHWR: 0.56, GamesInHand: 500}},
		},
	}

	cal := calibrateBaseline(sr)
	if cal == nil {
		t.Fatal("expected non-nil calibration")
	}

	if cal.Axis != "baseline" {
		t.Errorf("axis = %q, want baseline", cal.Axis)
	}

	// Center should be mean GIH WR ≈ 0.52
	if math.Abs(cal.Center-0.52) > 0.01 {
		t.Errorf("center = %g, want ≈0.52", cal.Center)
	}

	// Steepness should be 4/σ where σ ≈ 0.028
	if cal.Steepness < 100 || cal.Steepness > 200 {
		t.Errorf("steepness = %g, want 100-200 (4/σ where σ≈0.028)", cal.Steepness)
	}
}

func TestCalibrateBaseline_InsufficientData(t *testing.T) {
	sr := setResult{
		Set:   "TST",
		Cards: []cardResult{{Name: "A", Overall: setCardStats{GIHWR: 0.50}}},
	}

	cal := calibrateBaseline(sr)
	if cal != nil {
		t.Error("expected nil calibration with insufficient data")
	}
}

func TestCalibrateSynergy(t *testing.T) {
	// Create synergy rows with known distribution.
	var synergies []synergyRow
	for i := range 30 {
		delta := float64(i-15) * 0.01 // -0.15 to +0.14
		synergies = append(synergies, synergyRow{SynergyDelta: delta})
	}

	cal := calibrateSynergy(synergies)
	if cal == nil {
		t.Fatal("expected non-nil calibration")
	}

	if cal.Axis != "synergy" {
		t.Errorf("axis = %q, want synergy", cal.Axis)
	}

	// Center should be near 0 (mean of -0.15 to +0.14 ≈ -0.005)
	if math.Abs(cal.Center) > 0.02 {
		t.Errorf("center = %g, want near 0", cal.Center)
	}

	// Steepness should be positive and reasonable.
	if cal.Steepness <= 0 {
		t.Errorf("steepness = %g, want > 0", cal.Steepness)
	}
}

func TestCalibrateSynergy_InsufficientData(t *testing.T) {
	synergies := []synergyRow{{SynergyDelta: 0.1}}

	cal := calibrateSynergy(synergies)
	if cal != nil {
		t.Error("expected nil calibration with insufficient data")
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

func TestBuildSynergyImportSQL_Calibration(t *testing.T) {
	result := synergyDataResult{
		Set: "DSK",
		Calibration: []calibrationRow{
			{Axis: "baseline", Center: 0.535, Steepness: 25},
			{Axis: "synergy", Center: 0, Steepness: 4},
		},
	}

	sql := buildSynergyImportSQL([]synergyDataResult{result})

	if !strings.Contains(sql, "DELETE FROM mtga_draft_calibration;") {
		t.Error("SQL should contain DELETE for calibration")
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
