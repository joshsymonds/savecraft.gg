// MTGA reference module: serves card search, collection diff, and draft ratings.
// Runs server-side in Cloudflare Worker via WASI shim.
//
// Contract: JSON query on stdin, ndjson result on stdout.
// Empty query {} returns the module schema (self-describing).
//
// Build: GOOS=wasip1 GOARCH=wasm go build -o reference.wasm ./reference
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/cardsearch"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/collectiondiff"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/draftratings"
	"github.com/joshsymonds/savecraft.gg/plugins/mtga/reference/manabase"
)

func main() {
	enc := json.NewEncoder(os.Stdout)

	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(enc, "read_error", "failed to read stdin: "+err.Error())
		os.Exit(1)
	}

	var query map[string]any
	if err := json.Unmarshal(raw, &query); err != nil {
		writeError(enc, "parse_error", "invalid JSON query: "+err.Error())
		os.Exit(1)
	}

	// Empty query returns the schema.
	if len(query) == 0 {
		writeResult(enc, schema())
		return
	}

	module, _ := query["module"].(string)
	switch module {
	case "card_search":
		handleCardSearch(enc, query)
	case "collection_diff":
		handleCollectionDiff(enc, raw)
	case "draft_ratings":
		handleDraftRatings(enc, query)
	case "mana_base":
		handleManaBase(enc, raw)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
}

func handleCardSearch(enc *json.Encoder, query map[string]any) {
	q := cardsearch.Query{
		Name:   stringParam(query, "name"),
		Colors: stringParam(query, "colors"),
		Type:   stringParam(query, "type"),
		Text:   stringParam(query, "text"),
		Format: stringParam(query, "format"),
		Rarity: stringParam(query, "rarity"),
		Set:    stringParam(query, "set"),
		Sort:   stringParam(query, "sort"),
		Limit:  intParam(query, "limit", 20),
	}

	if cmc, ok := query["cmc"]; ok {
		if v, ok := cmc.(float64); ok {
			cmcInt := int(v)
			q.CMC = &cmcInt
		}
	}
	q.CMCOp = stringParam(query, "cmc_op")

	results := cardsearch.Search(q)
	writeResult(enc, map[string]any{
		"cards": results,
		"count": len(results),
	})
}

