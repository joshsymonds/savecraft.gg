package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/joshsymonds/savecraft.gg/plugins/tools/cfapi"
)

// buildImportSQL generates a complete SQL string for bulk import of Comprehensive Rules.
func buildImportSQL(rules []Rule) string {
	var b strings.Builder
	q := cfapi.SQLQuote

	// Clear existing data
	b.WriteString("DELETE FROM mtga_rules_fts;\n")
	b.WriteString("DELETE FROM mtga_rules;\n")

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

	return b.String()
}

// populateVectorize embeds Comprehensive Rules and upserts to Vectorize.
func populateVectorize(accountID, indexName, apiToken string, rules []Rule) error {
	const embeddingBatchSize = 100
	const vectorizeBatchSize = 1000
	const embeddingConcurrency = 6

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

	fmt.Printf("Embedding %d entries...\n", len(entries))

	// Build batches.
	var batches [][]entry
	for i := 0; i < len(entries); i += embeddingBatchSize {
		end := min(i+embeddingBatchSize, len(entries))
		batches = append(batches, entries[i:end])
	}

	// Process embedding batches concurrently with a semaphore.
	results := make([][]cfapi.VectorizeVector, len(batches))
	sem := make(chan struct{}, embeddingConcurrency)
	var mu sync.Mutex
	var firstErr error
	var wg sync.WaitGroup
	completed := 0
	milestones := cfapi.MilestoneSet(len(batches), 1)

	for batchIdx, batch := range batches {
		wg.Add(1)
		go func(idx int, batch []entry) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			// Skip remaining batches if an earlier one failed.
			mu.Lock()
			if firstErr != nil {
				mu.Unlock()
				return
			}
			mu.Unlock()

			texts := make([]string, len(batch))
			for j, e := range batch {
				texts[j] = e.text
			}

			embeddings, err := cfapi.EmbedTextsWithRetry(accountID, apiToken, texts)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch %d: %w", idx, err)
				}
				mu.Unlock()
				return
			}

			if len(embeddings) != len(batch) {
				mu.Lock()
				if firstErr == nil {
					firstErr = fmt.Errorf("embedding batch %d: expected %d embeddings, got %d", idx, len(batch), len(embeddings))
				}
				mu.Unlock()
				return
			}

			vectors := make([]cfapi.VectorizeVector, len(batch))
			for j, e := range batch {
				vectors[j] = cfapi.VectorizeVector{
					ID:       e.id,
					Values:   embeddings[j],
					Metadata: map[string]string{"type": e.metaType},
				}
			}

			mu.Lock()
			results[idx] = vectors
			completed++
			if milestones[completed] {
				pct := completed * 100 / len(batches)
				fmt.Printf("  Embedded %d%% (%d/%d batches)\n", pct, completed, len(batches))
			}
			mu.Unlock()
		}(batchIdx, batch)
	}

	wg.Wait()

	if firstErr != nil {
		return firstErr
	}

	// Flatten results in order.
	var allVectors []cfapi.VectorizeVector
	for _, vecs := range results {
		allVectors = append(allVectors, vecs...)
	}

	fmt.Printf("Upserting %d vectors to Vectorize...\n", len(allVectors))
	upsertBatches := (len(allVectors) + vectorizeBatchSize - 1) / vectorizeBatchSize
	upsertMilestones := cfapi.MilestoneSet(upsertBatches, 1)
	upsertCount := 0
	for i := 0; i < len(allVectors); i += vectorizeBatchSize {
		end := min(i+vectorizeBatchSize, len(allVectors))
		if err := cfapi.UpsertVectors(accountID, indexName, apiToken, allVectors[i:end]); err != nil {
			return fmt.Errorf("vectorize upsert %d-%d: %w", i, end, err)
		}
		upsertCount++
		if upsertMilestones[upsertCount] {
			pct := upsertCount * 100 / upsertBatches
			fmt.Printf("  Upserted %d%% (%d/%d vectors)\n", pct, end, len(allVectors))
		}
	}

	return nil
}
