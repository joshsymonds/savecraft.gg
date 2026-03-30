package main

import (
	"math"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// approx checks that actual is within tolerance of expected.
func approx(t *testing.T, label string, actual, expected, tolerance float64) {
	t.Helper()
	if math.Abs(actual-expected) > tolerance {
		t.Errorf("%s: got %.4f, want %.4f (±%.4f)", label, actual, expected, tolerance)
	}
}

// ─── resolveModuleEffects ───────────────────────────────────────────────────

func TestResolveModuleEffects_Productivity(t *testing.T) {
	// 4x productivity-module-3: speed=-0.60, prod=+0.40, consumption=+3.20
	speed, prod, consumption := resolveModuleEffects([]string{
		"productivity-module-3", "productivity-module-3",
		"productivity-module-3", "productivity-module-3",
	})
	approx(t, "speed", speed, -0.60, 0.001)
	approx(t, "prod", prod, 0.40, 0.001)
	approx(t, "consumption", consumption, 3.20, 0.001)
}

func TestResolveModuleEffects_Speed(t *testing.T) {
	// 4x speed-module-3: speed=+2.00, prod=0, consumption=+2.80
	speed, prod, consumption := resolveModuleEffects([]string{
		"speed-module-3", "speed-module-3",
		"speed-module-3", "speed-module-3",
	})
	approx(t, "speed", speed, 2.00, 0.001)
	approx(t, "prod", prod, 0.0, 0.001)
	approx(t, "consumption", consumption, 2.80, 0.001)
}

func TestResolveModuleEffects_Empty(t *testing.T) {
	speed, prod, consumption := resolveModuleEffects(nil)
	if speed != 0 || prod != 0 || consumption != 0 {
		t.Errorf("empty modules should return all zeros, got speed=%.2f prod=%.2f consumption=%.2f", speed, prod, consumption)
	}
}

func TestResolveModuleEffects_UnknownModule(t *testing.T) {
	speed, prod, consumption := resolveModuleEffects([]string{"nonexistent-module"})
	if speed != 0 || prod != 0 || consumption != 0 {
		t.Errorf("unknown module should be ignored, got speed=%.2f prod=%.2f consumption=%.2f", speed, prod, consumption)
	}
}

// ─── resolveBeaconEffects ───────────────────────────────────────────────────

func TestResolveBeaconEffects_Eight(t *testing.T) {
	// 8 beacons, 2x speed-module-3 (each +0.5 speed)
	// Per beacon: 2 * 0.5 = 1.0 speed
	// Total: 8 * 1.0 * 1.5 / sqrt(8) = 12.0 / 2.8284 = 4.2426
	bonus := resolveBeaconEffects([]string{"speed-module-3", "speed-module-3"}, 8)
	approx(t, "beacon speed bonus", bonus, 4.2426, 0.001)
}

func TestResolveBeaconEffects_Single(t *testing.T) {
	// 1 beacon, 2x speed-module-3
	// Total: 1 * 1.0 * 1.5 / sqrt(1) = 1.5
	bonus := resolveBeaconEffects([]string{"speed-module-3", "speed-module-3"}, 1)
	approx(t, "single beacon bonus", bonus, 1.5, 0.001)
}

func TestResolveBeaconEffects_Zero(t *testing.T) {
	bonus := resolveBeaconEffects([]string{"speed-module-3"}, 0)
	if bonus != 0 {
		t.Errorf("zero beacons should return 0, got %v", bonus)
	}
}

func TestResolveBeaconEffects_NoModules(t *testing.T) {
	bonus := resolveBeaconEffects(nil, 8)
	if bonus != 0 {
		t.Errorf("no beacon modules should return 0, got %v", bonus)
	}
}

// ─── parsePowerKW ───────────────────────────────────────────────────────────

func TestParsePowerKW(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
	}{
		{"375kW", 375},
		{"150kW", 150},
		{"90kW", 90},
		{"180kW", 180},
		{"210kW", 210},
		{"420kW", 420},
		{"1MW", 1000},
		{"40MW", 40000},
		{"500W", 0.5},
	}
	for _, tc := range tests {
		m := &data.CraftingMachine{EnergyUsage: tc.input}
		got := parsePowerKW(m)
		if got != tc.expected {
			t.Errorf("parsePowerKW(%q) = %v, want %v", tc.input, got, tc.expected)
		}
	}
}

func TestParsePowerKW_Nil(t *testing.T) {
	got := parsePowerKW(nil)
	if got != 0 {
		t.Errorf("parsePowerKW(nil) = %v, want 0", got)
	}
}

// ─── beltTierForRate ────────────────────────────────────────────────────────

func TestBeltTierForRate(t *testing.T) {
	tests := []struct {
		rate float64
		tier string
	}{
		{14.9, "yellow"},
		{15.0, "yellow"},
		{15.1, "red"},
		{30.0, "red"},
		{30.1, "blue"},
		{45.0, "blue"},
		{45.1, "turbo"},
	}
	for _, tc := range tests {
		got := beltTierForRate(tc.rate)
		if got != tc.tier {
			t.Errorf("beltTierForRate(%.1f) = %q, want %q", tc.rate, got, tc.tier)
		}
	}
}

// ─── roundTo ────────────────────────────────────────────────────────────────

func TestRoundTo(t *testing.T) {
	tests := []struct {
		val      float64
		decimals int
		expected float64
	}{
		{1.555, 1, 1.6},
		{1.554, 1, 1.6},
		{1.544, 1, 1.5},
		{100.0, 0, 100},
		{99.999, 2, 100.0},
	}
	for _, tc := range tests {
		got := roundTo(tc.val, tc.decimals)
		if got != tc.expected {
			t.Errorf("roundTo(%.3f, %d) = %v, want %v", tc.val, tc.decimals, got, tc.expected)
		}
	}
}
