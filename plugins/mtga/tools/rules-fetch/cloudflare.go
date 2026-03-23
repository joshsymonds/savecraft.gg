package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/mtga/tools/internal/cfapi"
)

// buildImportSQL generates a complete SQL string for bulk import.
func buildImportSQL(rules []Rule, cardRulings map[string][]CardRuling, cardNames map[string]string) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Clear existing data
	b.WriteString("DELETE FROM mtga_rules_fts;\n")
	b.WriteString("DELETE FROM mtga_card_rulings_fts;\n")
	b.WriteString("DELETE FROM mtga_rules;\n")
	b.WriteString("DELETE FROM mtga_card_rulings;\n")

	// Insert rules
	for _, r := range rules {
		seeAlso := "NULL"
		if len(r.SeeAlso) > 0 {
			j, _ := json.Marshal(r.SeeAlso)
			seeAlso = q(string(j))
		}
		example := "NULL"
		if r.Example != "" {
			example = q(r.Example)
		}
		fmt.Fprintf(&b, "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (%s, %s, %s, %s);\n",
			q(r.Number), q(r.Text), example, seeAlso)
		fmt.Fprintf(&b, "INSERT INTO mtga_rules_fts (number, text, example) VALUES (%s, %s, %s);\n",
			q(r.Number), q(r.Text), q(r.Example))
	}

	// Insert card rulings
	for oracleID, rulingList := range cardRulings {
		cardName, ok := cardNames[oracleID]
		if !ok {
			continue
		}
		for _, r := range rulingList {
			fmt.Fprintf(&b, "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (%s, %s, %s, %s);\n",
				q(oracleID), q(cardName), q(r.PublishedAt), q(r.Comment))
			fmt.Fprintf(&b, "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (%s, %s, %s);\n",
				q(oracleID), q(cardName), q(r.Comment))
		}
	}

	return b.String()
}

// populateVectorize embeds all rules and card rulings, then upserts to Vectorize.
func populateVectorize(accountID, indexName, apiToken string, rules []Rule, cardRulings map[string][]CardRuling, cardNames map[string]string) error {
	const embeddingBatchSize = 50
	const vectorizeBatchSize = 1000

	type entry struct {
		id       string
		text     string
		metaType string
	}
	var entries []entry

	for _, r := range rules {
		text := r.Text
		if r.Example != "" {
			text += " " + r.Example
		}
		entries = append(entries, entry{id: r.Number, text: text, metaType: "rule"})
	}

	for oracleID, rulings := range cardRulings {
		name, ok := cardNames[oracleID]
		if !ok {
			continue
		}
		var combined []string
		combined = append(combined, name)
		for _, r := range rulings {
			combined = append(combined, r.Comment)
		}
		text := fmt.Sprintf("%s: %s", name, joinShort(combined[1:], " | "))
		entries = append(entries, entry{id: "card:" + oracleID, text: text, metaType: "card_ruling"})
	}

	fmt.Printf("Embedding %d entries...\n", len(entries))

	var allVectors []cfapi.VectorizeVector
	for i := 0; i < len(entries); i += embeddingBatchSize {
		end := min(i+embeddingBatchSize, len(entries))
		batch := entries[i:end]

		texts := make([]string, len(batch))
		for j, e := range batch {
			texts[j] = e.text
		}

		embeddings, err := cfapi.EmbedTextsWithRetry(accountID, apiToken, texts)
		if err != nil {
			return fmt.Errorf("embedding batch %d-%d: %w", i, end, err)
		}

		if len(embeddings) != len(batch) {
			return fmt.Errorf("embedding batch %d-%d: expected %d embeddings, got %d", i, end, len(batch), len(embeddings))
		}

		for j, e := range batch {
			allVectors = append(allVectors, cfapi.VectorizeVector{
				ID:       e.id,
				Values:   embeddings[j],
				Metadata: map[string]string{"type": e.metaType},
			})
		}

		fmt.Printf("  Embedded %d/%d\n", end, len(entries))
	}

	fmt.Printf("Upserting %d vectors to Vectorize...\n", len(allVectors))
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := cfapi.UpsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		fmt.Printf("  Upserted %d/%d\n", end, len(allVectors))
	}

	return nil
}

func joinShort(parts []string, sep string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += sep
		}
		result += p
		if len(result) > 500 {
			break
		}
	}
	return result
}

// downloadCardNames fetches oracle card names from Scryfall's bulk data API.
func downloadCardNames() (map[string]string, error) {
	resp, err := httpGet("https://api.scryfall.com/bulk-data")
	if err != nil {
		return nil, fmt.Errorf("fetching bulk-data index: %w", err)
	}
	defer resp.Body.Close()

	var bulk struct {
		Data []struct {
			Type        string `json:"type"`
			DownloadURI string `json:"download_uri"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&bulk); err != nil {
		return nil, err
	}

	var downloadURL string
	for _, d := range bulk.Data {
		if d.Type == "oracle_cards" {
			downloadURL = d.DownloadURI
			break
		}
	}
	if downloadURL == "" {
		return nil, fmt.Errorf("oracle_cards bulk data not found")
	}
	if !strings.HasPrefix(downloadURL, "https://data.scryfall.io/") {
		return nil, fmt.Errorf("unexpected oracle cards download URL: %s", downloadURL)
	}

	fmt.Printf("Downloading oracle card names from %s...\n", downloadURL)
	resp2, err := httpGet(downloadURL)
	if err != nil {
		return nil, err
	}
	defer resp2.Body.Close()

	dec := json.NewDecoder(resp2.Body)
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return nil, fmt.Errorf("expected '[', got %v", tok)
	}

	names := make(map[string]string)
	for dec.More() {
		var card struct {
			OracleID string `json:"oracle_id"`
			Name     string `json:"name"`
		}
		if err := dec.Decode(&card); err != nil {
			continue
		}
		if card.OracleID != "" && card.Name != "" {
			names[card.OracleID] = card.Name
		}
	}

	fmt.Printf("Card name mapping: %d cards (all of Magic)\n", len(names))
	return names, nil
}

