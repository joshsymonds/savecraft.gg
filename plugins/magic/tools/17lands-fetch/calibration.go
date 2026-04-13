package main

import "sort"

// calibrationRow holds per-axis sigmoid parameters for a set.
type calibrationRow struct {
	Axis      string
	Center    float64
	Steepness float64
}

// computeCalibration derives sigmoid parameters from empirical data.
//
// Axes fall into two categories:
//
// Card-intrinsic axes (baseline, synergy, signal) have fixed distributions
// per set — a card's GIH WR is the same regardless of draft state. These
// use percentile-based calibration: center = P50 (median), steepness =
// 4.4 / (P90 - P10). This maps the 10th–90th percentile range to 0.1–0.9
// on the sigmoid, preserving gradation where decisions happen.
//
// State-dependent axes (castability, color_commitment, opportunity_cost,
// curve, role) produce values that depend on the current pool and pick
// number. Their ranges are bounded by construction ([0,1] or [-1,1]), so
// their sigmoid params are theoretical constants.
func computeCalibration(sr setResult, synergies []synergyRow) []calibrationRow {
	var rows []calibrationRow

	// Card-intrinsic axes: percentile-based calibration.
	if cal := calibrateBaseline(sr); cal != nil {
		rows = append(rows, *cal)
	}
	if cal := calibrateSynergy(synergies); cal != nil {
		rows = append(rows, *cal)
	}
	if cal := calibrateSignal(sr); cal != nil {
		rows = append(rows, *cal)
	}

	// State-dependent axes: theoretical params from bounded ranges.
	// These are written to D1 (not hardcoded in TypeScript) so the
	// scoring engine reads all sigmoid params from one source.
	rows = append(rows,
		calibrationRow{Axis: "castability", Center: 0.75, Steepness: 8},
		calibrationRow{Axis: "color_commitment", Center: 0.5, Steepness: 4},
		calibrationRow{Axis: "opportunity_cost", Center: 0.85, Steepness: 8},
		calibrationRow{Axis: "curve", Center: 0, Steepness: 3},
		calibrationRow{Axis: "role", Center: 0.3, Steepness: 5},
	)

	// Bayesian priors: median sample sizes for shrinkage in the scoring engine.
	// archetype_prior: median games_in_hand across all archetype-card rows.
	// synergy_prior: median games_together across all synergy pairs.
	rows = append(rows, calibrateArchetypePrior(sr))
	rows = append(rows, calibrateSynergyPrior(synergies))

	return rows
}

// percentileSigmoid computes sigmoid params from a sorted slice of values.
// center = P50 (median), steepness = 3.0 / (P90 - P10).
//
// The 3.0 constant maps P10 → ~0.18 and P90 → ~0.82 on the sigmoid,
// leaving headroom at both extremes for bombs (>P90) and unplayables (<P10)
// to differentiate. A tighter constant like 4.4 (mapping to 0.1/0.9) compresses
// the top end too aggressively for sets with narrow GIH WR distributions.
//
// Returns nil if the P90-P10 range is too narrow (degenerate distribution).
func percentileSigmoid(axis string, values []float64, minRange float64) *calibrationRow {
	n := len(values)
	if n < 10 {
		return nil
	}
	sort.Float64s(values)

	p10 := values[n/10]
	p50 := values[n/2]
	p90 := values[n*9/10]

	spread := p90 - p10
	if spread < minRange {
		return nil
	}

	return &calibrationRow{
		Axis:      axis,
		Center:    round4(p50),
		Steepness: round4(3.0 / spread),
	}
}

func calibrateBaseline(sr setResult) *calibrationRow {
	var values []float64
	for _, c := range sr.Cards {
		if c.Overall.GamesInHand >= 200 {
			values = append(values, c.Overall.GIHWR)
		}
	}
	return percentileSigmoid("baseline", values, 0.01)
}

func calibrateSynergy(synergies []synergyRow) *calibrationRow {
	if len(synergies) < 20 {
		return nil
	}
	// The synergy axis sums pairwise deltas across all pool cards, not
	// individual deltas. Calibrate against per-card synergy sums: for each
	// card, sum all its pairwise deltas. This matches the distribution of
	// values the sigmoid actually sees during scoring.
	sumByCard := make(map[string]float64)
	for _, s := range synergies {
		sumByCard[s.CardA] += s.SynergyDelta
	}
	if len(sumByCard) < 10 {
		return nil
	}
	values := make([]float64, 0, len(sumByCard))
	for _, sum := range sumByCard {
		values = append(values, sum)
	}
	return percentileSigmoid("synergy", values, 0.01)
}

func calibrateSignal(sr setResult) *calibrationRow {
	var values []float64
	for _, c := range sr.Cards {
		if c.Overall.GamesInHand >= 200 && c.Overall.ATA > 0 {
			values = append(values, c.Overall.ATA)
		}
	}
	return percentileSigmoid("signal", values, 0.5)
}

// calibrateArchetypePrior computes the Bayesian prior for archetype GIH WR
// shrinkage. Uses the median games_in_hand across all per-archetype card stats.
func calibrateArchetypePrior(sr setResult) calibrationRow {
	var values []float64
	for _, c := range sr.Cards {
		for _, s := range c.ByColor {
			if s.GamesInHand > 0 {
				values = append(values, float64(s.GamesInHand))
			}
		}
	}
	prior := 750.0 // default
	if len(values) > 0 {
		sort.Float64s(values)
		prior = values[len(values)/2]
	}
	return calibrationRow{Axis: "archetype_prior", Center: prior, Steepness: 0}
}

// calibrateSynergyPrior computes the Bayesian prior for synergy delta
// shrinkage. Uses the median games_together across all synergy pairs.
func calibrateSynergyPrior(synergies []synergyRow) calibrationRow {
	var values []float64
	seen := make(map[string]bool)
	for _, s := range synergies {
		// Synergies are stored in both directions — deduplicate.
		key := s.CardA + "|" + s.CardB
		if s.CardA > s.CardB {
			key = s.CardB + "|" + s.CardA
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		if s.GamesTogether > 0 {
			values = append(values, float64(s.GamesTogether))
		}
	}
	prior := 75.0 // default
	if len(values) > 0 {
		sort.Float64s(values)
		prior = values[len(values)/2]
	}
	return calibrationRow{Axis: "synergy_prior", Center: prior, Steepness: 0}
}

// round4 is defined in main.go.
