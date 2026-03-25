package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

func main() {
	enc := json.NewEncoder(os.Stdout)

	writeStatus(enc, "Parsing Player.log...")

	entries := DecodeLog(os.Stdin)
	writeStatus(enc, fmt.Sprintf("Decoded %d log entries", len(entries)))

	gs := BuildGameState(entries)

	// Build the output sections.
	sections := buildOutputSections(gs)

	// Build identity and summary.
	saveName := gs.DisplayName
	if saveName == "" {
		saveName = gs.PlayerID
	}
	if saveName == "" {
		saveName = "Unknown Player"
	}

	summary := buildSummary(gs)

	enc.Encode(map[string]any{
		"type": "result",
		"identity": map[string]any{
			"saveName": saveName,
			"gameId":   "mtga",
			"extra":    buildExtra(gs),
		},
		"summary":  summary,
		"sections": sections,
	})
}

func buildOutputSections(gs *GameState) map[string]any {
	sections := map[string]any{}

	// Always emit player_summary — the compact overview for get_save.
	sections["player_summary"] = map[string]any{
		"description": "Player overview: rank, inventory, deck names, match results, and game log index — start here to understand the player's current state",
		"data":        buildPlayerSummary(gs),
	}

	// Per-deck sections with full card lists.
	if gs.ActiveDecks != nil {
		for _, deck := range gs.ActiveDecks.Decks {
			sections["deck:"+deck.Name] = map[string]any{
				"description": fmt.Sprintf("Deck list for %s (%s) — main deck, sideboard, and command zone cards", deck.Name, deck.Format),
				"data":        deck,
			}
		}
	}

	// Per-game sections with full turn-by-turn data.
	if gs.GameLogs != nil {
		for _, game := range gs.GameLogs.Games {
			sections["game:"+game.MatchID] = map[string]any{
				"description": fmt.Sprintf("Turn-by-turn game log for match %s — use to analyze play sequencing, identify misplays, and review key turning points", game.MatchID),
				"data":        game,
			}
		}
	}

	if gs.Drafts != nil && len(gs.Drafts.Drafts) > 0 {
		sections["draft_history"] = map[string]any{
			"description": "Draft picks with full pack contents at each selection. If the last pick has no 'chosen' card, the player is LIVE DRAFTING — 'available' is their current pack. Use query_reference with draft_ratings to evaluate picks. Pass the full pick history as pick_history (array of {available, chosen} per completed pick) to enable accumulated archetype signal tracking. Don't just report stats — recommend a pick with reasoning about archetype fit, curve, and signals. Compare ALSA to pick position to read signals (late picks of high-ALSA cards = open archetype).",
			"data":        gs.Drafts,
		}
	}

	return sections
}

func buildPlayerSummary(gs *GameState) map[string]any {
	summary := map[string]any{}

	if gs.DisplayName != "" {
		summary["display_name"] = gs.DisplayName
	}

	if gs.Rank != nil {
		summary["rank"] = gs.Rank
	}

	if gs.Inventory != nil {
		summary["inventory"] = gs.Inventory
	}

	// Deck index: names, formats, and section pointers (no card lists).
	if gs.ActiveDecks != nil {
		deckList := make([]map[string]any, len(gs.ActiveDecks.Decks))
		for i, deck := range gs.ActiveDecks.Decks {
			deckList[i] = map[string]any{
				"name":    deck.Name,
				"format":  deck.Format,
				"section": "deck:" + deck.Name,
			}
		}
		summary["decks"] = deckList
	}

	// Match results with full metadata.
	if gs.Matches != nil && len(gs.Matches.Matches) > 0 {
		matchList := make([]map[string]any, len(gs.Matches.Matches))
		for i, m := range gs.Matches.Matches {
			matchList[i] = map[string]any{
				"matchId":  m.MatchID,
				"eventId":  m.EventID,
				"date":     m.Date,
				"opponent": m.Opponent.Name,
				"result":   m.Result,
				"games":    m.Games,
			}
		}
		summary["matches"] = matchList
	}

	// Game log index: matchId, opponent, result, turn count, section pointer.
	if gs.GameLogs != nil && len(gs.GameLogs.Games) > 0 {
		gameIndex := make([]map[string]any, len(gs.GameLogs.Games))
		for i, game := range gs.GameLogs.Games {
			entry := map[string]any{
				"matchId": game.MatchID,
				"turns":   len(game.Turns),
				"section": "game:" + game.MatchID,
			}
			// Cross-reference match data for opponent/result if available.
			if gs.Matches != nil {
				for _, m := range gs.Matches.Matches {
					if m.MatchID == game.MatchID {
						entry["opponent"] = m.Opponent.Name
						entry["result"] = m.Result
						break
					}
				}
			}
			gameIndex[i] = entry
		}
		summary["games"] = gameIndex
	}

	return summary
}

func buildSummary(gs *GameState) string {
	parts := []string{}
	if gs.DisplayName != "" {
		parts = append(parts, gs.DisplayName)
	}
	if gs.Rank != nil {
		if gs.Rank.Constructed.Class != "" {
			parts = append(parts, fmt.Sprintf("%s %d Constructed", gs.Rank.Constructed.Class, gs.Rank.Constructed.Level))
		}
		if gs.Rank.Limited.Class != "" {
			parts = append(parts, fmt.Sprintf("%s %d Limited", gs.Rank.Limited.Class, gs.Rank.Limited.Level))
		}
	}
	if len(parts) == 0 {
		return "MTG Arena Player"
	}
	return strings.Join(parts, ", ")
}

func buildExtra(gs *GameState) map[string]any {
	extra := map[string]any{}
	if gs.Rank != nil {
		if gs.Rank.Constructed.Class != "" {
			extra["constructedRank"] = fmt.Sprintf("%s %d", gs.Rank.Constructed.Class, gs.Rank.Constructed.Level)
		}
		if gs.Rank.Limited.Class != "" {
			extra["limitedRank"] = fmt.Sprintf("%s %d", gs.Rank.Limited.Class, gs.Rank.Limited.Level)
		}
	}
	if gs.ActiveDecks != nil {
		extra["deckCount"] = len(gs.ActiveDecks.Decks)
	}
	return extra
}

func writeStatus(enc *json.Encoder, msg string) {
	if err := enc.Encode(map[string]any{"type": "status", "message": msg}); err != nil {
		os.Exit(1)
	}
}
