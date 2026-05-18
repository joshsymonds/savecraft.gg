package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

// Real-fixture coverage for the GGG→PoB import path beyond the single
// basic fixture (epic Req 8 / fixture-expansion success criterion).
//
// Provenance: like ggg_character_basic.json these are hand-constructed
// to the GGG OAuth reference schema (not live captures — GGG OAuth
// capture tooling isn't wired yet). See testdata/README.md.
//
//   - ggg_character_settlers.json: byte-for-byte the basic Juggernaut
//     with a non-Standard league. Faithful enough (only the league
//     string differs from the known-good basic build) to drive the
//     live PoB engine — asserts deterministic buildId + real calc.
//   - ggg_character_cluster.json: adds a Large Cluster Jewel + a
//     passives.jewel_data expansion subgraph. A synthetic cluster
//     subgraph cannot be validated against the live PoB tree without a
//     real capture, so this fixture exercises the property Go actually
//     owns and the content-addressed buildId depends on: the transform
//     passes jewel_data and the cluster jewel through byte-verbatim and
//     deterministically. Real-PoB calc assertion for cluster jewels is
//     deferred until a real captured character is dropped in (TODO in
//     testdata/README.md).

func loadFixture(t *testing.T, name string) json.RawMessage {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return json.RawMessage(b)
}

