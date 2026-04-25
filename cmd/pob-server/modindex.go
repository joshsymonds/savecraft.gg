package main

import (
	"strings"
	"sync"
)

// ModSourceIndex is a static classifier mapping primary-stat metrics to the
// keyword patterns that PoB uses in passive-tree node stat descriptions.
// It implements a conservative pre-filter for /nearby and /audit
// perturbation: a candidate node whose stat strings cannot mention the
// requested metric (per the keyword map) is provably unable to affect the
// metric in PoB's calc graph for that primary stat, and can be skipped
// before the calcFunc cost.
//
// Coverage is bounded to PRIMARY stats — direct mods that PoB applies
// to the player's stat sheet (Life, EnergyShield, Mana, attributes,
// resistances, defences). DERIVED stats like CombinedDPS, EHP, or
// MovementSpeedMod are computed from many primaries via the calc graph;
// the index returns true (conservative pass-through) for those, so they
// behave exactly as today's no-filter code path.
//
// The conservative direction matters for correctness: false-positives
// (perturb a node that doesn't affect the metric) merely cost a calcFunc
// call; false-negatives (skip a node that DOES affect the metric) would
// silently drop deltas and produce wrong rankings. Every keyword pattern
// here errs toward over-matching.
type ModSourceIndex struct {
	mu sync.RWMutex
	// metricPatterns is the case-folded substring-matcher set for each known
	// primary metric. A node's stat string matches the metric if any of its
	// patterns appears (case-insensitively) in any of the node's stat strings.
	metricPatterns map[string][]string
}

// NewModSourceIndex returns a ready-to-use index seeded with the primary
// stat keyword patterns. The index has no boot-time PoB dependency; PoB's
// stat description strings are stable across patches and the keyword map
// is hand-curated to match them. (A future version could empirically
// validate these via a probe pass against PoB's actual mod database.)
func NewModSourceIndex() *ModSourceIndex {
	return &ModSourceIndex{
		metricPatterns: defaultMetricPatterns(),
	}
}

// defaultMetricPatterns produces the case-insensitive substring patterns
// that classify a passive-tree node's stat description as relevant to a
// given primary metric. Lowercase here; matching uses
// strings.ToLower-equivalent semantics.
//
// Patterns must err on the side of over-inclusion. "Life" includes both
// "life" and "life regeneration" (both touch the Life pool); resistances
// include the umbrella "all elemental resistances" phrasing.
func defaultMetricPatterns() map[string][]string {
	all := "all elemental resistance"
	return map[string][]string{
		"Life":                   {"life"},
		"EnergyShield":           {"energy shield"},
		"Mana":                   {"mana"},
		"Armour":                 {"armour"},
		"Evasion":                {"evasion"},
		"Strength":               {"strength", "to all attributes"},
		"Dexterity":              {"dexterity", "to all attributes"},
		"Intelligence":           {"intelligence", "to all attributes"},
		"FireResist":             {"fire resistance", all},
		"ColdResist":             {"cold resistance", all},
		"LightningResist":        {"lightning resistance", all},
		"ChaosResist":            {"chaos resistance"}, // explicitly NOT in "all elemental"
		"BlockChance":            {"block chance", "block"},
		"SpellSuppressionChance": {"spell suppression"},
	}
}

// NodeAffectsMetric returns true when the candidate node's stat strings
// could plausibly affect the requested metric. Returns true (conservative
// pass-through) when:
//   - The metric is unknown to the index (derived stats like CombinedDPS).
//   - The node has no stat strings (defensive — extract anomaly).
//   - The node is a Keystone (PoB calc graph carries indirect effects via
//     conversion rules, e.g. Avatar of Fire affects Fire damage despite
//     no "fire" keyword in the stat description).
//
// Returns false only when the metric IS in the primary set AND none of
// the node's stat strings matches any of the metric's keyword patterns —
// i.e. PoB's calc machinery has no causal path from this node to this
// metric.
func (m *ModSourceIndex) NodeAffectsMetric(stats []string, nodeType string, metric string) bool {
	if len(stats) == 0 {
		return true
	}
	if nodeType == "Keystone" {
		return true
	}
	m.mu.RLock()
	patterns, ok := m.metricPatterns[metric]
	m.mu.RUnlock()
	if !ok {
		return true
	}
	// Lowercase each stat string once and search every pattern against it.
	for _, stat := range stats {
		lowered := strings.ToLower(stat)
		for _, pat := range patterns {
			if strings.Contains(lowered, pat) {
				return true
			}
		}
	}
	return false
}
