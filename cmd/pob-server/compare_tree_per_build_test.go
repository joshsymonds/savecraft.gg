package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// compareRespWithPerBuildTree decodes /compare with the
// builds[i].tree.allocatedNodes field — {id, name} objects per node so
// the LLM consumer can read tree state without a node-name lookup.
type compareRespWithPerBuildTree struct {
	Builds []struct {
		ID    string `json:"id"`
		Label string `json:"label"`
		Tree  *struct {
			AllocatedNodes []allocatedNodeOnWire `json:"allocatedNodes"`
		} `json:"tree"`
		Error string `json:"error"`
	} `json:"builds"`
}

// TestCompareExposesPerBuildAllocatedNodes: each successful build's
// allocated node set lands on the wire under tree.allocatedNodes as
// {id, name} objects. This is what build-compare.svelte consumes
// (extracting .id for the visual passive-tree overlay) and what the
// LLM consumer reads for tree narration without a node-name lookup.
func TestCompareExposesPerBuildAllocatedNodes(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithTree("Witch", []int{1001, 1002, 1003, 1004}),
		calcResponseWithTree("Marauder", []int{2001, 2002, 2003}),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var resp compareRespWithPerBuildTree
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, rec.Body.String())
	}
	if len(resp.Builds) != 2 {
		t.Fatalf("expected 2 builds, got %d", len(resp.Builds))
	}

	for i, b := range resp.Builds {
		if b.Tree == nil {
			t.Fatalf("build[%d] missing tree field", i)
		}
		if len(b.Tree.AllocatedNodes) == 0 {
			t.Fatalf("build[%d] tree.allocatedNodes is empty", i)
		}
	}

	// Build A should have its 4 allocated nodes; B should have its 3.
	wantA := []allocatedNodeOnWire{
		{ID: 1001, Name: "Node-1001"},
		{ID: 1002, Name: "Node-1002"},
		{ID: 1003, Name: "Node-1003"},
		{ID: 1004, Name: "Node-1004"},
	}
	wantB := []allocatedNodeOnWire{
		{ID: 2001, Name: "Node-2001"},
		{ID: 2002, Name: "Node-2002"},
		{ID: 2003, Name: "Node-2003"},
	}
	if !reflect.DeepEqual(resp.Builds[0].Tree.AllocatedNodes, wantA) {
		t.Errorf("build[0] allocatedNodes = %+v, want %+v", resp.Builds[0].Tree.AllocatedNodes, wantA)
	}
	if !reflect.DeepEqual(resp.Builds[1].Tree.AllocatedNodes, wantB) {
		t.Errorf("build[1] allocatedNodes = %+v, want %+v", resp.Builds[1].Tree.AllocatedNodes, wantB)
	}
}

// TestCompareTreeOmittedWhenNoAllocations: a build whose response had
// zero allocated nodes (e.g. an empty XML or fresh character) should
// have tree omitted from the wire (omitempty kicks in).
func TestCompareTreeOmittedWhenNoAllocations(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		minimalCalcResponseClass("Witch", 100000),    // no tree section
		minimalCalcResponseClass("Marauder", 200000), // no tree section
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	// Walk the raw response — Tree pointer should literally be absent
	// from the JSON envelope, not just nil-decoded.
	var raw map[string]json.RawMessage
	_ = json.Unmarshal(rec.Body.Bytes(), &raw)
	var builds []map[string]json.RawMessage
	_ = json.Unmarshal(raw["builds"], &builds)
	for i, b := range builds {
		if _, present := b["tree"]; present {
			t.Errorf("build[%d] should omit tree field when no allocations; got %s", i, string(b["tree"]))
		}
	}
}
