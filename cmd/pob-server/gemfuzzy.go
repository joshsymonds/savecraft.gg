package main

import (
	"regexp"
	"sort"
	"strings"
)

// levenshtein computes the Levenshtein edit distance between a and b.
// Runs on UTF-8 runes; PoB gem names are ASCII in practice, but this
// avoids surprising behavior on multi-byte input.
func levenshtein(a, b string) int {
	ra := []rune(a)
	rb := []rune(b)
	la, lb := len(ra), len(rb)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}
	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}
	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			curr[j] = min(prev[j]+1, curr[j-1]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

// suggestGemNames returns up to `limit` gem names from `allNames`
// closest to `query` by case-insensitive Levenshtein distance. Ties
// break alphabetically (by canonical name) for deterministic output.
// Results within a dynamic cap (max(3, len(query)/3)) are kept; a
// completely unrelated query returns an empty slice rather than noise.
func suggestGemNames(query string, allNames []string, limit int) []string {
	if limit <= 0 || len(allNames) == 0 {
		return nil
	}
	lowerQuery := strings.ToLower(query)
	type scored struct {
		name string
		dist int
	}
	ranked := make([]scored, 0, len(allNames))
	for _, name := range allNames {
		ranked = append(ranked, scored{name: name, dist: levenshtein(lowerQuery, strings.ToLower(name))})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].dist != ranked[j].dist {
			return ranked[i].dist < ranked[j].dist
		}
		return ranked[i].name < ranked[j].name
	})
	maxDist := max(3, len(lowerQuery)/3)
	out := make([]string, 0, limit)
	for _, s := range ranked {
		if s.dist > maxDist {
			break
		}
		out = append(out, s.name)
		if len(out) >= limit {
			break
		}
	}
	return out
}

// gemNotFoundRe matches the Lua-side error produced by applySwapGem /
// applyAddGem when a gem name fails the index lookup. Capture group 1
// holds the user-provided gem name so we can fuzzy-match against it.
var gemNotFoundRe = regexp.MustCompile(`(?:swap_gem|add_gem): gem not found: ([^\n]+?)\s*$`)

// enrichGemNotFoundError, when the given message contains a
// "gem not found: <name>" phrase, appends top-3 fuzzy suggestions
// from allNames and a pointer to the gem_search reference module.
// Returns the original message and false if the pattern doesn't
// match, so non-gem errors pass through untouched.
func enrichGemNotFoundError(message string, allNames []string) (string, bool) {
	match := gemNotFoundRe.FindStringSubmatch(message)
	if match == nil {
		return message, false
	}
	query := strings.TrimSpace(match[1])
	suggestions := suggestGemNames(query, allNames, 3)
	out := strings.Builder{}
	out.WriteString(message)
	if len(suggestions) > 0 {
		out.WriteString(". Closest matches: ")
		out.WriteString(strings.Join(suggestions, ", "))
	}
	out.WriteString(". Call the gem_search reference module to search the full gem list by keyword.")
	return out.String(), true
}
