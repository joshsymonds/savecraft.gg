// Package data holds Songs of Syx reference data generated from the game's
// shipped files (data.zip → data/assets/**) by plugins/songsofsyx/tools/datagen.
// Generated tables live in *_gen.go; this file holds the hand-written types
// they populate. The reference WASM module (plugins/songsofsyx/reference) reads
// these tables to answer queries.
package data

// GuideArticle is one entry of the in-game mechanics guide, extracted verbatim
// from data/assets/text/wiki/GUIDE.txt and ROOMS.txt. The prose is the
// developer's own, version-matched with the game.
type GuideArticle struct {
	// LinkKey is the article's stable key — the game's LINK_KEY where present,
	// otherwise a slug of the title (ROOMS.txt entries have no LINK_KEY).
	LinkKey string
	// Title is the article's display name (the game's NAME field).
	Title string
	// Category groups articles in the table of contents (e.g. "Guide",
	// "Rooms", "Infrastructure").
	Category string
	// Synopsis is the first non-empty line of the body, for the TOC.
	Synopsis string
	// Text is the full article body, verbatim, including <a KEY label>
	// cross-link markup.
	Text string
	// CrossLinks are the LINK_KEYs referenced by <a KEY ...> markup in Text,
	// de-duplicated and in first-appearance order.
	CrossLinks []string
}
