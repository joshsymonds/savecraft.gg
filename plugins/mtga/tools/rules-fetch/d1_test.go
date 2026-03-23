package main

import (
	"encoding/json"
	"testing"
)

func TestBuildRuleInsertBatches(t *testing.T) {
	rules := []Rule{
		{Number: "100.1", Text: "This is rule 100.1", Example: "Example: foo", SeeAlso: []string{"200.1"}},
		{Number: "100.2", Text: "This is rule 100.2"},
	}

	batches := buildRuleInsertBatches(rules, 2)
	if len(batches) != 1 {
		t.Fatalf("expected 1 batch, got %d", len(batches))
	}
	batch := batches[0]
	if len(batch.Statements) != 4 { // 2 rules × (1 mtga_rules + 1 mtga_rules_fts)
		t.Fatalf("expected 4 statements, got %d", len(batch.Statements))
	}

	// Check first rule insert
	stmt := batch.Statements[0]
	if stmt.SQL != "INSERT OR REPLACE INTO mtga_rules (number, text, example, see_also) VALUES (?, ?, ?, ?)" {
		t.Errorf("unexpected SQL: %s", stmt.SQL)
	}
	if stmt.Params[0] != "100.1" {
		t.Errorf("expected rule number 100.1, got %v", stmt.Params[0])
	}
	// see_also should be JSON array
	seeAlso := stmt.Params[3].(string)
	var refs []string
	if err := json.Unmarshal([]byte(seeAlso), &refs); err != nil {
		t.Errorf("see_also not valid JSON: %v", err)
	}
	if len(refs) != 1 || refs[0] != "200.1" {
		t.Errorf("expected [\"200.1\"], got %v", refs)
	}
}

func TestBuildRuleInsertBatchesSplitting(t *testing.T) {
	// 5 rules with batch size 2 → 3 batches (2+2+1)
	rules := make([]Rule, 5)
	for i := range rules {
		rules[i] = Rule{Number: "100." + string(rune('1'+i)), Text: "rule text"}
	}

	batches := buildRuleInsertBatches(rules, 2)
	if len(batches) != 3 {
		t.Fatalf("expected 3 batches, got %d", len(batches))
	}
	// First batch: 2 rules × 2 statements = 4
	if len(batches[0].Statements) != 4 {
		t.Errorf("batch 0: expected 4 statements, got %d", len(batches[0].Statements))
	}
	// Last batch: 1 rule × 2 statements = 2
	if len(batches[2].Statements) != 2 {
		t.Errorf("batch 2: expected 2 statements, got %d", len(batches[2].Statements))
	}
}

func TestBuildCardRulingInsertBatches(t *testing.T) {
	rulings := map[string][]CardRuling{
		"oracle-a": {
			{OracleID: "oracle-a", PublishedAt: "2025-01-01", Comment: "Ruling 1"},
			{OracleID: "oracle-a", PublishedAt: "2025-02-01", Comment: "Ruling 2"},
		},
		"oracle-b": {
			{OracleID: "oracle-b", PublishedAt: "2025-03-01", Comment: "Ruling 3"},
		},
	}
	cardNames := map[string]string{
		"oracle-a": "Sheoldred, the Apocalypse",
		"oracle-b": "Lightning Bolt",
	}

	batches := buildCardRulingInsertBatches(rulings, cardNames, 10)
	if len(batches) != 1 {
		t.Fatalf("expected 1 batch, got %d", len(batches))
	}
	// 3 rulings × 2 (table + fts) = 6 statements
	if len(batches[0].Statements) != 6 {
		t.Fatalf("expected 6 statements, got %d", len(batches[0].Statements))
	}

	// Verify card name is included
	found := false
	for _, stmt := range batches[0].Statements {
		for _, p := range stmt.Params {
			if s, ok := p.(string); ok && s == "Sheoldred, the Apocalypse" {
				found = true
			}
		}
	}
	if !found {
		t.Error("card name 'Sheoldred, the Apocalypse' not found in statements")
	}
}

func TestBuildCardRulingSkipsMissingNames(t *testing.T) {
	rulings := map[string][]CardRuling{
		"oracle-x": {
			{OracleID: "oracle-x", PublishedAt: "2025-01-01", Comment: "Ruling"},
		},
	}
	// Empty card names — oracle-x has no name mapping
	cardNames := map[string]string{}

	batches := buildCardRulingInsertBatches(rulings, cardNames, 10)
	// All rulings skipped (no card name), so no batches produced
	if len(batches) != 0 {
		t.Fatalf("expected 0 batches, got %d", len(batches))
	}
}
