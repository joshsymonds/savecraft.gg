package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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

	// Append any remaining statements (guard against empty trailing batch)
	if len(current.Statements) > 0 {
		batches = append(batches, current)
	}
	return batches
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// importD1SQL uses the D1 bulk import API to execute a large SQL string.
// Flow: init → upload SQL to R2 → ingest → poll until complete.
func importD1SQL(accountID, databaseID, apiToken, sql string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	importURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/import", accountID, databaseID)

	// Compute MD5 hash of SQL content.
	sqlBytes := []byte(sql)
	etag := fmt.Sprintf("%x", md5.Sum(sqlBytes))

	// Step 1: Init — get upload URL.
	initBody, _ := json.Marshal(map[string]string{"action": "init", "etag": etag})
	initReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(initBody))
	initReq.Header.Set("Authorization", "Bearer "+apiToken)
	initReq.Header.Set("Content-Type", "application/json")

	initResp, err := client.Do(initReq)
	if err != nil {
		return fmt.Errorf("init: %w", err)
	}
	initRespBody, _ := io.ReadAll(initResp.Body)
	initResp.Body.Close()
	if initResp.StatusCode != http.StatusOK {
		return fmt.Errorf("init: HTTP %d: %s", initResp.StatusCode, string(initRespBody[:min(len(initRespBody), 300)]))
	}

	var initResult struct {
		Result struct {
			UploadURL string `json:"upload_url"`
			Filename  string `json:"filename"`
		} `json:"result"`
	}
	if err := json.Unmarshal(initRespBody, &initResult); err != nil {
		return fmt.Errorf("init: decode: %w (body: %s)", err, string(initRespBody[:min(len(initRespBody), 300)]))
	}
	if initResult.Result.UploadURL == "" {
		return fmt.Errorf("init: empty upload_url in response: %s", string(initRespBody[:min(len(initRespBody), 500)]))
	}

	// Step 2: Upload SQL to the temporary R2 URL.
	uploadReq, _ := http.NewRequest("PUT", initResult.Result.UploadURL, bytes.NewReader(sqlBytes))
	uploadResp, err := client.Do(uploadReq)
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	uploadResp.Body.Close()
	if uploadResp.StatusCode != http.StatusOK {
		return fmt.Errorf("upload: HTTP %d", uploadResp.StatusCode)
	}

	// Step 3: Ingest — trigger the import.
	ingestBody, _ := json.Marshal(map[string]string{
		"action":   "ingest",
		"etag":     etag,
		"filename": initResult.Result.Filename,
	})
	ingestReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(ingestBody))
	ingestReq.Header.Set("Authorization", "Bearer "+apiToken)
	ingestReq.Header.Set("Content-Type", "application/json")

	ingestResp, err := client.Do(ingestReq)
	if err != nil {
		return fmt.Errorf("ingest: %w", err)
	}
	ingestRespBody, _ := io.ReadAll(ingestResp.Body)
	ingestResp.Body.Close()
	if ingestResp.StatusCode != http.StatusOK {
		return fmt.Errorf("ingest: HTTP %d: %s", ingestResp.StatusCode, string(ingestRespBody[:min(len(ingestRespBody), 300)]))
	}

	var ingestResult struct {
		Result struct {
			AtBookmark string `json:"at_bookmark"`
		} `json:"result"`
	}
	if err := json.Unmarshal(ingestRespBody, &ingestResult); err != nil {
		return fmt.Errorf("ingest: decode: %w", err)
	}

	// Step 4: Poll until complete.
	bookmark := ingestResult.Result.AtBookmark
	for i := 0; i < 120; i++ { // Max 2 minutes
		time.Sleep(1 * time.Second)

		pollBody, _ := json.Marshal(map[string]string{
			"action":           "poll",
			"current_bookmark": bookmark,
		})
		pollReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(pollBody))
		pollReq.Header.Set("Authorization", "Bearer "+apiToken)
		pollReq.Header.Set("Content-Type", "application/json")

		pollResp, err := client.Do(pollReq)
		if err != nil {
			return fmt.Errorf("poll: %w", err)
		}
		pollRespBody, _ := io.ReadAll(pollResp.Body)
		pollResp.Body.Close()

		var pollResult struct {
			Result struct {
				Success    bool   `json:"success"`
				Error      string `json:"error"`
				NumQueries int    `json:"num_queries"`
			} `json:"result"`
		}
		if err := json.Unmarshal(pollRespBody, &pollResult); err != nil {
			continue
		}

		if pollResult.Result.Success {
			fmt.Printf("  D1 import complete: %d queries executed\n", pollResult.Result.NumQueries)
			return nil
		}
		if pollResult.Result.Error != "" {
			return fmt.Errorf("import failed: %s", pollResult.Result.Error)
		}
	}

	return fmt.Errorf("import timed out after 120s")
}

