package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// cardEmbeddingText builds the text to embed for a card's Vectorize vector.
func cardEmbeddingText(c ScryfallCard) string {
	return c.Name + " " + c.TypeLine + " " + c.OracleText
}

// buildCardEnrichmentSQL generates SQL that enriches existing MTGA-sourced rows
// with Scryfall data (oracle_id, legalities, keywords, oracle_text, produced_mana)
// and inserts non-Arena cards that don't already exist in D1.
//
// For existing rows (arena_id already in D1 from mtga-carddb): uses INSERT ... ON
// CONFLICT to update only Scryfall-provided fields, preserving mtga-carddb's data
// for power, toughness, and other MTGA-sourced columns.
//
// For non-Arena cards (no matching arena_id in D1): does a full INSERT.
//
// FTS5: clears and rebuilds since default printings may have changed via oracle_id
// dedup, and Scryfall provides better oracle_text for search.
func buildCardEnrichmentSQL(cards []ScryfallCard) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Delete FTS5 entries for cards we're about to enrich. This preserves
	// FTS entries for MTGA-only cards (like Kavaero) that Scryfall doesn't know.
	for _, c := range cards {
		fmt.Fprintf(&b, "DELETE FROM mtga_cards_fts WHERE arena_id = %d;\n", c.ArenaID)
	}

	for _, c := range cards {
		colorsJSON := cfapi.JSONArray(c.Colors)
		colorIdentityJSON := cfapi.JSONArray(c.ColorIdentity)
		legalitiesJSON := "{}"
		if len(c.Legalities) > 0 {
			j, _ := json.Marshal(c.Legalities)
			legalitiesJSON = string(j)
		}
		keywordsJSON := cfapi.JSONArray(c.Keywords)
		producedManaJSON := cfapi.JSONArray(c.ProducedMana)

		isDefault := 0
		if c.IsDefault {
			isDefault = 1
		}

		// UPSERT: insert if new (non-Arena card), or update Scryfall-specific
		// fields if the row already exists (MTGA-sourced card).
		fmt.Fprintf(&b, "INSERT INTO mtga_cards (arena_id, oracle_id, name, front_face_name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default, produced_mana) VALUES (%d, %s, %s, %s, %s, %g, %s, %s, %s, %s, %s, %s, %s, %s, %d, %s) ON CONFLICT(arena_id) DO UPDATE SET oracle_id = %s, legalities = %s, keywords = %s, oracle_text = %s, produced_mana = %s, is_default = %d;\n",
			c.ArenaID, q(c.OracleID), q(c.Name), q(c.FrontFaceName), q(c.ManaCost), c.CMC,
			q(c.TypeLine), q(c.OracleText), q(colorsJSON), q(colorIdentityJSON),
			q(legalitiesJSON), q(c.Rarity), q(c.Set), q(keywordsJSON), isDefault, q(producedManaJSON),
			// ON CONFLICT UPDATE — only Scryfall-enriched fields:
			q(c.OracleID), q(legalitiesJSON), q(keywordsJSON), q(c.OracleText), q(producedManaJSON), isDefault,
		)

		// FTS5 table (default printings only).
		if c.IsDefault {
			fmt.Fprintf(&b, "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (%d, %s, %s, %s);\n",
				c.ArenaID, q(c.Name), q(c.OracleText), q(c.TypeLine),
			)
		}
	}

	return b.String()
}

// populateCardVectorize embeds all cards concurrently and upserts to Vectorize.
func populateCardVectorize(accountID, indexName, apiToken string, cards []ScryfallCard) error {
	const embeddingBatchSize = 100
	const vectorizeBatchSize = 1000
	const embeddingConcurrency = 6

	fmt.Printf("Embedding %d cards...\n", len(cards))

	// Pre-allocate slots so concurrent goroutines write to distinct indices.
	numBatches := (len(cards) + embeddingBatchSize - 1) / embeddingBatchSize
	batchResults := make([][]cfapi.VectorizeVector, numBatches)

	// Milestone progress: report at 25%, 50%, 75%, 100%.
	embeddingMilestones := cfapi.MilestoneSet(len(cards), embeddingBatchSize)

	sem := make(chan struct{}, embeddingConcurrency)
	var mu sync.Mutex
	var firstErr error
	var wg sync.WaitGroup

	for batchIdx := range numBatches {
		i := batchIdx * embeddingBatchSize
		end := min(i+embeddingBatchSize, len(cards))
		batch := cards[i:end]

		wg.Add(1)
		go func(batchIdx, end int, batch []ScryfallCard) {
			defer wg.Done()

			sem <- struct{}{}        // acquire semaphore slot
			defer func() { <-sem }() // release semaphore slot

			// Skip work if a previous batch already failed.
			mu.Lock()
			failed := firstErr != nil
			mu.Unlock()
			if failed {
				return
			}

			texts := make([]string, len(batch))
			for j, c := range batch {
				texts[j] = cardEmbeddingText(c)
			}

			embeddings, err := cfapi.EmbedTextsWithRetry(accountID, apiToken, texts)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch ending at %d: %w", end, err)
				}
				mu.Unlock()
				return
			}

			if len(embeddings) != len(batch) {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch ending at %d: expected %d embeddings, got %d", end, len(batch), len(embeddings))
				}
				mu.Unlock()
				return
			}

			vectors := make([]cfapi.VectorizeVector, len(batch))
			for j, c := range batch {
				vectors[j] = cfapi.VectorizeVector{
					ID:     fmt.Sprintf("card:%d", c.ArenaID),
					Values: embeddings[j],
					Metadata: map[string]string{
						"type": "card",
						"name": c.Name,
					},
				}
			}
			batchResults[batchIdx] = vectors

			if embeddingMilestones[end] {
				fmt.Printf("  Embedded %d/%d\n", end, len(cards))
			}
		}(batchIdx, end, batch)
	}

	wg.Wait()

	if firstErr != nil {
		return firstErr
	}

	// Flatten batch results in order.
	var allVectors []cfapi.VectorizeVector
	for _, vecs := range batchResults {
		allVectors = append(allVectors, vecs...)
	}

	// Upsert in batches
	fmt.Printf("Upserting %d card vectors to Vectorize...\n", len(allVectors))
	upsertMilestones := cfapi.MilestoneSet(len(allVectors), vectorizeBatchSize)
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := cfapi.UpsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		if upsertMilestones[end] {
			fmt.Printf("  Upserted %d/%d\n", end, len(allVectors))
		}
	}

	return nil
}
