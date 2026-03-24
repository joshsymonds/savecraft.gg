package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// cardEmbeddingText builds the text to embed for a card's Vectorize vector.
func cardEmbeddingText(c ScryfallCard) string {
	return c.Name + " " + c.TypeLine + " " + c.OracleText
}

// buildCardImportSQL generates the full SQL string for D1 bulk import of card data.
func buildCardImportSQL(cards []ScryfallCard) string {
	var b strings.Builder

	// Clear existing data (FTS5 first, then structured table)
	b.WriteString("DELETE FROM mtga_cards_fts;\n")
	b.WriteString("DELETE FROM mtga_cards;\n")

	for _, c := range cards {
		colorsJSON := "[]"
		if len(c.Colors) > 0 {
			j, _ := json.Marshal(c.Colors)
			colorsJSON = string(j)
		}
		colorIdentityJSON := "[]"
		if len(c.ColorIdentity) > 0 {
			j, _ := json.Marshal(c.ColorIdentity)
			colorIdentityJSON = string(j)
		}
		legalitiesJSON := "{}"
		if len(c.Legalities) > 0 {
			j, _ := json.Marshal(c.Legalities)
			legalitiesJSON = string(j)
		}
		keywordsJSON := "[]"
		if len(c.Keywords) > 0 {
			j, _ := json.Marshal(c.Keywords)
			keywordsJSON = string(j)
		}

		q := cfapi.SQLQuote

		isDefault := 0
		if c.IsDefault {
			isDefault = 1
		}

		// Structured table (all printings)
		fmt.Fprintf(&b, "INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords, is_default) VALUES (%d, %s, %s, %s, %g, %s, %s, %s, %s, %s, %s, %s, %s, %d);\n",
			c.ArenaID, q(c.OracleID), q(c.Name), q(c.ManaCost), c.CMC,
			q(c.TypeLine), q(c.OracleText), q(colorsJSON), q(colorIdentityJSON),
			q(legalitiesJSON), q(c.Rarity), q(c.Set), q(keywordsJSON), isDefault,
		)

		// FTS5 table (default printings only — one search result per card name)
		if c.IsDefault {
			fmt.Fprintf(&b, "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (%d, %s, %s, %s);\n",
				c.ArenaID, q(c.Name), q(c.OracleText), q(c.TypeLine),
			)
		}
	}

	return b.String()
}

// populateCardVectorize embeds all cards and upserts to Vectorize.
func populateCardVectorize(accountID, indexName, apiToken string, cards []ScryfallCard) error {
	const embeddingBatchSize = 50
	const vectorizeBatchSize = 1000

	fmt.Printf("Embedding %d cards...\n", len(cards))

	var allVectors []cfapi.VectorizeVector
	for i := 0; i < len(cards); i += embeddingBatchSize {
		end := min(i+embeddingBatchSize, len(cards))
		batch := cards[i:end]

		texts := make([]string, len(batch))
		for j, c := range batch {
			texts[j] = cardEmbeddingText(c)
		}

		embeddings, err := cfapi.EmbedTextsWithRetry(accountID, apiToken, texts)
		if err != nil {
			return fmt.Errorf("embedding batch %d-%d: %w", i, end, err)
		}

		if len(embeddings) != len(batch) {
			return fmt.Errorf("embedding batch %d-%d: expected %d embeddings, got %d", i, end, len(batch), len(embeddings))
		}

		for j, c := range batch {
			allVectors = append(allVectors, cfapi.VectorizeVector{
				ID:     fmt.Sprintf("card:%d", c.ArenaID),
				Values: embeddings[j],
				Metadata: map[string]string{
					"type": "card",
					"name": c.Name,
				},
			})
		}

		fmt.Printf("  Embedded %d/%d\n", end, len(cards))
	}

	// Upsert in batches
	fmt.Printf("Upserting %d card vectors to Vectorize...\n", len(allVectors))
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := cfapi.UpsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		fmt.Printf("  Upserted %d/%d\n", end, len(allVectors))
	}

	return nil
}
