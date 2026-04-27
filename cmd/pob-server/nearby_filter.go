package main

import (
	"fmt"
	"sort"
	"strings"
)

// nearby_filter.go — pure predicates for /nearby's candidate selection pass.
//
// The Lua side of wrapper.lua walks build.spec.nodes within radius and
// serializes raw node properties (alloc, pathDist, type, modKey, etc) into
// nearbyCandidate records. This Go code applies the predicate to gate which
// candidates get a real perturbation calc, and the dedup helper builds the
// stat-key list that perturb requests carry.

// nearbyCandidate is the wire shape returned by handleNearbyExtract in
// wrapper.lua. Pointer types model fields that may be absent in PoB's data:
//   - PathDist == nil → PoB hasn't computed a path distance for this node
//     (e.g. unreachable from the allocated tree)
//   - Path == nil     → no resolved path available
//
// Pass-through fields (ID, Name, Stats, Path) are preserved verbatim into
// the per-metric ranked output downstream.
type nearbyCandidate struct {
	ID             int      `json:"id"`
	Type           string   `json:"type"`
	Alloc          bool     `json:"alloc"`
	PathDist       *int     `json:"pathDist"`
	Path           []string `json:"path"`
	ModKey         string   `json:"modKey"`
	AscendancyName string   `json:"ascendancyName"`
	Name           string   `json:"name"`
	Stats          []string `json:"stats"`
}

// nearbyShouldEvaluate returns true when the candidate is worth a real
// perturbation calc using the historical default category set
// (Normal/Notable/Keystone). Preserved as a thin wrapper so callers
// that don't care about category filtering keep their existing
// behavior; new callers should use nearbyShouldEvaluateWithCategories.
//
// All field semantics match the PoB node shape exposed by PassiveSpec
// (.reference/pob/src/Classes/PassiveSpec.lua).
func nearbyShouldEvaluate(candidate *nearbyCandidate, radius int) bool {
	return nearbyShouldEvaluateWithCategories(candidate, radius, nearbyDefaultCategorySet())
}

// nearbyShouldEvaluateWithCategories applies all the standard
// candidate gates (alloc / radius / path / modKey / ascendancy) plus a
// caller-supplied category allowlist. The allowlist replaces the
// hardcoded {Normal, Notable, Keystone} check.
//
// `allowed` should be the result of validateNearbyCategories — the
// non-empty defaulted set. Passing an empty/nil map filters out every
// candidate (no type matches), which is intentional: the validator is
// responsible for defaulting absent input to the broad set.
func nearbyShouldEvaluateWithCategories(candidate *nearbyCandidate, radius int, allowed map[string]bool) bool {
	if candidate.Alloc {
		return false
	}
	if candidate.PathDist == nil || *candidate.PathDist > radius {
		return false
	}
	if candidate.Path == nil {
		return false
	}
	if !allowed[candidate.Type] {
		return false
	}
	if candidate.ModKey == "" {
		return false
	}
	if candidate.AscendancyName != "" {
		return false
	}
	return true
}

// nearbyValidCategories enumerates the PoB node-type strings the
// /nearby and /audit handlers accept. Mirrors the upstream PassiveSpec
// taxonomy. ClusterNotable / ClusterSocket are PoB's strings for nodes
// inside an allocated cluster jewel — kept in the public set so a
// caller can drill specifically into cluster contents.
//
//nolint:gochecknoglobals // category taxonomy mirrors PoB's PassiveSpec node-type strings; immutable, used by request validators.
var nearbyValidCategories = []string{
	"Normal",
	"Notable",
	"Keystone",
	"Mastery",
	"JewelSocket",
	"ClusterNotable",
	"ClusterSocket",
}

// nearbyDefaultCategorySet is the historical filter — Normal + Notable
// + Keystone. Returned when validateNearbyCategories sees nil/empty
// input so existing callers see no behavior change.
func nearbyDefaultCategorySet() map[string]bool {
	return map[string]bool{
		"Normal":   true,
		"Notable":  true,
		"Keystone": true,
	}
}

// validateNearbyCategories normalizes the request's optional categories
// list into a map for predicate lookup. Empty/nil input returns the
// historical default set; non-empty input must contain only known
// categories or the call returns an error naming the offending value
// alongside the full valid list.
func validateNearbyCategories(input []string) (map[string]bool, error) {
	if len(input) == 0 {
		return nearbyDefaultCategorySet(), nil
	}
	known := make(map[string]bool, len(nearbyValidCategories))
	for _, k := range nearbyValidCategories {
		known[k] = true
	}
	out := make(map[string]bool, len(input))
	for _, cat := range input {
		if !known[cat] {
			validList := make([]string, len(nearbyValidCategories))
			copy(validList, nearbyValidCategories)
			sort.Strings(validList)
			return nil, fmt.Errorf(
				"unknown category %q (valid: %s)",
				cat, strings.Join(validList, ", "),
			)
		}
		out[cat] = true
	}
	return out, nil
}

// The dedup helper that used to live here moved to statkeys.go and is now
// `collectStatKeys`, shared between /nearby and /audit. See that file.
