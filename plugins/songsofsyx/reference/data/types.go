// Package data holds Songs of Syx reference data generated from the game's
// shipped files (data.zip → data/assets/**) by plugins/songsofsyx/tools/datagen.
// Generated tables live in *_gen.go; this file holds the hand-written types
// they populate. The reference WASM module (plugins/songsofsyx/reference) reads
// these tables to answer queries.
package data

// Room is a buildable room/building: its stats from init/room/<ID>.txt joined
// with its display name and description from text/room/<ID>.txt by the shared
// ID. Production rates and build costs are for the base upgrade tier; the game
// also has per-tier upgrades and area-derived worker capacity, which are not
// represented here.
type Room struct {
	// ID is the definition key (init/room filename without .txt), e.g.
	// "EATERY_NORMAL".
	ID string `json:"id"`
	// Name is the display name (text INFO.NAME), e.g. "Food Stall". May be
	// empty if the room ships no text file.
	Name string `json:"name"`
	// Description is the dev-written blurb (text INFO.DESC).
	Description string `json:"description,omitempty"`
	// Category groups the room (text INFO.WIKI.CATEGORY, e.g. "Service",
	// "Refiner"). May be empty.
	Category string `json:"category,omitempty"`
	// BuildCost maps a build resource to its quantity for the base tier
	// (RESOURCES zipped with ITEMS[0].COSTS; zero-cost entries omitted).
	BuildCost map[string]int `json:"buildCost,omitempty"`
	// Produces / Consumes map a resource to its per-worker player rate from
	// INDUSTRY.OUT / INDUSTRY.IN (top-level, else INDUSTRIES[0].INDUSTRY).
	Produces map[string]float64 `json:"produces,omitempty"`
	Consumes map[string]float64 `json:"consumes,omitempty"`
	// UsesTool is WORK.USES_TOOL — whether workers' output scales with tools.
	UsesTool bool `json:"usesTool,omitempty"`
	// IsService is true when the room provides a citizen SERVICE (hearth,
	// well, food stall, bath, etc.) rather than producing goods.
	IsService bool `json:"isService,omitempty"`
	// Growable is the farmed resource for farms (GROWABLE), else empty.
	Growable string `json:"growable,omitempty"`
}

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
