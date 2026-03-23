package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// D1 batch query types matching the Cloudflare D1 HTTP API.

// D1Statement is a single SQL statement with parameters.
type D1Statement struct {
	SQL    string `json:"sql"`
	Params []any  `json:"params,omitempty"`
}

// D1Batch is a batch of SQL statements to execute atomically.
type D1Batch struct {
	Statements []D1Statement
}

const d1BatchSize = 50 // rules per batch (each rule = 2 statements, so 100 statements/batch)

func buildRuleInsertBatches(rules []Rule, batchSize int) []D1Batch {
	var batches []D1Batch
	var current D1Batch

	for i, r := range rules {
		// see_also as JSON array or null
		var seeAlsoJSON any
		if len(r.SeeAlso) > 0 {
			b, _ := json.Marshal(r.SeeAlso)
			seeAlsoJSON = string(b)
		}

		// Structured table
		current.Statements = append(current.Statements, D1Statement{
			SQL:    "INSERT OR REPLACE INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)",
			Params: []any{r.Number, r.Text, nilIfEmpty(r.Example), seeAlsoJSON},
		})

		// FTS5 table
		current.Statements = append(current.Statements, D1Statement{
			SQL:    "INSERT INTO mtga_rules_fts (number, text, example) VALUES (?, ?, ?)",
			Params: []any{r.Number, r.Text, r.Example},
		})

		if (i+1)%batchSize == 0 || i == len(rules)-1 {
			batches = append(batches, current)
			current = D1Batch{}
		}
	}
	return batches
}

func buildCardRulingInsertBatches(rulings map[string][]CardRuling, cardNames map[string]string, batchSize int) []D1Batch {
	var batches []D1Batch
	var current D1Batch
	count := 0

	for oracleID, rulingList := range rulings {
		cardName, ok := cardNames[oracleID]
		if !ok {
			continue // Skip rulings for cards we don't have a name for
		}

		for _, r := range rulingList {
			// Structured table
			current.Statements = append(current.Statements, D1Statement{
				SQL:    "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (?, ?, ?, ?)",
				Params: []any{oracleID, cardName, r.PublishedAt, r.Comment},
			})

			// FTS5 table
			current.Statements = append(current.Statements, D1Statement{
				SQL:    "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (?, ?, ?)",
				Params: []any{oracleID, cardName, r.Comment},
			})

			count++
			if count%batchSize == 0 {
				batches = append(batches, current)
				current = D1Batch{}
			}
		}
	}

	// Append any remaining statements
	batches = append(batches, current)
	return batches
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// executeD1Batches sends batches of SQL statements to the D1 HTTP API.
func executeD1Batches(accountID, databaseID, apiToken string, batches []D1Batch) error {
	client := &http.Client{Timeout: 2 * time.Minute}
	baseURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query", accountID, databaseID)

	for i, batch := range batches {
		if len(batch.Statements) == 0 {
			continue
		}

		body, err := json.Marshal(batch.Statements)
		if err != nil {
			return fmt.Errorf("batch %d: marshal: %w", i, err)
		}

		req, err := http.NewRequest("POST", baseURL, bytes.NewReader(body))
		if err != nil {
			return fmt.Errorf("batch %d: new request: %w", i, err)
		}
		req.Header.Set("Authorization", "Bearer "+apiToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("batch %d: http: %w", i, err)
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("batch %d: HTTP %d: %s", i, resp.StatusCode, string(respBody[:min(len(respBody), 300)]))
		}

		var result struct {
			Success bool `json:"success"`
			Errors  []struct {
				Message string `json:"message"`
			} `json:"errors"`
		}
		if err := json.Unmarshal(respBody, &result); err == nil && !result.Success {
			msg := "unknown error"
			if len(result.Errors) > 0 {
				msg = result.Errors[0].Message
			}
			return fmt.Errorf("batch %d: D1 error: %s", i, msg)
		}
	}

	return nil
}

// clearD1Tables truncates the rules tables before repopulating.
func clearD1Tables(accountID, databaseID, apiToken string) error {
	stmts := []D1Statement{
		{SQL: "DELETE FROM mtga_rules_fts"},
		{SQL: "DELETE FROM mtga_card_rulings_fts"},
		{SQL: "DELETE FROM mtga_rules"},
		{SQL: "DELETE FROM mtga_card_rulings"},
	}
	return executeD1Batches(accountID, databaseID, apiToken, []D1Batch{{Statements: stmts}})
}

// ── Vectorize ────────────────────────────────────────────────

// VectorizeVector is a vector to upsert into Vectorize.
type VectorizeVector struct {
	ID       string            `json:"id"`
	Values   []float32         `json:"values"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// embedTexts calls Workers AI to compute embeddings for a batch of texts.
func embedTexts(accountID, apiToken string, texts []string) ([][]float32, error) {
	client := &http.Client{Timeout: 2 * time.Minute}
	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/baai/bge-base-en-v1.5", accountID)

	body, err := json.Marshal(map[string]any{"text": texts})
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Workers AI HTTP %d: %s", resp.StatusCode, string(respBody[:min(len(respBody), 300)]))
	}

	var result struct {
		Result struct {
			Data [][]float32 `json:"data"`
		} `json:"result"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode embedding response: %w", err)
	}

	return result.Result.Data, nil
}

