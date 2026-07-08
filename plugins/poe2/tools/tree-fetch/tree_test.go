package main

import (
	"os"
	"path/filepath"
	"testing"
)

func loadSampleData(t *testing.T) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "sample-data.json"))
	if err != nil {
		t.Fatalf("reading sample-data.json: %v", err)
	}
	return data
}

func TestParseTreeData(t *testing.T) {
	nodes, err := parseTreeData(loadSampleData(t))
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	// sample-data.json has 7 raw node entries: "root" (no skill/name) and
	// node 41311 (empty name) must be skipped — 5 real nodes remain.
	if len(nodes) != 5 {
		t.Fatalf("expected 5 nodes, got %d: %+v", len(nodes), nodes)
	}

	byHash := make(map[int]PassiveNode, len(nodes))
	for _, n := range nodes {
		byHash[n.Hash] = n
	}

	for _, hash := range []int{41311} {
		if _, ok := byHash[hash]; ok {
			t.Errorf("expected unnamed node %d to be skipped", hash)
		}
	}

	keystone, ok := byHash[18684]
	if !ok {
		t.Fatal("keystone node 18684 not found")
	}
	if keystone.Name != "Avatar of Fire" {
		t.Errorf("keystone name: got %q", keystone.Name)
	}
	if !keystone.IsKeystone {
		t.Error("expected IsKeystone")
	}
	if keystone.IsNotable || keystone.IsMastery {
		t.Error("keystone should not also be notable/mastery")
	}
	if keystone.AscendancyName != "" {
		t.Errorf("keystone ascendancy: got %q, want empty", keystone.AscendancyName)
	}
	if len(keystone.Stats) != 1 || keystone.Stats[0] != "75% of Damage Converted to Fire Damage\nDeal no Non-Fire Damage" {
		t.Errorf("keystone stats: got %+v", keystone.Stats)
	}

	mastery, ok := byHash[58058]
	if !ok {
		t.Fatal("mastery node 58058 not found")
	}
	if mastery.Name != "Bow Mastery" {
		t.Errorf("mastery name: got %q", mastery.Name)
	}
	if !mastery.IsMastery {
		t.Error("expected IsMastery")
	}

	notable, ok := byHash[17894]
	if !ok {
		t.Fatal("notable node 17894 not found")
	}
	if notable.Name != "Her Final Bite" {
		t.Errorf("notable name: got %q", notable.Name)
	}
	if !notable.IsNotable {
		t.Error("expected IsNotable")
	}

	small, ok := byHash[47175]
	if !ok {
		t.Fatal("small node 47175 not found")
	}
	if small.Name != "MARAUDER" {
		t.Errorf("small name: got %q", small.Name)
	}
	if small.IsNotable || small.IsKeystone || small.IsMastery {
		t.Error("class-start node should not be notable/keystone/mastery")
	}

	// This is the ascendancy-resolution case: node 25092 has
	// ascendancyId "Druid1" in the raw export, which must be resolved
	// via the "classes" array to the display name "Oracle".
	ascNode, ok := byHash[25092]
	if !ok {
		t.Fatal("ascendancy-scoped node 25092 not found")
	}
	if ascNode.AscendancyName != "Oracle" {
		t.Errorf("ascendancy resolution: got %q, want %q", ascNode.AscendancyName, "Oracle")
	}
	if len(ascNode.Stats) != 1 {
		t.Errorf("ascendancy node stats: got %+v", ascNode.Stats)
	}
}

func TestParseTreeDataDeterministicOrder(t *testing.T) {
	data := loadSampleData(t)

	first, err := parseTreeData(data)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}
	second, err := parseTreeData(data)
	if err != nil {
		t.Fatalf("parse error: %v", err)
	}

	if len(first) != len(second) {
		t.Fatalf("length mismatch across runs: %d vs %d", len(first), len(second))
	}
	for i := range first {
		if first[i].Hash != second[i].Hash {
			t.Fatalf("non-deterministic order at index %d: %d vs %d", i, first[i].Hash, second[i].Hash)
		}
	}
	for i := 1; i < len(first); i++ {
		if first[i].Hash < first[i-1].Hash {
			t.Fatalf("expected ascending hash order, got %d before %d", first[i-1].Hash, first[i].Hash)
		}
	}
}

func TestParseTreeDataInvalidJSON(t *testing.T) {
	if _, err := parseTreeData([]byte("not json")); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}
