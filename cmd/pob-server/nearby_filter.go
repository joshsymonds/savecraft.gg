package main

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
// perturbation calc: not currently allocated, within radius path-distance
// of the allocated tree, has a resolved path, is a real passive (not a
// Mastery, Socket, or class-start marker), carries a non-empty modKey
// (otherwise it has nothing to contribute), and isn't part of an ascendancy.
//
// All field semantics match the PoB node shape exposed by PassiveSpec
// (.reference/pob/src/Classes/PassiveSpec.lua).
func nearbyShouldEvaluate(candidate *nearbyCandidate, radius int) bool {
	if candidate.Alloc {
		return false
	}
	if candidate.PathDist == nil || *candidate.PathDist > radius {
		return false
	}
	if candidate.Path == nil {
		return false
	}
	if candidate.Type != "Normal" &&
		candidate.Type != nodeTypeNotable &&
		candidate.Type != nodeTypeKeystone {
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

// The dedup helper that used to live here moved to statkeys.go and is now
// `collectStatKeys`, shared between /nearby and /audit. See that file.
