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

// sqlQuote escapes a string for safe SQL embedding (single quotes).
func sqlQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

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

		// Structured table
		fmt.Fprintf(&b, "INSERT INTO mtga_cards (arena_id, oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity, legalities, rarity, set_code, keywords) VALUES (%d, %s, %s, %s, %g, %s, %s, %s, %s, %s, %s, %s, %s);\n",
			c.ArenaID,
			sqlQuote(c.OracleID),
			sqlQuote(c.Name),
			sqlQuote(c.ManaCost),
			c.CMC,
			sqlQuote(c.TypeLine),
			sqlQuote(c.OracleText),
			sqlQuote(colorsJSON),
			sqlQuote(colorIdentityJSON),
			sqlQuote(legalitiesJSON),
			sqlQuote(c.Rarity),
			sqlQuote(c.Set),
			sqlQuote(keywordsJSON),
		)

		// FTS5 table
		fmt.Fprintf(&b, "INSERT INTO mtga_cards_fts (arena_id, name, oracle_text, type_line) VALUES (%d, %s, %s, %s);\n",
			c.ArenaID,
			sqlQuote(c.Name),
			sqlQuote(c.OracleText),
			sqlQuote(c.TypeLine),
		)
	}

	return b.String()
}

// importD1SQL uses the D1 bulk import API to execute a large SQL string.
// Flow: init → upload SQL to R2 → ingest → poll until complete.
func importD1SQL(accountID, databaseID, apiToken, sql string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	importURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/import", accountID, databaseID)

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
		return fmt.Errorf("init: decode: %w", err)
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
	for i := 0; i < 120; i++ {
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

// populateCardVectorize embeds all cards and upserts to Vectorize.
func populateCardVectorize(accountID, indexName, apiToken string, cards []ScryfallCard) error {
	const embeddingBatchSize = 50
	const vectorizeBatchSize = 1000

	fmt.Printf("Embedding %d cards...\n", len(cards))

	var allVectors []VectorizeVector
	for i := 0; i < len(cards); i += embeddingBatchSize {
		end := min(i+embeddingBatchSize, len(cards))
		batch := cards[i:end]

		texts := make([]string, len(batch))
		for j, c := range batch {
			texts[j] = cardEmbeddingText(c)
		}

		embeddings, err := embedTextsWithRetry(accountID, apiToken, texts)
		if err != nil {
			return fmt.Errorf("embedding batch %d-%d: %w", i, end, err)
		}

		if len(embeddings) != len(batch) {
			return fmt.Errorf("embedding batch %d-%d: expected %d embeddings, got %d", i, end, len(batch), len(embeddings))
		}

		for j, c := range batch {
			allVectors = append(allVectors, VectorizeVector{
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
		if err := upsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		fmt.Printf("  Upserted %d/%d\n", end, len(allVectors))
	}

	return nil
}
