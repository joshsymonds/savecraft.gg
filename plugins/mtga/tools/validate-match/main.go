// validate-match downloads Scryfall bulk data and checks how many MTGA
// client cards can be matched to a scryfall_id. Reports exact match rates
// and lists unmatched cards.
//
// Usage: go run ./plugins/mtga/tools/validate-match
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/parser/data"
)

type ScryfallCard struct {
	ID           string   `json:"id"` // scryfall_id
	ArenaID      int      `json:"arena_id"`
	OracleID     string   `json:"oracle_id"`
	Name         string   `json:"name"`
	PrintedName  string   `json:"printed_name"`
	Set          string   `json:"set"`
	Games        []string `json:"games"`
	CollectorNum string   `json:"collector_number"`
}

type BulkDataResponse struct {
	Data []struct {
		Type        string `json:"type"`
		DownloadURI string `json:"download_uri"`
	} `json:"data"`
}

func main() {
	client := &http.Client{}

	// 1. Download Scryfall bulk metadata
	fmt.Println("Fetching Scryfall bulk data metadata...")
	req, err := http.NewRequest("GET", "https://api.scryfall.com/bulk-data", nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create request: %v\n", err)
		os.Exit(1)
	}
	req.Header.Set("User-Agent", "Savecraft/validate-match")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to fetch bulk metadata: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var bulk BulkDataResponse
	if err := json.NewDecoder(resp.Body).Decode(&bulk); err != nil {
		fmt.Fprintf(os.Stderr, "failed to decode bulk metadata: %v\n", err)
		os.Exit(1)
	}

	var downloadURL string
	for _, d := range bulk.Data {
		if d.Type == "default_cards" {
			downloadURL = d.DownloadURI
			break
		}
	}
	if downloadURL == "" {
		fmt.Fprintln(os.Stderr, "default_cards not found in bulk data response")
		os.Exit(1)
	}

	// 2. Download and stream-parse cards
	fmt.Printf("Downloading default_cards from %s...\n", downloadURL)
	req2, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create download request: %v\n", err)
		os.Exit(1)
	}
	req2.Header.Set("User-Agent", "Savecraft/validate-match")
	cardResp, err := client.Do(req2)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to download cards: %v\n", err)
		os.Exit(1)
	}
	defer cardResp.Body.Close()

	// Build lookup maps from Scryfall data
	// arena_id → scryfall_id (direct match)
	arenaToScryfall := make(map[int]string)
	// (lowercase_name, lowercase_set) → scryfall_id (fallback match)
	type nameSetKey struct{ name, set string }
	nameSetToScryfall := make(map[nameSetKey]string)
	// lowercase_name → scryfall_id (last-resort name-only match)
	nameToScryfall := make(map[string]string)

	totalScryfall := 0
	arenaCards := 0

	// Stream-parse the JSON array
	dec := json.NewDecoder(cardResp.Body)
	// Read opening bracket
	if _, err := dec.Token(); err != nil {
		fmt.Fprintf(os.Stderr, "failed to read opening token: %v\n", err)
		os.Exit(1)
	}

	for dec.More() {
		var card ScryfallCard
		if err := dec.Decode(&card); err != nil {
			if err == io.EOF {
				break
			}
			fmt.Fprintf(os.Stderr, "failed to decode card: %v\n", err)
			os.Exit(1)
		}
		totalScryfall++

		frontFace := card.Name
		if before, _, ok := strings.Cut(frontFace, " // "); ok {
			frontFace = before
		}
		lowerName := strings.ToLower(frontFace)
		lowerSet := strings.ToLower(card.Set)

		// Index by arena_id if present
		if card.ArenaID > 0 {
			arenaToScryfall[card.ArenaID] = card.ID
			arenaCards++
		}

		// Index by (name, set)
		nameSetToScryfall[nameSetKey{lowerName, lowerSet}] = card.ID

		// Index by name (prefer Arena printings)
		if _, exists := nameToScryfall[lowerName]; !exists || card.ArenaID > 0 {
			nameToScryfall[lowerName] = card.ID
		}

		// Also index printed_name for UB cards
		if card.PrintedName != "" {
			printedFront := card.PrintedName
			if before, _, ok := strings.Cut(printedFront, " // "); ok {
				printedFront = before
			}
			lowerPrinted := strings.ToLower(printedFront)
			nameSetToScryfall[nameSetKey{lowerPrinted, lowerSet}] = card.ID
			if _, exists := nameToScryfall[lowerPrinted]; !exists {
				nameToScryfall[lowerPrinted] = card.ID
			}
		}
	}

	fmt.Printf("\nScryfall stats:\n")
	fmt.Printf("  Total cards in default_cards: %d\n", totalScryfall)
	fmt.Printf("  Cards with arena_id: %d\n", arenaCards)
	fmt.Printf("  Unique arena_ids: %d\n", len(arenaToScryfall))

	// 3. Match MTGA client cards
	totalMTGA := len(data.ArenaCards)
	matchedDirect := 0
	matchedNameSet := 0
	matchedNameOnly := 0
	var unmatched []string

	for arenaID, card := range data.ArenaCards {
		frontFace := card.Name
		if before, _, ok := strings.Cut(frontFace, " // "); ok {
			frontFace = before
		}
		lowerName := strings.ToLower(frontFace)
		lowerSet := strings.ToLower(card.Set)

		// Try direct arena_id match
		if _, ok := arenaToScryfall[arenaID]; ok {
			matchedDirect++
			continue
		}

		// Try (name, set) match
		if _, ok := nameSetToScryfall[nameSetKey{lowerName, lowerSet}]; ok {
			matchedNameSet++
			continue
		}

		// Try name-only match
		if _, ok := nameToScryfall[lowerName]; ok {
			matchedNameOnly++
			continue
		}

		unmatched = append(unmatched, fmt.Sprintf("  arena_id=%d  name=%q  set=%s", arenaID, card.Name, card.Set))
	}

	totalMatched := matchedDirect + matchedNameSet + matchedNameOnly
	fmt.Printf("\nMTGA → Scryfall match results:\n")
	fmt.Printf("  Total MTGA cards: %d\n", totalMTGA)
	fmt.Printf("  Matched by arena_id: %d\n", matchedDirect)
	fmt.Printf("  Matched by (name, set): %d\n", matchedNameSet)
	fmt.Printf("  Matched by name only: %d\n", matchedNameOnly)
	fmt.Printf("  Total matched: %d (%.2f%%)\n", totalMatched, float64(totalMatched)/float64(totalMTGA)*100)
	fmt.Printf("  Unmatched: %d (%.2f%%)\n", len(unmatched), float64(len(unmatched))/float64(totalMTGA)*100)

	if len(unmatched) > 0 {
		fmt.Printf("\nUnmatched cards:\n")
		for _, s := range unmatched {
			fmt.Println(s)
		}
	}
}
