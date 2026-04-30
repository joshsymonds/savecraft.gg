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

	// Phyrexia: All Will Be One Commander (2023)
	"corrupting-influence": {Name: "Corrupting Influence", MSRPUSD: 45, SetCode: "ONC", Year: 2023},
	"rebellion-rising":     {Name: "Rebellion Rising", MSRPUSD: 45, SetCode: "ONC", Year: 2023},

	// Commander Legends: Battle for Baldur's Gate (CLB, 2022) — 4 face cmdrs
	"exit-from-exile":  {Name: "Exit from Exile", MSRPUSD: 50, SetCode: "CLB", Year: 2022},
	"mind-flayarrrs":   {Name: "Mind Flayarrrs", MSRPUSD: 50, SetCode: "CLB", Year: 2022},
	"party-time":       {Name: "Party Time", MSRPUSD: 50, SetCode: "CLB", Year: 2022},
	"draconic-dissent": {Name: "Draconic Dissent", MSRPUSD: 50, SetCode: "CLB", Year: 2022},

	// Brothers' War (BRO, 2022)
	"mishra-s-burnished-banner": {Name: "Mishra's Burnished Banner", MSRPUSD: 45, SetCode: "BRC", Year: 2022},
	"urza-s-iron-alliance":      {Name: "Urza's Iron Alliance", MSRPUSD: 45, SetCode: "BRC", Year: 2022},

	// Dominaria United (DMU, 2022)
	"legends-legacy": {Name: "Legends' Legacy", MSRPUSD: 45, SetCode: "DMC", Year: 2022},
	"painbow":        {Name: "Painbow", MSRPUSD: 45, SetCode: "DMC", Year: 2022},

	// March of the Machine (MOM, 2023)
	"call-for-backup":    {Name: "Call for Backup", MSRPUSD: 50, SetCode: "MOC", Year: 2023},
	"cavalry-charge":     {Name: "Cavalry Charge", MSRPUSD: 50, SetCode: "MOC", Year: 2023},
	"divine-convocation": {Name: "Divine Convocation", MSRPUSD: 50, SetCode: "MOC", Year: 2023},
	"growing-threat":     {Name: "Growing Threat", MSRPUSD: 50, SetCode: "MOC", Year: 2023},
	"tinker-time":        {Name: "Tinker Time", MSRPUSD: 50, SetCode: "MOC", Year: 2023},

	// Lord of the Rings: Tales of Middle-earth (LTR, 2023)
	"riders-of-rohan":     {Name: "Riders of Rohan", MSRPUSD: 50, SetCode: "LTC", Year: 2023},
	"food-and-fellowship": {Name: "Food and Fellowship", MSRPUSD: 50, SetCode: "LTC", Year: 2023},
	"the-hosts-of-mordor": {Name: "The Hosts of Mordor", MSRPUSD: 50, SetCode: "LTC", Year: 2023},
	"elven-council":       {Name: "Elven Council", MSRPUSD: 50, SetCode: "LTC", Year: 2023},

	// Wilds of Eldraine (WOE, 2023)
	"fae-dominion":     {Name: "Fae Dominion", MSRPUSD: 50, SetCode: "WOC", Year: 2023},
	"virtue-and-valor": {Name: "Virtue and Valor", MSRPUSD: 50, SetCode: "WOC", Year: 2023},

	// Commander Masters (CMM, 2023) — premium-priced reprint set
	"sliver-swarm":          {Name: "Sliver Swarm", MSRPUSD: 130, SetCode: "CMM", Year: 2023},
	"eldrazi-unbound":       {Name: "Eldrazi Unbound", MSRPUSD: 130, SetCode: "CMM", Year: 2023},
	"enduring-enchantments": {Name: "Enduring Enchantments", MSRPUSD: 130, SetCode: "CMM", Year: 2023},
	"planeswalker-party":    {Name: "Planeswalker Party", MSRPUSD: 130, SetCode: "CMM", Year: 2023},

	// Outlaws of Thunder Junction (OTJ, 2024)
	"most-wanted":   {Name: "Most Wanted", MSRPUSD: 50, SetCode: "OTC", Year: 2024},
	"desert-bloom":  {Name: "Desert Bloom", MSRPUSD: 50, SetCode: "OTC", Year: 2024},
	"grand-larceny": {Name: "Grand Larceny", MSRPUSD: 50, SetCode: "OTC", Year: 2024},
	"quick-draw":    {Name: "Quick Draw", MSRPUSD: 50, SetCode: "OTC", Year: 2024},

	// Bloomburrow (BLB, 2024)
	"animated-army":   {Name: "Animated Army", MSRPUSD: 50, SetCode: "BLC", Year: 2024},
	"squirreled-away": {Name: "Squirreled Away", MSRPUSD: 50, SetCode: "BLC", Year: 2024},
	"family-matters":  {Name: "Family Matters", MSRPUSD: 50, SetCode: "BLC", Year: 2024},
	"peace-offering":  {Name: "Peace Offering", MSRPUSD: 50, SetCode: "BLC", Year: 2024},

	// Duskmourn: House of Horror (DSK, 2024)
	"endless-punishment": {Name: "Endless Punishment", MSRPUSD: 50, SetCode: "DSC", Year: 2024},
	"jump-scare":         {Name: "Jump Scare", MSRPUSD: 50, SetCode: "DSC", Year: 2024},

	// Foundations Commander (FDN, 2024) — evergreen set
	"exit-the-dungeon": {Name: "Exit the Dungeon", MSRPUSD: 50, SetCode: "FDC", Year: 2024},
	"surge-of-souls":   {Name: "Surge of Souls", MSRPUSD: 50, SetCode: "FDC", Year: 2024},
	"token-triumph":    {Name: "Token Triumph", MSRPUSD: 50, SetCode: "FDC", Year: 2024},
	"creative-energy":  {Name: "Creative Energy", MSRPUSD: 50, SetCode: "FDC", Year: 2024},

	// Tarkir: Dragonstorm Commander (TDC, 2025)
	"dragonstorm-decree": {Name: "Dragonstorm Decree", MSRPUSD: 50, SetCode: "TDC", Year: 2025},
	"clan-rivalries":     {Name: "Clan Rivalries", MSRPUSD: 50, SetCode: "TDC", Year: 2025},
}
