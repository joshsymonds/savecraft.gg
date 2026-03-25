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

	if gs.ActiveDecks != nil {
		sections["active_decks"] = map[string]any{
			"description": "All constructed deck lists with main deck and sideboard — use to analyze deck composition, mana curves, card choices, and sideboard strategy",
			"data":        gs.ActiveDecks,
		}
	}

	if gs.Rank != nil {
		sections["rank"] = map[string]any{
			"description": "Current ranked ladder position for Constructed and Limited — use to contextualize performance, set improvement goals, and calibrate advice difficulty",
			"data":        gs.Rank,
		}
	}

	if gs.Inventory != nil {
		sections["inventory"] = map[string]any{
			"description": "Currency, wildcards, draft tokens, and booster packs — use to evaluate crafting budget and recommend efficient wildcard spending",
			"data":        gs.Inventory,
		}
	}

	if gs.Matches != nil && len(gs.Matches.Matches) > 0 {
		sections["match_history"] = map[string]any{
			"description": "Match results with opponent info and cards seen — use to identify matchup patterns, analyze win rates by event/deck, and recommend sideboard adjustments",
			"data":        gs.Matches,
		}
	}

	if gs.GameLogs != nil && len(gs.GameLogs.Games) > 0 {
		sections["game_log"] = map[string]any{
			"description": "Turn-by-turn game log with decision context — use to analyze play sequencing, identify misplays, evaluate lines of play, and review key turning points",
			"data":        gs.GameLogs,
		}
	}

	if gs.Drafts != nil && len(gs.Drafts.Drafts) > 0 {
		sections["draft_history"] = map[string]any{
			"description": "Draft picks with full pack contents at each selection. If the last pick has no 'chosen' card, the player is LIVE DRAFTING — 'available' is their current pack. Combine their previous picks (the pool) with draft_ratings using the colors parameter to give archetype-aware pick advice. Compare ALSA to pick position to read signals (late picks of high-ALSA cards = open archetype).",
			"data":        gs.Drafts,
		}
	}

	return sections
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
