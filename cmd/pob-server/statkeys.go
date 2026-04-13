package main

// collectStatKeys deduplicates two stat-key lists, preserving the order from
// the first list (canonical metrics) and appending novel entries from the
// second (additional report-only delta stats). The returned list is the
// canonical order in which calc deltas should be requested for each candidate,
// so consistency across the candidate loop matters.
//
// Used by both /nearby (Send 1 baseline + Send 2 perturb) and /audit (Send 2
// audit_perturb stats list). Lives in its own file because both endpoints'
// handlers reference it and neither owns the helper.
func collectStatKeys(metrics, deltaStats []string) []string {
	seen := make(map[string]bool, len(metrics)+len(deltaStats))
	result := make([]string, 0, len(metrics)+len(deltaStats))
	for _, k := range metrics {
		if !seen[k] {
			result = append(result, k)
			seen[k] = true
		}
	}
	for _, k := range deltaStats {
		if !seen[k] {
			result = append(result, k)
			seen[k] = true
		}
	}
	return result
}
