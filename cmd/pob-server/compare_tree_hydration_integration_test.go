package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestCompareTreeHydrationOnFixturePair pins that wrapper.lua's
// serializeTreeSummary emits {id, name} objects for each allocated
// passive-tree node, and that the Go-side computeTreeDiff carries
// those names through to both the per-build sections.tree.allocatedNodes
// and diffs.tree.{allocatedOnlyIn, common}. A stub-only test would miss
// a Lua-side rename of the field or a Go decode/contract drift — only
// the real-Lua harness against captured fixtures catches that.
//
// Anchor: the v2-epic LLM friction was specifically that Build A had
// nodes 15027 ("Beef") and 62588 ("Life Mastery") that Build B lacked,
// and the consumer had no way to read those names. This test runs
// against the same canonical fixtures that surfaced that friction;
// the t.Logf calls below dump the resolved names to test output so a
// `go test -run TestCompareTreeHydration -v` invocation grep-greps
// them today. The assertions deliberately don't pin "Beef" or
// "Life Mastery" by string — that would couple the test to PoB's
// tree-data table and break on any future PoB renames. Name-non-empty
// is the durable contract.
//
// Three invariants checked:
//  1. Per-build sections.tree.allocatedNodes is populated for both
//     fixtures and every node carries a non-empty name.
//  2. diffs.tree.common[*].name is non-empty for every common node.
//  3. diffs.tree.allocatedOnlyIn[i][*].name is non-empty for every
//     unique-to-build node, on every successful slot.
//
// Plus a negative assertion: the legacy `allocatedNodeIds` field MUST
// NOT be present anywhere in the response (it's been replaced).
func TestCompareTreeHydrationOnFixturePair(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	idA := srv.cache.Put(readFixture(t, "build_OeN3b-6rvLSM"))
	idB := srv.cache.Put(readFixture(t, "build_AVbLkApuCqI9"))

	resp := postCompareTreeHydration(t, ts, []string{idA, idB})

	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d", len(resp.Builds))
	}

	// Invariant 1: per-build tree section carries name-populated
	// allocatedNodes. The "tree" section aggregates both `tree` and
	// `keystones` keys per the section taxonomy in handler.go; the
	// node hydration lives under tree.allocatedNodes.
	for i, b := range resp.Builds {
		if b.Error != "" {
			t.Fatalf("build[%d] %q errored: %s", i, b.Label, b.Error)
		}
		if b.Sections == nil {
			t.Fatalf("build[%d] %q missing Sections (requested tree)", i, b.Label)
		}
		treeRaw, ok := b.Sections["tree"]
		if !ok {
			keys := make([]string, 0, len(b.Sections))
			for k := range b.Sections {
				keys = append(keys, k)
			}
			t.Fatalf("build[%d] %q missing Sections[\"tree\"]; keys=%v", i, b.Label, keys)
		}
		nodes := decodeTreeAllocatedNodes(t, treeRaw)
		if len(nodes) == 0 {
			t.Fatalf("build[%d] %q: no allocatedNodes under sections.tree (raw: %s)",
				i, b.Label, treeRaw)
		}
		// Every node carries a non-empty name. PoB's `node.dn` (display
		// name) is the source of truth; the wrapper.lua fallback chain
		// (dn → name → tostring(id)) ensures something always lands.
		for j, n := range nodes {
			if n.Name == "" {
				t.Errorf("build[%d] %q: allocatedNodes[%d] (id=%d) has empty name",
					i, b.Label, j, n.ID)
			}
		}
		t.Logf("build[%d] %q: %d allocated nodes, e.g. %+v",
			i, b.Label, len(nodes), firstFewNodes(nodes, 3))

		// Negative: legacy allocatedNodeIds must not be present.
		var legacy struct {
			Tree struct {
				AllocatedNodeIDs json.RawMessage `json:"allocatedNodeIds"`
			} `json:"tree"`
		}
		var legacyFlat struct {
			AllocatedNodeIDs json.RawMessage `json:"allocatedNodeIds"`
		}
		_ = json.Unmarshal(treeRaw, &legacy)
		_ = json.Unmarshal(treeRaw, &legacyFlat)
		if len(legacy.Tree.AllocatedNodeIDs) > 0 || len(legacyFlat.AllocatedNodeIDs) > 0 {
			t.Errorf(
				"build[%d] %q: legacy `allocatedNodeIds` field still present in sections.tree (raw: %s)",
				i, b.Label, treeRaw,
			)
		}
	}

	// Invariants 2 + 3: diff carries hydrated names too.
	if resp.Diffs == nil {
		t.Fatalf("expected diffs to be present, got nil")
	}
	if resp.Diffs.Tree == nil {
		t.Fatalf("expected diffs.tree, got nil — both fixtures should have allocated trees")
	}
	for i, n := range resp.Diffs.Tree.Common {
		if n.Name == "" {
			t.Errorf("diffs.tree.common[%d] (id=%d): empty name", i, n.ID)
		}
	}
	t.Logf("diffs.tree.common: %d nodes, e.g. %+v",
		len(resp.Diffs.Tree.Common), firstFewNodes(resp.Diffs.Tree.Common, 3))
	for i, slot := range resp.Diffs.Tree.AllocatedOnlyIn {
		for j, n := range slot {
			if n.Name == "" {
				t.Errorf("diffs.tree.allocatedOnlyIn[%d][%d] (id=%d): empty name",
					i, j, n.ID)
			}
		}
		t.Logf("diffs.tree.allocatedOnlyIn[%d]: %d nodes, e.g. %+v",
			i, len(slot), firstFewNodes(slot, 3))
	}
}

