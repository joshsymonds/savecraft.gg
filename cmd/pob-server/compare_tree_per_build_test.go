package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// compareRespWithPerBuildTree decodes /compare with the new
// builds[i].tree.allocatedNodeIds field.
type compareRespWithPerBuildTree struct {
	Builds []struct {
		ID    string `json:"id"`
		Label string `json:"label"`
		Tree  *struct {
			AllocatedNodeIDs []int `json:"allocatedNodeIds"`
		} `json:"tree"`
		Error string `json:"error"`
	} `json:"builds"`
}

// TestCompareExposesPerBuildAllocatedNodeIDs: each successful build's
// allocated node set lands on the wire under tree.allocatedNodeIds.
// This is what build-compare.svelte consumes to render the visual
// passive-tree overlay.
func TestCompareExposesPerBuildAllocatedNodeIDs(t *testing.T) {
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
		if len(b.Tree.AllocatedNodeIDs) == 0 {
			t.Fatalf("build[%d] tree.allocatedNodeIds is empty", i)
		}
	}

	// Build A should have its 4 allocated nodes; B should have its 3.
	if !reflect.DeepEqual(resp.Builds[0].Tree.AllocatedNodeIDs, []int{1001, 1002, 1003, 1004}) {
		t.Errorf("build[0] allocatedNodeIds = %v, want [1001 1002 1003 1004]", resp.Builds[0].Tree.AllocatedNodeIDs)
	}
	if !reflect.DeepEqual(resp.Builds[1].Tree.AllocatedNodeIDs, []int{2001, 2002, 2003}) {
		t.Errorf("build[1] allocatedNodeIds = %v, want [2001 2002 2003]", resp.Builds[1].Tree.AllocatedNodeIDs)
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