// Multi-league character through the live PoB engine: deterministic
// content-addressed buildId + real calc output. Skips without POB_DIR.
func TestImportMultiLeagueRealPoB(t *testing.T) {
	srv := setupRealServer(t)
	ts := realServerHTTP(t, srv)

	fixture := loadFixture(t, "ggg_character_settlers.json")

	id1 := importBuildID(t, ts.URL, fixture)
	id2 := importBuildID(t, ts.URL, fixture)
	if id1 == "" {
		t.Fatal("empty buildId for multi-league fixture")
	}
	if id1 != id2 {
		t.Fatalf("non-deterministic buildId for multi-league fixture: %q != %q", id1, id2)
	}

	resp := postImport(t, ts.URL, fixture)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200, got %d: %s", resp.StatusCode, b)
	}
	var env struct {
		Data struct {
			Summary struct {
				Life float64 `json:"Life"`
			} `json:"summary"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if env.Data.Summary.Life <= 0 {
		t.Errorf("multi-league build Life = %v, want > 0", env.Data.Summary.Life)
	}
}

// The transform must carry the league verbatim into the get-items body
// PoB consumes — the buildId differs from Standard only because this
// field flows through. Always runs (no PoB needed).
func TestImportMultiLeagueTransformCarriesLeague(t *testing.T) {
	getItems, _, err := transformToImportJSON(loadFixture(t, "ggg_character_settlers.json"))
	if err != nil {
		t.Fatalf("transform: %v", err)
	}
	var body struct {
		Character struct {
			League string `json:"league"`
		} `json:"character"`
	}
	if err := json.Unmarshal(getItems, &body); err != nil {
		t.Fatalf("get-items not a JSON object: %v", err)
	}
	if body.Character.League != "Settlers" {
		t.Errorf("character.league = %q, want Settlers", body.Character.League)
	}
}

// Cluster jewels: the transform treats passives.jewel_data and the
// jewel items as opaque and must pass them through byte-verbatim and
// deterministically — the precondition for build_planner's stored-XML
// re-feed yielding the identical content-addressed buildId.
func TestImportClusterJewelTransformPassthroughDeterministic(t *testing.T) {
	fixture := loadFixture(t, "ggg_character_cluster.json")

	i1, p1, err := transformToImportJSON(fixture)
	if err != nil {
		t.Fatalf("transform #1: %v", err)
	}
	i2, p2, err := transformToImportJSON(fixture)
	if err != nil {
		t.Fatalf("transform #2: %v", err)
	}
	if !bytes.Equal(i1, i2) || !bytes.Equal(p1, p2) {
		t.Fatal("cluster-jewel transform is not byte-deterministic across calls")
	}

	// jewel_data passes through verbatim (compared as canonicalized JSON
	// — Go re-marshals the map, so compare values, not raw bytes).
	var src struct {
		Passives struct {
			JewelData json.RawMessage `json:"jewel_data"`
		} `json:"passives"`
		Jewels []json.RawMessage `json:"jewels"`
	}
	if err := json.Unmarshal(fixture, &src); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	var out struct {
		JewelData json.RawMessage   `json:"jewel_data"`
		Items     []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(p2, &out); err != nil {
		t.Fatalf("parse passives body: %v", err)
	}
	if !jsonEqual(t, src.Passives.JewelData, out.JewelData) {
		t.Errorf("jewel_data not passed through verbatim\n in: %s\nout: %s", src.Passives.JewelData, out.JewelData)
	}
	// The Large Cluster Jewel reaches the passive importer's items[].
	if len(out.Items) != len(src.Jewels) {
		t.Fatalf("passives items length = %d, want %d (jewels passthrough)", len(out.Items), len(src.Jewels))
	}
	found := false
	for _, it := range out.Items {
		var j struct {
			TypeLine string `json:"typeLine"`
		}
		_ = json.Unmarshal(it, &j)
		if j.TypeLine == "Large Cluster Jewel" {
			found = true
		}
	}
	if !found {
		t.Error("Large Cluster Jewel not present in passives items[]")
	}
}

// Defensive shaping for sparse/partial GGG payloads: a character with no
// passives object at all must still produce a structurally valid
// get-passive-skills body (PoB iterates these with pairs/ipairs and must
// never see null), and an unmappable class must error rather than panic.
func TestImportTransformNegativePaths(t *testing.T) {
	cases := []struct {
		name      string
		character string
		wantErr   bool
	}{
		{
			name:      "passives object entirely absent",
			character: `{"name":"NoPassives","class":"Juggernaut","level":80,"league":"Standard"}`,
			wantErr:   false,
		},
		{
			name:      "null jewels and equipment",
			character: `{"name":"Nulls","class":"Witch","level":1,"league":"Standard","equipment":null,"jewels":null,"passives":null}`,
			wantErr:   false,
		},
		{
			name:      "unmappable class",
			character: `{"name":"X","class":"NotARealClass","level":1,"league":"Standard"}`,
			wantErr:   true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panicked on %s: %v", tc.name, r)
				}
			}()
			getItems, getPassives, err := transformToImportJSON(json.RawMessage(tc.character))
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %s, got nil", tc.name)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for %s: %v", tc.name, err)
			}
			// Both bodies must be valid JSON objects with the
			// null-safe defaults applied.
			var pass struct {
				Hashes    json.RawMessage `json:"hashes"`
				HashesEx  json.RawMessage `json:"hashes_ex"`
				JewelData json.RawMessage `json:"jewel_data"`
				Items     json.RawMessage `json:"items"`
			}
			if err := json.Unmarshal(getPassives, &pass); err != nil {
				t.Fatalf("get-passive-skills not a JSON object: %v", err)
			}
			if string(pass.Hashes) != "[]" {
				t.Errorf("hashes = %s, want [] when passives absent", pass.Hashes)
			}
			if string(pass.HashesEx) != "[]" {
				t.Errorf("hashes_ex = %s, want []", pass.HashesEx)
			}
			if string(pass.JewelData) != "{}" {
				t.Errorf("jewel_data = %s, want {} when absent", pass.JewelData)
			}
			if string(pass.Items) != "[]" {
				t.Errorf("items = %s, want [] when jewels absent/null", pass.Items)
			}
			var items struct {
				Items json.RawMessage `json:"items"`
			}
			if err := json.Unmarshal(getItems, &items); err != nil {
				t.Fatalf("get-items not a JSON object: %v", err)
			}
			if string(items.Items) != "[]" {
				t.Errorf("get-items items = %s, want [] when equipment absent/null", items.Items)
			}
		})
	}
}

func jsonEqual(t *testing.T, a, b json.RawMessage) bool {
	t.Helper()
	var av, bv any
	if err := json.Unmarshal(a, &av); err != nil {
		t.Fatalf("unmarshal a: %v", err)
	}
	if err := json.Unmarshal(b, &bv); err != nil {
		t.Fatalf("unmarshal b: %v", err)
	}
	ab, _ := json.Marshal(av)
	bb, _ := json.Marshal(bv)
	return bytes.Equal(ab, bb)
}