func handleCollectionDiff(enc *json.Encoder, raw []byte) {
	var req struct {
		Module     string                           `json:"module"`
		TargetDeck []collectiondiff.DeckEntry       `json:"target_deck"`
		Collection []collectiondiff.CollectionEntry `json:"collection"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		writeError(enc, "parse_error", "invalid collection_diff query: "+err.Error())
		os.Exit(1)
	}

	result := collectiondiff.Diff(req.TargetDeck, req.Collection)
	writeResult(enc, result)
}

func handleDraftRatings(enc *json.Encoder, query map[string]any) {
	set := stringParam(query, "set")
	if set == "" {
		// Return available sets.
		sets := draftratings.AvailableSets(data.DraftRatings)
		writeResult(enc, map[string]any{
			"availableSets": sets,
			"count":         len(sets),
		})
		return
	}

	q := draftratings.Query{
		Set:    set,
		Card:   stringParam(query, "card"),
		Cards:  stringSliceParam(query, "cards"),
		Colors: stringParam(query, "colors"),
		Sort:   stringParam(query, "sort"),
		Limit:  intParam(query, "limit", 0),
		Offset: intParam(query, "offset", 0),
	}

	result := draftratings.Search(data.DraftRatings, q)
	if result == nil {
		writeError(enc, "not_found", fmt.Sprintf("no draft ratings data for set %q", set))
		os.Exit(1)
	}

	writeResult(enc, result)
}

func handleManaBase(enc *json.Encoder, raw []byte) {
	var req struct {
		Module   string               `json:"module"`
		Deck     []manabase.DeckEntry `json:"deck"`
		DeckSize int                  `json:"deck_size"`
	}
	if err := json.Unmarshal(raw, &req); err != nil {
		writeError(enc, "parse_error", "invalid mana_base query: "+err.Error())
		os.Exit(1)
	}

	result := manabase.Analyze(manabase.Query{
		Deck:     req.Deck,
		DeckSize: req.DeckSize,
	})
	writeResult(enc, result)
}

func schema() map[string]any {
	availableSets := draftratings.AvailableSets(data.DraftRatings)

	return map[string]any{
		"modules": []map[string]any{
			{
				"id":          "card_search",
				"name":        "Card Search",
				"description": "Search Magic: The Gathering cards using Scryfall data",
				"parameters": map[string]any{
					"name":   map[string]string{"type": "string", "description": "Card name (substring, case-insensitive)"},
					"colors": map[string]string{"type": "string", "description": "Color identity filter (e.g., 'BR' for black-red, 'C' for colorless)"},
					"cmc":    map[string]string{"type": "integer", "description": "Mana value"},
					"cmc_op": map[string]string{"type": "string", "description": "Comparison operator: '<=', '=', '>=' (default '=')"},
					"type":   map[string]string{"type": "string", "description": "Type line substring (e.g., 'creature', 'legendary')"},
					"text":   map[string]string{"type": "string", "description": "Oracle text substring"},
					"format": map[string]string{"type": "string", "description": "Format legality (e.g., 'standard', 'historic', 'modern')"},
					"rarity": map[string]string{"type": "string", "description": "Rarity: 'common', 'uncommon', 'rare', 'mythic'"},
					"set":    map[string]string{"type": "string", "description": "Set code (e.g., 'dmu', 'one')"},
					"sort":   map[string]string{"type": "string", "description": "'name' (default) or 'cmc'"},
					"limit":  map[string]string{"type": "integer", "description": "Max results (default 20)"},
				},
			},
			{
				"id":          "collection_diff",
				"name":        "Collection Diff",
				"description": "Calculate wildcard cost to complete a target decklist",
				"parameters": map[string]any{
					"target_deck": map[string]string{"type": "array", "description": "Target deck: [{name, count}]"},
					"collection":  map[string]string{"type": "array", "description": "Owned cards: [{arenaId, count}]"},
				},
			},
			{
				"id":          "draft_ratings",
				"name":        "Draft Ratings",
				"description": "Per-card draft statistics from 17Lands data. Available sets: " + strings.Join(availableSets, ", "),
				"parameters": map[string]any{
					"set":    map[string]string{"type": "string", "description": "Set code (required, e.g., 'DSK'). Omit to list available sets."},
					"card":   map[string]string{"type": "string", "description": "Single card lookup (substring, case-insensitive). Returns full stats with all color breakdowns."},
					"cards":  map[string]string{"type": "array", "description": "Compare 2-5 specific cards side-by-side: ['Card A', 'Card B']. Best for draft pick decisions."},
					"colors": map[string]string{"type": "string", "description": "Color pair context (e.g., 'UB' for Dimir). Filters to archetype-specific stats."},
					"sort":   map[string]string{"type": "string", "description": "'gihwr' (default), 'ohwr', 'iwd', 'alsa', 'ata'. Used with limit for leaderboards."},
					"limit":  map[string]string{"type": "integer", "description": "Max results for leaderboard mode. Triggers sorted table output."},
					"offset": map[string]string{"type": "integer", "description": "Pagination offset for leaderboard mode."},
				},
			},
			{
				"id":          "mana_base",
				"name":        "Mana Base Calculator",
				"description": "Compute exact colored mana source requirements using Frank Karsten's methodology",
				"parameters": map[string]any{
					"deck":      map[string]string{"type": "array", "description": "Deck list: [{name, count}]. Card names resolved to mana costs via Scryfall data."},
					"deck_size": map[string]string{"type": "integer", "description": "40 (limited), 60 (standard/modern, default), 80 (Yorion), or 99 (Commander)."},
				},
			},
		},
	}
}

func writeResult(enc *json.Encoder, data any) {
	if err := enc.Encode(map[string]any{"type": "result", "data": data}); err != nil {
		fmt.Fprintf(os.Stderr, "encode error: %v\n", err)
		os.Exit(1)
	}
}

func writeError(enc *json.Encoder, errType, msg string) {
	enc.Encode(map[string]any{"type": "error", "errorType": errType, "message": msg})
}

func stringParam(query map[string]any, key string) string {
	v, _ := query[key].(string)
	return v
}

func stringSliceParam(query map[string]any, key string) []string {
	v, ok := query[key].([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(v))
	for _, item := range v {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

func intParam(query map[string]any, key string, defaultVal int) int {
	v, ok := query[key].(float64)
	if !ok {
		return defaultVal
	}
	return int(v)
}
