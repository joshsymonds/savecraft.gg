package dropcalc

import (
	"sort"
	"strings"
	"unicode"
)

// FuzzyResult describes how an item name was resolved via fuzzy matching.
type FuzzyResult struct {
	Code        string
	ResolveType ItemResolveType
	// Corrected is the canonical item name when the input was auto-resolved
	// via case-insensitive or normalized matching. Empty if exact match.
	Corrected string
	// Suggestions contains close matches when the input couldn't be resolved.
	// Empty if the item was resolved (exact or auto-corrected).
	Suggestions []string
}

// ResolveItemFuzzy tries progressively fuzzier matching strategies:
//  1. Exact match (existing ResolveItem)
//  2. Case-insensitive exact match
//  3. Normalized match (strip spaces/hyphens/apostrophes, lowercase)
//  4. Levenshtein distance on normalized names (≤2 = auto-resolve, 3-5 = suggest)
func (c *Calculator) ResolveItemFuzzy(nameOrCode string) FuzzyResult {
	// Step 1: Exact match.
	if code, rt := c.ResolveItem(nameOrCode); code != "" {
		return FuzzyResult{Code: code, ResolveType: rt}
	}

	// Step 2: Case-insensitive exact match.
	if orig, ok := c.itemNameLower[strings.ToLower(nameOrCode)]; ok {
		code, rt := c.ResolveItem(orig)
		return FuzzyResult{Code: code, ResolveType: rt, Corrected: orig}
	}

	// Step 3: Normalized match (strips spaces, hyphens, apostrophes).
	queryNorm := normalize(nameOrCode)
	if orig, ok := c.itemNameNorm[queryNorm]; ok {
		code, rt := c.ResolveItem(orig)
		return FuzzyResult{Code: code, ResolveType: rt, Corrected: orig}
	}

	// Step 4: Levenshtein on normalized names.
	type candidate struct {
		name string
		dist int
	}
	var candidates []candidate
	for norm, orig := range c.itemNameNorm {
		d := levenshtein(queryNorm, norm)
		if d <= 5 {
			candidates = append(candidates, candidate{name: orig, dist: d})
		}
	}

	if len(candidates) == 0 {
		return FuzzyResult{} // Nothing close.
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].dist < candidates[j].dist
	})

	// Auto-resolve if best match is very close (≤2 edits on normalized form).
	if candidates[0].dist <= 2 {
		code, rt := c.ResolveItem(candidates[0].name)
		return FuzzyResult{Code: code, ResolveType: rt, Corrected: candidates[0].name}
	}

	// Otherwise return suggestions (top 5).
	limit := 5
	if len(candidates) < limit {
		limit = len(candidates)
	}
	suggestions := make([]string, limit)
	for i := 0; i < limit; i++ {
		suggestions[i] = candidates[i].name
	}
	return FuzzyResult{Suggestions: suggestions}
}

// normalize lowercases and strips spaces, hyphens, and apostrophes.
// "Raven Frost" → "ravenfrost", "Tal Rasha's" → "talrashas".
func normalize(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r == ' ' || r == '-' || r == '\'' || r == '\u2019' {
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

// levenshtein computes the edit distance between two strings.
func levenshtein(a, b string) int {
	if len(a) == 0 {
		return len(b)
	}
	if len(b) == 0 {
		return len(a)
	}

	// Use two rows instead of full matrix.
	prev := make([]int, len(b)+1)
	curr := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}

	for i, ra := range a {
		curr[0] = i + 1
		j := 0
		for _, rb := range b {
			cost := 1
			if ra == rb {
				cost = 0
			}
			ins := curr[j] + 1
			del := prev[j+1] + 1
			sub := prev[j] + cost
			best := sub
			if ins < best {
				best = ins
			}
			if del < best {
				best = del
			}
			j++
			curr[j] = best
		}
		prev, curr = curr, prev
	}
	return prev[len(b)]
}