// buildImportSQL generates a complete SQL string for bulk import.
func buildImportSQL(rules []Rule, cardRulings map[string][]CardRuling, cardNames map[string]string) string {
	var b strings.Builder

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
			seeAlso = sqlQuote(string(j))
		}
		example := "NULL"
		if r.Example != "" {
			example = sqlQuote(r.Example)
		}
		fmt.Fprintf(&b, "INSERT INTO mtga_rules (number, text, example, see_also) VALUES (%s, %s, %s, %s);\n",
			sqlQuote(r.Number), sqlQuote(r.Text), example, seeAlso)
		fmt.Fprintf(&b, "INSERT INTO mtga_rules_fts (number, text, example) VALUES (%s, %s, %s);\n",
			sqlQuote(r.Number), sqlQuote(r.Text), sqlQuote(r.Example))
	}

	// Insert card rulings
	for oracleID, rulingList := range cardRulings {
		cardName, ok := cardNames[oracleID]
		if !ok {
			continue
		}
		for _, r := range rulingList {
			fmt.Fprintf(&b, "INSERT INTO mtga_card_rulings (oracle_id, card_name, published_at, comment) VALUES (%s, %s, %s, %s);\n",
				sqlQuote(oracleID), sqlQuote(cardName), sqlQuote(r.PublishedAt), sqlQuote(r.Comment))
			fmt.Fprintf(&b, "INSERT INTO mtga_card_rulings_fts (oracle_id, card_name, comment) VALUES (%s, %s, %s);\n",
				sqlQuote(oracleID), sqlQuote(cardName), sqlQuote(r.Comment))
		}
	}

	return b.String()
}

// sqlQuote escapes a string for safe SQL embedding (single quotes).
func sqlQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
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

// embedTextsWithRetry wraps embedTexts with retry and exponential backoff.
// Retries up to 2 times with 1s then 2s delays.
func embedTextsWithRetry(accountID, apiToken string, texts []string) ([][]float32, error) {
	backoffs := []time.Duration{1 * time.Second, 2 * time.Second}
	var lastErr error

	result, err := embedTexts(accountID, apiToken, texts)
	if err == nil {
		return result, nil
	}
	lastErr = err

	for _, delay := range backoffs {
		fmt.Printf("  Embedding failed (%v), retrying in %v...\n", lastErr, delay)
		time.Sleep(delay)

		result, err = embedTexts(accountID, apiToken, texts)
		if err == nil {
			return result, nil
		}
		lastErr = err
	}

	return nil, lastErr
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

		embeddings, err := embedTextsWithRetry(accountID, apiToken, texts)
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

// downloadCardNames fetches oracle card names from Scryfall's bulk data API.
// Uses the "oracle_cards" bulk dataset which covers ALL Magic cards (not just Arena).
func downloadCardNames() (map[string]string, error) {
	// Get the oracle cards bulk data URL from Scryfall.
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

	// Stream-parse the JSON array — each entry has oracle_id and name.
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
