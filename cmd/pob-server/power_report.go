package main

import (
	"encoding/json"
)

// powerReportRadius and powerReportLimit are the inline-only defaults.
// /nearby keeps its own larger radius=5 default for explicit "explore"
// queries; the inline report runs after every /resolve and /modify so it
// uses radius=3 to cap the work at a tighter, more relevant search.
const (
	powerReportRadius = 3
	powerReportLimit  = 5
)

// powerReportPriorityMetrics is the ordered fallback list for the leading
// metric. The first metric in this list with a non-zero baseline drives
// the rank; the others are reported as context deltas. Picked to cover the
// dominant build archetypes:
//
//   - CombinedDPS: DPS-focused builds (most common Path-of-Building lookup)
//   - Life: defensive / Life-stacked builds
//   - EnergyShield: CI / hybrid-ES builds
//
// If none of these has signal in the build's summary, the inline runner
// skips entirely — there's no meaningful "next node" to recommend.
var powerReportPriorityMetrics = []string{"CombinedDPS", "Life", "EnergyShield"}

// attachPowerReport runs an inline nearby-style search after a successful
// /resolve or /modify and returns the top-N unallocated nodes ranked by
// the leading non-zero metric. Returns nil whenever the report cannot be
// attached for any reason — fully missing summary, all baselines zero,
// extract failure, perturb failure. Failures log at warn level but never
// fail the parent response.
//
// The runner reuses the existing Lua extract/perturb protocol, the
// affinity pool, the delta cache, and the mod-source index transparently.
func (srv *Server) attachPowerReport(
	proc *Process,
	buildID, xml string,
	summary map[string]float64,
) *powerReportResult {
	if !srv.PowerReportEnabled {
		return nil
	}
	if proc == nil || buildID == "" || xml == "" {
		return nil
	}

	leading := pickLeadingMetric(summary)
	if leading == "" {
		// No metric has signal; nothing to rank. Skip cleanly.
		return nil
	}
	statKeys := orderedStatKeys(leading)

	extract, ok := srv.runInlineNearbyExtract(proc, xml, statKeys)
	if !ok {
		return nil
	}

	var passing []*nearbyCandidate
	for i := range extract.Candidates {
		c := &extract.Candidates[i]
		if nearbyShouldEvaluate(c, powerReportRadius) {
			passing = append(passing, c)
		}
	}
	if len(passing) == 0 {
		return nil
	}

	if srv.modIndex != nil {
		passing = srv.filterByModIndex(passing, statKeys)
		if len(passing) == 0 {
			return nil
		}
	}

	deltasByID, ok := srv.runInlineNearbyPerturb(proc, buildID, passing, statKeys)
	if !ok {
		return nil
	}

	rankInputs := nearbyBuildRankInputs(passing, deltasByID)
	ranked := nearbyRank(rankInputs, leading, "desc", powerReportLimit)

	return &powerReportResult{
		Metric:   leading,
		Baseline: extract.Baseline[leading],
		Limit:    powerReportLimit,
		Radius:   powerReportRadius,
		Nodes:    ranked,
	}
}

// pickLeadingMetric returns the first metric in the priority list that has
// a non-zero value in the summary, or "" if every priority metric is zero
// (defensive: also "" when summary is nil/empty).
func pickLeadingMetric(summary map[string]float64) string {
	for _, m := range powerReportPriorityMetrics {
		if v, ok := summary[m]; ok && v != 0 {
			return m
		}
	}
	return ""
}

// orderedStatKeys returns the priority list with `leading` placed first.
// Other priority metrics are kept after for context deltas. nearbyRank's
// metric arg picks `leading` for ranking; the rest just decorate.
func orderedStatKeys(leading string) []string {
	out := make([]string, 0, len(powerReportPriorityMetrics))
	out = append(out, leading)
	for _, m := range powerReportPriorityMetrics {
		if m != leading {
			out = append(out, m)
		}
	}
	return out
}

// runInlineNearbyExtract is the failure-degrades version of
// runNearbyExtract. Logs and returns ok=false on any error — never writes
// to an HTTP response.
func (srv *Server) runInlineNearbyExtract(
	proc *Process, xml string, statKeys []string,
) (nearbyExtractData, bool) {
	raw, err := proc.Send(nearbyExtractLuaRequest{
		Type:          "nearby_extract",
		XML:           xml,
		LoadedBuildID: proc.LastLoadedBuildID(),
		Radius:        powerReportRadius,
		Stats:         statKeys,
	})
	if err != nil {
		srv.log.Warn("inline power report: nearby_extract send failed", "err", err)
		return nearbyExtractData{}, false
	}
	var envelope nearbyExtractEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		srv.log.Warn("inline power report: nearby_extract parse failed", "err", err)
		return nearbyExtractData{}, false
	}
	if envelope.Type == pobRespTypeError {
		srv.log.Warn("inline power report: nearby_extract returned error", "message", envelope.Message)
		return nearbyExtractData{}, false
	}
	return envelope.Data, true
}

// runInlineNearbyPerturb is the failure-degrades version of
// runNearbyPerturb. Mirrors the cache pre-check + Send + cache write
// pattern from the explicit /nearby path so the inline runner gets the
// same delta-cache speedup.
func (srv *Server) runInlineNearbyPerturb(
	proc *Process, buildID string, passing []*nearbyCandidate, statKeys []string,
) (map[int]map[string]float64, bool) {
	cachedHits, perturb := srv.splitNearbyByCacheLocked(buildID, passing, statKeys)

	var freshDeltas map[int]map[string]float64
	if len(perturb) > 0 {
		ids := make([]int, len(perturb))
		for i, c := range perturb {
			ids[i] = c.ID
		}
		raw, err := proc.Send(nearbyPerturbLuaRequest{
			Type:    "nearby_perturb",
			NodeIDs: ids,
			Stats:   statKeys,
		})
		if err != nil {
			srv.log.Warn("inline power report: nearby_perturb send failed", "err", err)
			return nil, false
		}
		var envelope nearbyPerturbEnvelope
		if err := json.Unmarshal(raw, &envelope); err != nil {
			srv.log.Warn("inline power report: nearby_perturb parse failed", "err", err)
			return nil, false
		}
		if envelope.Type == pobRespTypeError {
			srv.log.Warn("inline power report: nearby_perturb returned error", "message", envelope.Message)
			return nil, false
		}
		freshDeltas = envelope.Data.Deltas
		if srv.cache.store != nil && buildID != "" && len(freshDeltas) > 0 {
			if err := srv.cache.store.PutDeltasBatch(buildID, freshDeltas); err != nil {
				srv.log.Warn("inline power report: delta cache write failed", "err", err)
			}
		}
	}

	return mergeDeltaMaps(cachedHits, freshDeltas), true
}
