package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// wotcGameChangers is the canonical WotC Bracket System "Game Changers" list.
// 53 cards as of the February 9, 2026 update.
//
// Source of truth: Scryfall's `is:gamechanger` predicate
// (https://api.scryfall.com/cards/search?q=is%3Agamechanger), which mirrors
// WotC's official announcement and is updated whenever WotC revises the list
// (typically every 3-4 months).
//
// When updating: re-run the Scryfall query and replace this slice. The
// edhrec-fetch run logs a cross-check report against EDHREC's per-commander
// gamechangers tagging — small divergences are expected (lag between WotC
// announcements and EDHREC indexing), large divergences mean this list is
// stale.
var wotcGameChangers = []string{
	"Ad Nauseam",
	"Ancient Tomb",
	"Aura Shards",
	"Biorhythm",
	"Bolas's Citadel",
	"Braids, Cabal Minion",
	"Chrome Mox",
	"Coalition Victory",
	"Consecrated Sphinx",
	"Crop Rotation",
	"Cyclonic Rift",
	"Demonic Tutor",
	"Drannith Magistrate",
	"Enlightened Tutor",
	"Farewell",
	"Field of the Dead",
	"Fierce Guardianship",
	"Force of Will",
	"Gaea's Cradle",
	"Gamble",
	"Gifts Ungiven",
	"Glacial Chasm",
	"Grand Arbiter Augustin IV",
	"Grim Monolith",
	"Humility",
	"Imperial Seal",
	"Intuition",
	"Jeska's Will",
	"Lion's Eye Diamond",
	"Mana Vault",
	"Mishra's Workshop",
	"Mox Diamond",
	"Mystical Tutor",
	"Narset, Parter of Veils",
	"Natural Order",
	"Necropotence",
	"Notion Thief",
	"Opposition Agent",
	"Orcish Bowmasters",
	"Panoptic Mirror",
	"Rhystic Study",
	"Seedborn Muse",
	"Serra's Sanctum",
	"Smothering Tithe",
	"Survival of the Fittest",
	"Teferi's Protection",
	"Tergrid, God of Fright // Tergrid's Lantern",
	"Thassa's Oracle",
	"The One Ring",
	"The Tabernacle at Pendrell Vale",
	"Underworld Breach",
	"Vampiric Tutor",
	"Worldly Tutor",
}

// BuildGameChangersSQL emits a wipe-and-replace for magic_game_changers.
// Idempotent across runs — the table is small enough that clearing on each
// import is cheap, and avoids stale rows when WotC removes a card.
func BuildGameChangersSQL(cards []string) string {
	var b strings.Builder
	q := cfapi.SQLQuote
	b.WriteString("DELETE FROM magic_game_changers;\n")
	for _, name := range cards {
		if name == "" {
			continue
		}
		fmt.Fprintf(&b,
			"INSERT INTO magic_game_changers (card_name, source) VALUES (%s, 'wotc-official');\n",
			q(name),
		)
	}
	return b.String()
}

// gameChangersDiff compares the hardcoded WotC list against the EDHREC-derived
// set (cards EDHREC has tagged as 'gamechangers' for at least one commander).
//
// Returns:
//   - missing: in WotC list but not in EDHREC's data — possibly a list-update
//     lag, or EDHREC hasn't tagged any commander with the card yet
//   - extra: in EDHREC's data but not in our WotC list — strong signal that
//     WotC revised the list and our hardcode is stale
func gameChangersDiff(wotc []string, derived map[string]int) (missing, extra []string) {
	wotcSet := make(map[string]bool, len(wotc))
	for _, name := range wotc {
		wotcSet[name] = true
	}
	derivedSet := make(map[string]bool, len(derived))
	for name := range derived {
		derivedSet[name] = true
	}
	for name := range wotcSet {
		if !derivedSet[name] {
			missing = append(missing, name)
		}
	}
	for name := range derivedSet {
		if !wotcSet[name] {
			extra = append(extra, name)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	return missing, extra
}
