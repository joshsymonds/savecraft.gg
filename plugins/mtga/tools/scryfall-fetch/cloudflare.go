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

// buildCardSQL generates SQL that wipes and repopulates magic_cards and
// magic_cards_fts with all cards from Scryfall. scryfall-fetch owns the
// full table lifecycle — no other tool writes to these tables.
func buildCardSQL(cards []ScryfallCard) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Wipe both tables before repopulating.
	b.WriteString("DELETE FROM magic_cards_fts;\n")
	b.WriteString("DELETE FROM magic_cards;\n")

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

		// arena_id and arena_id_back are nullable — use NULL for zero values.
		arenaID := "NULL"
		if c.ArenaID > 0 {
			arenaID = fmt.Sprintf("%d", c.ArenaID)
		}
		arenaIDBack := "NULL"
		if c.ArenaIDBack > 0 {
			arenaIDBack = fmt.Sprintf("%d", c.ArenaIDBack)
		}

		fmt.Fprintf(&b, "INSERT INTO magic_cards (scryfall_id, arena_id, arena_id_back, oracle_id, name, front_face_name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, produced_mana, power, toughness, is_default) VALUES (%s, %s, %s, %s, %s, %s, %s, %g, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %d);\n",
			q(c.ScryfallID), arenaID, arenaIDBack, q(c.OracleID),
			q(c.Name), q(c.FrontFaceName), q(c.ManaCost), c.CMC,
			q(c.TypeLine), q(c.OracleText), q(colorsJSON), q(colorIdentityJSON),
			q(legalitiesJSON), q(c.Rarity), q(c.Set), q(keywordsJSON),
			q(producedManaJSON), q(c.Power), q(c.Toughness), isDefault,
		)

		// FTS5 table (default printings only).
		if c.IsDefault {
			fmt.Fprintf(&b, "INSERT INTO magic_cards_fts (scryfall_id, name, oracle_text, type_line) VALUES (%s, %s, %s, %s);\n",
				q(c.ScryfallID), q(c.Name), q(c.OracleText), q(c.TypeLine),
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
					ID:     fmt.Sprintf("card:%s", c.ScryfallID),
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
