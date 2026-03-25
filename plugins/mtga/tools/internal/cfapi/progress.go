package cfapi

// MilestoneSet returns a set of progress-tracking indices at which to print
// status: 25%, 50%, 75%, and 100% of total. The indices are rounded up to
// the nearest batchSize boundary (use batchSize=1 when tracking batch counts
// rather than item counts).
func MilestoneSet(total, batchSize int) map[int]bool {
	m := make(map[int]bool, 4)
	for _, pct := range []int{25, 50, 75, 100} {
		target := total * pct / 100
		// Round up to next batch boundary.
		batchEnd := ((target + batchSize - 1) / batchSize) * batchSize
		batchEnd = min(batchEnd, total)
		batchEnd = max(batchEnd, 1)
		m[batchEnd] = true
	}
	return m
}