// compareRespTreeHydration decodes the /compare body with both the
// per-build Sections map and the tree diff. Local to this test so it
// doesn't fight with other integration tests' decode shapes.
type compareRespTreeHydration struct {
	Builds []struct {
		Label    string                     `json:"label"`
		Error    string                     `json:"error,omitempty"`
		Sections map[string]json.RawMessage `json:"sections,omitempty"`
	} `json:"builds"`
	Diffs *struct {
		Tree *struct {
			AllocatedOnlyIn [][]allocatedNodeOnWire `json:"allocatedOnlyIn"`
			Common          []allocatedNodeOnWire   `json:"common"`
		} `json:"tree,omitempty"`
	} `json:"diffs,omitempty"`
}

// postCompareTreeHydration issues a /compare?sections=tree call and
// decodes into the local hydration-aware shape. Direct HTTP rather
// than reusing postCompareWithQuery because that helper's response
// shape doesn't expose diffs.tree (it's owned by other integration
// tests and hard-codes Skills + Gear).
func postCompareTreeHydration(t *testing.T, ts *httptest.Server, ids []string) *compareRespTreeHydration {
	t.Helper()
	body, err := json.Marshal(map[string]any{"builds": ids})
	if err != nil {
		t.Fatal(err)
	}
	httpResp, err := http.Post(ts.URL+"/compare?sections=tree", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /compare: %v", err)
	}
	defer httpResp.Body.Close()
	respBody, _ := io.ReadAll(httpResp.Body)
	if httpResp.StatusCode != http.StatusOK {
		t.Fatalf("POST /compare: expected 200, got %d: %s", httpResp.StatusCode, respBody)
	}
	var decoded compareRespTreeHydration
	if err := json.Unmarshal(respBody, &decoded); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, respBody)
	}
	return &decoded
}

// decodeTreeAllocatedNodes walks Sections["tree"] for the per-build
// shape. Section "tree" aggregates {tree, keystones} per the section
// taxonomy in handler.go. Try composite first; fall back to flat.
func decodeTreeAllocatedNodes(t *testing.T, treeRaw json.RawMessage) []allocatedNodeOnWire {
	t.Helper()
	var section struct {
		Tree struct {
			AllocatedNodes []allocatedNodeOnWire `json:"allocatedNodes"`
		} `json:"tree"`
	}
	if err := json.Unmarshal(treeRaw, &section); err == nil && len(section.Tree.AllocatedNodes) > 0 {
		return section.Tree.AllocatedNodes
	}
	var flat struct {
		AllocatedNodes []allocatedNodeOnWire `json:"allocatedNodes"`
	}
	if err := json.Unmarshal(treeRaw, &flat); err != nil {
		t.Fatalf("decode tree section: %v\nraw: %s", err, treeRaw)
	}
	return flat.AllocatedNodes
}

// firstFewNodes returns the first n entries of an allocatedNode slice
// for diagnostic logging.
func firstFewNodes(s []allocatedNodeOnWire, n int) []allocatedNodeOnWire {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
