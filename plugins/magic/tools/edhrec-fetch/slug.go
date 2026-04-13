package main

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// commanderSlug converts a card name into the EDHREC URL slug format.
// Rules observed from json.edhrec.com: lowercase, strip accents, drop
// apostrophes, replace any non-alphanumeric run with a single hyphen,
// trim leading/trailing hyphens. Split cards ("A // B") collapse to "a-b".
func commanderSlug(name string) string {
	// Strip combining marks (accents) after NFD normalization.
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	normalized, _, _ := transform.String(t, name)

	// Drop apostrophes entirely so "Praetors' Voice" -> "praetors-voice".
	normalized = strings.NewReplacer("'", "", "’", "").Replace(normalized)

	var b strings.Builder
	b.Grow(len(normalized))
	prevHyphen := true // start true to suppress leading hyphens
	for _, r := range normalized {
		switch {
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r + ('a' - 'A'))
			prevHyphen = false
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			prevHyphen = false
		default:
			if !prevHyphen {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
	}
	return strings.TrimRight(b.String(), "-")
}