// upsertVectors upserts a batch of vectors to Vectorize.
func upsertVectors(accountID, indexName, apiToken string, vectors []VectorizeVector) error {
	client := &http.Client{Timeout: 2 * time.Minute}
	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/vectorize/v2/indexes/%s/upsert", accountID, indexName)

	// Vectorize upsert expects ndjson
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, v := range vectors {
		if err := enc.Encode(v); err != nil {
			return fmt.Errorf("encode vector: %w", err)
		}
	}

	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/x-ndjson")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Vectorize HTTP %d: %s", resp.StatusCode, string(respBody[:min(len(respBody), 300)]))
	}

	return nil
}

// populateVectorize embeds all rules and card rulings, then upserts to Vectorize.
func populateVectorize(accountID, indexName, apiToken string, rules []Rule, cardRulings map[string][]CardRuling, cardNames map[string]string) error {
	const embeddingBatchSize = 50
	const vectorizeBatchSize = 1000

	// Collect all texts + IDs for embedding
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
		// Combine all rulings for a card into one embedding
		var combined []string
		combined = append(combined, name)
		for _, r := range rulings {
			combined = append(combined, r.Comment)
		}
		text := fmt.Sprintf("%s: %s", name, joinShort(combined[1:], " | "))
		entries = append(entries, entry{id: "card:" + oracleID, text: text, metaType: "card_ruling"})
	}

	fmt.Printf("Embedding %d entries...\n", len(entries))

	// Embed in batches
	var allVectors []VectorizeVector
	for i := 0; i < len(entries); i += embeddingBatchSize {
		end := min(i+embeddingBatchSize, len(entries))
		batch := entries[i:end]

		texts := make([]string, len(batch))
		for j, e := range batch {
			texts[j] = e.text
		}

		embeddings, err := embedTexts(accountID, apiToken, texts)
		if err != nil {
			return fmt.Errorf("embedding batch %d-%d: %w", i, end, err)
		}

		if len(embeddings) != len(batch) {
			return fmt.Errorf("embedding batch %d-%d: expected %d embeddings, got %d", i, end, len(batch), len(embeddings))
		}

		for j, e := range batch {
			allVectors = append(allVectors, VectorizeVector{
				ID:       e.id,
				Values:   embeddings[j],
				Metadata: map[string]string{"type": e.metaType},
			})
		}

		fmt.Printf("  Embedded %d/%d\n", end, len(entries))
	}

	// Upsert in batches
	fmt.Printf("Upserting %d vectors to Vectorize...\n", len(allVectors))
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := upsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
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
		// Cap at ~500 chars to stay within embedding model's useful range
		if len(result) > 500 {
			break
		}
	}
	return result
}

// loadCardNames reads cards.json and builds an oracle_id → card name map.
func loadCardNames(cardsPath string) (map[string]string, error) {
	type cardEntry struct {
		OracleID string `json:"oracleId"`
		Name     string `json:"name"`
	}

	data, err := os.ReadFile(cardsPath)
	if err != nil {
		return nil, fmt.Errorf("reading cards.json: %w", err)
	}

	var cards []cardEntry
	if err := json.Unmarshal(data, &cards); err != nil {
		return nil, fmt.Errorf("parsing cards.json: %w", err)
	}

	names := make(map[string]string, len(cards))
	for _, c := range cards {
		if c.OracleID != "" && c.Name != "" {
			names[c.OracleID] = c.Name
		}
	}
	return names, nil
}
