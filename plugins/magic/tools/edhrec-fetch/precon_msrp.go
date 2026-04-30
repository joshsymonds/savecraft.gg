package main

// preconMeta is the hand-maintained metadata for a known WotC precon. EDHREC
// publishes the slug + decklist but doesn't expose retail MSRP, so we
// hardcode it. The catalog grows ~5-10 precons per year; updates extend
// this map. Unknown slugs (no row here) are still ingested with empty
// metadata so the deck-builder can show "tier-equivalent precon X exists,
// but MSRP unknown".
type preconMeta struct {
	Name    string
	MSRPUSD float64
	SetCode string
	Year    int
}

// preconMSRP covers a representative set of WotC Commander precons. MSRPs are
// launch retail (current secondary-market prices may vary substantially —
// downstream code should treat MSRP as a planning anchor, not the price the
// user actually pays).
//
// Source: https://mtg.wiki/page/Commander_(format) preconstructed deck list,
// cross-referenced with WotC product pages.
var preconMSRP = map[string]preconMeta{
	// Commander 2016 (4-color partner-style precons)
	"breed-lethality":    {Name: "Breed Lethality", MSRPUSD: 30, SetCode: "C16", Year: 2016},
	"entropic-uprising":  {Name: "Entropic Uprising", MSRPUSD: 30, SetCode: "C16", Year: 2016},
	"invent-superiority": {Name: "Invent Superiority", MSRPUSD: 30, SetCode: "C16", Year: 2016},
	"open-hostility":     {Name: "Open Hostility", MSRPUSD: 30, SetCode: "C16", Year: 2016},
	"stalwart-unity":     {Name: "Stalwart Unity", MSRPUSD: 30, SetCode: "C16", Year: 2016},

	// Commander 2018
	"adaptive-enchantment": {Name: "Adaptive Enchantment", MSRPUSD: 35, SetCode: "C18", Year: 2018},
	"exquisite-invention":  {Name: "Exquisite Invention", MSRPUSD: 35, SetCode: "C18", Year: 2018},
	"nature-s-vengeance":   {Name: "Nature's Vengeance", MSRPUSD: 35, SetCode: "C18", Year: 2018},
	"subjective-reality":   {Name: "Subjective Reality", MSRPUSD: 35, SetCode: "C18", Year: 2018},

	// Commander 2019
	"faceless-menace":  {Name: "Faceless Menace", MSRPUSD: 40, SetCode: "C19", Year: 2019},
	"merciless-rage":   {Name: "Merciless Rage", MSRPUSD: 40, SetCode: "C19", Year: 2019},
	"mystic-intellect": {Name: "Mystic Intellect", MSRPUSD: 40, SetCode: "C19", Year: 2019},
	"primal-genesis":   {Name: "Primal Genesis", MSRPUSD: 40, SetCode: "C19", Year: 2019},

	// Commander 2020 (Ikoria) — popular
	"arcane-maelstrom":   {Name: "Arcane Maelstrom", MSRPUSD: 40, SetCode: "C20", Year: 2020},
	"enhanced-evolution": {Name: "Enhanced Evolution", MSRPUSD: 40, SetCode: "C20", Year: 2020},
	"ruthless-regiment":  {Name: "Ruthless Regiment", MSRPUSD: 40, SetCode: "C20", Year: 2020},
	"symbiotic-swarm":    {Name: "Symbiotic Swarm", MSRPUSD: 40, SetCode: "C20", Year: 2020},
	"timeless-wisdom":    {Name: "Timeless Wisdom", MSRPUSD: 40, SetCode: "C20", Year: 2020},

	// Phyrexia: All Will Be One Commander (2023) — example for newer style
	"corrupting-influence": {Name: "Corrupting Influence", MSRPUSD: 45, SetCode: "ONC", Year: 2023},
	"rebellion-rising":     {Name: "Rebellion Rising", MSRPUSD: 45, SetCode: "ONC", Year: 2023},
}
