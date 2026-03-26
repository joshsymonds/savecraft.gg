package main

import "math"

// calibrationRow holds per-axis sigmoid parameters for a set.
type calibrationRow struct {
	Axis      string
	Center    float64
	Steepness float64
}

// computeCalibration derives sigmoid parameters from empirical data.
// For each axis, center = mean and steepness = 4/σ (maps ±2σ to ~0.02–0.98).
// Returns nil if insufficient data.
func computeCalibration(sr setResult, synergies []synergyRow) []calibrationRow {
	var rows []calibrationRow

	// Baseline: calibrate from GIH WR distribution across all cards.
	if cal := calibrateBaseline(sr); cal != nil {
		rows = append(rows, *cal)
	}

	// Synergy: calibrate from synergy_delta distribution across all pairs.
	if cal := calibrateSynergy(synergies); cal != nil {
		rows = append(rows, *cal)
	}

	// Curve, signal, role: centered at 0, use reasonable defaults.
	// These axes produce values that are already naturally bounded or centered.
	// The default steepness of 3 maps ±0.67 to ~0.12–0.88, which is appropriate
	// for gap scores and ATA-normalized deviations.
	//
	// Color commitment and opportunity cost: hardcoded from the research design.
	// color_commitment scores pip-share commitment [0,1] — center=0.5, k=4.
	// opportunity_cost scores stranded pool value [0,1] — center=0.85, k=8
	// (most picks strand little, steep penalty for high-cost pivots).
	rows = append(rows,
		calibrationRow{Axis: "curve", Center: 0, Steepness: 3},
		calibrationRow{Axis: "signal", Center: 0, Steepness: 3},
		calibrationRow{Axis: "role", Center: 0.3, Steepness: 5},
		calibrationRow{Axis: "color_commitment", Center: 0.5, Steepness: 4},
		calibrationRow{Axis: "opportunity_cost", Center: 0.85, Steepness: 8},
	)

	return rows
}

func calibrateBaseline(sr setResult) *calibrationRow {
	if len(sr.Cards) < 10 {
		return nil
	}

	// Compute mean GIH WR.
	var sum float64
	var count int
	for _, c := range sr.Cards {
		if c.Overall.GamesInHand >= 200 {
			sum += c.Overall.GIHWR
			count++
		}
	}
	if count < 10 {
		return nil
	}
	mean := sum / float64(count)

	// Compute stddev.
	var sumSq float64
	for _, c := range sr.Cards {
		if c.Overall.GamesInHand >= 200 {
			diff := c.Overall.GIHWR - mean
			sumSq += diff * diff
		}
	}
	stddev := math.Sqrt(sumSq / float64(count))
	if stddev < 0.001 {
		return nil // Degenerate distribution.
	}

	return &calibrationRow{
		Axis:      "baseline",
		Center:    round4(mean),
		Steepness: round4(4 / stddev),
	}
}

func calibrateSynergy(synergies []synergyRow) *calibrationRow {
	if len(synergies) < 20 {
		return nil
	}

	// Synergy deltas are already centered near 0 by construction.
	// Compute stddev to set steepness.
	var sum float64
	for _, s := range synergies {
		sum += s.SynergyDelta
	}
	mean := sum / float64(len(synergies))

	var sumSq float64
	for _, s := range synergies {
		diff := s.SynergyDelta - mean
		sumSq += diff * diff
	}
	stddev := math.Sqrt(sumSq / float64(len(synergies)))
	if stddev < 0.0001 {
		return nil
	}

	return &calibrationRow{
		Axis:      "synergy",
		Center:    round4(mean),
		Steepness: round4(4 / stddev),
	}
}
