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

// Resource is a tradeable good: its top-level stats from init/resource/<ID>.txt
// joined with its name/description from text/resource/<ID>.txt, plus the roles
// it fills (which init/resource/<role>/ subdirs list it).
type Resource struct {
	// ID is the definition key (init/resource filename without .txt), e.g.
	// "GRAIN".
	ID string `json:"id"`
	// Name is the display name (text NAME), e.g. "Grain". May be empty.
	Name string `json:"name"`
	// Description is the dev-written blurb (text DESC).
	Description string `json:"description,omitempty"`
	// Roles are the categories the resource fills, sorted: any of edible,
	// drinkable, growable, minable, supply, work.
	Roles []string `json:"roles,omitempty"`
	// DegradeRate is the fraction lost to spoilage per year (DEGRADE_RATE).
	DegradeRate float64 `json:"degradeRate,omitempty"`
}

// Race is a species: its top-level stats from init/race/<ID>.txt joined with
// its name/description from text/race/<ID>.txt.
type Race struct {
	// ID is the definition key (init/race filename without .txt), e.g. "HUMAN".
	ID string `json:"id"`
	// Name is the display name (text NAME), e.g. "Human". May be empty.
	Name string `json:"name"`
	// Description is the dev-written blurb (text DESC).
	Description string `json:"description,omitempty"`
	// Playable is whether the race can be chosen as the player's species
	// (PLAYABLE).
	Playable bool `json:"playable"`
	// SlavePrice is the base purchase price as a slave (PROPERTIES.SLAVE_PRICE).
	SlavePrice int `json:"slavePrice,omitempty"`
	// BabyDays / ChildDays are the days spent as a baby / child before
	// becoming a working adult (PROPERTIES.BABY_DAYS / CHILD_DAYS).
	BabyDays  int `json:"babyDays,omitempty"`
	ChildDays int `json:"childDays,omitempty"`
	// PreferredFoods are the foods this race prefers (PREFERRED.FOOD), with the
	// "*" wildcard dropped.
	PreferredFoods []string `json:"preferredFoods,omitempty"`
}

// Tech is one node of the knowledge tree: its stats from a TECHS entry in
// init/tech/<CAT>.txt joined with its name/description from text/tech/<CAT>.txt.
type Tech struct {
	// ID is the tech key (e.g. "SCH00").
	ID string `json:"id"`
	// Name is the display name (text NAME), e.g. "School". May be empty.
	Name string `json:"name"`
	// Description is the dev-written blurb (text DESC).
	Description string `json:"description,omitempty"`
	// Category is the tree's display name (text top-level NAME), e.g.
	// "Administration".
	Category string `json:"category,omitempty"`
	// Costs maps a knowledge-point type to the amount required (COSTS), e.g.
	// {"CIVIC_ADMIN": 15}.
	Costs map[string]float64 `json:"costs,omitempty"`
	// RequiresPopulation is the settlement population threshold to unlock
	// (REQUIRES.GREATER.POPULATION), or 0 if none.
	RequiresPopulation int `json:"requiresPopulation,omitempty"`
	// RequiresTech maps a prerequisite tech key to the level required
	// (REQUIRES_TECH_LEVEL).
	RequiresTech map[string]int `json:"requiresTech,omitempty"`
	// Unlocks are the things this tech unlocks (UNLOCKS_FACTION), e.g. room ids.
	Unlocks []string `json:"unlocks,omitempty"`
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
