package cfapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// VectorizeVector is a vector to upsert into Vectorize.
type VectorizeVector struct {
	ID       string            `json:"id"`
	Values   []float32         `json:"values"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// EmbedTexts calls Workers AI to compute embeddings for a batch of texts.
func EmbedTexts(accountID, apiToken string, texts []string) ([][]float32, error) {
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

// EmbedTextsWithRetry wraps EmbedTexts with retry and exponential backoff.
func EmbedTextsWithRetry(accountID, apiToken string, texts []string) ([][]float32, error) {
	backoffs := []time.Duration{1 * time.Second, 2 * time.Second}
	var lastErr error

	result, err := EmbedTexts(accountID, apiToken, texts)
	if err == nil {
		return result, nil
	}
	lastErr = err

	for _, delay := range backoffs {
		fmt.Printf("  Embedding failed (%v), retrying in %v...\n", lastErr, delay)
		time.Sleep(delay)

		result, err = EmbedTexts(accountID, apiToken, texts)
		if err == nil {
			return result, nil
		}
		lastErr = err
	}

	return nil, lastErr
}

// UpsertVectors upserts a batch of vectors to Vectorize.
func UpsertVectors(accountID, indexName, apiToken string, vectors []VectorizeVector) error {
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
