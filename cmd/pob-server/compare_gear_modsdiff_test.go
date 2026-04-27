package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

// TestCompareGearModsDiffSurfacesDivergentMods pins the modsDiff
// contract: when two rares have overlapping but non-identical mod
// sets, the diff entry exposes per-build unique mods plus the common
// set so the caller doesn't need to drill into per-build items.
func TestCompareGearModsDiffSurfacesDivergentMods(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "A's Locket", Rarity: "RARE", Mods: []string{
				"+80 to maximum Life",
				"32% increased Critical Strike Chance",
				"+45% to Cold Resistance",
			}},
		}),
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "B's Idol", Rarity: "RARE", Mods: []string{
				"+80 to maximum Life",        // shared
				"+45% to Cold Resistance",    // shared
				"20% increased Spell Damage", // only B
			}},
		}),
	)
	resp := postCompareDiffsViaHarness(t, srv, idA, idB)
	amulet := resp.Diffs.Gear["Amulet"]

	if amulet.ModsSame {
		t.Errorf("Amulet modsSame should be false (mod sets differ)")
	}
	if amulet.ModsDiff == nil {
		t.Fatalf("Amulet modsDiff should be present when modsSame:false")
	}
	if len(amulet.ModsDiff.PerBuild) != 2 {
		t.Fatalf("Amulet modsDiff.perBuild length = %d, want 2", len(amulet.ModsDiff.PerBuild))
	}
	if !slices.Equal(amulet.ModsDiff.PerBuild[0], []string{"32% increased Critical Strike Chance"}) {
		t.Errorf("Amulet modsDiff.perBuild[0] = %v, want [32%% increased Critical Strike Chance]",
			amulet.ModsDiff.PerBuild[0])
	}
	if !slices.Equal(amulet.ModsDiff.PerBuild[1], []string{"20% increased Spell Damage"}) {
		t.Errorf("Amulet modsDiff.perBuild[1] = %v, want [20%% increased Spell Damage]",
			amulet.ModsDiff.PerBuild[1])
	}
	wantCommon := []string{"+45% to Cold Resistance", "+80 to maximum Life"}
	if !slices.Equal(amulet.ModsDiff.Common, wantCommon) {
		t.Errorf("Amulet modsDiff.common = %v, want %v (sorted)", amulet.ModsDiff.Common, wantCommon)
	}
}

// TestCompareGearModsDiffOmittedWhenSame pins that modsDiff is
// omitted (omitempty) on the wire when modsSame:true — uniques with
// no mods, identical rares, etc. shouldn't carry an empty diff blob.
func TestCompareGearModsDiffOmittedWhenSame(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Belt": "Mageblood"}),
		calcResponseWithItems("Marauder", map[string]string{"Belt": "Mageblood"}),
	)
	resp := postCompareDiffsViaHarness(t, srv, idA, idB)
	belt := resp.Diffs.Gear["Belt"]

	if !belt.ModsSame {
		t.Errorf("Belt modsSame should be true (both Mageblood, no mods)")
	}
	if belt.ModsDiff != nil {
		t.Errorf("Belt modsDiff should be omitted when modsSame:true; got %+v", belt.ModsDiff)
	}

	// Raw-JSON check: modsDiff key must NOT appear in the wire output.
	rawAll, _ := json.Marshal(resp.Diffs.Gear)
	if strings.Contains(string(rawAll), `"modsDiff"`) {
		t.Errorf("modsDiff key leaked into wire output: %s", rawAll)
	}
}

// TestCompareGearRarityFieldsPopulated pins the per-build + canonical
// rarity exposure. Two same-name uniques with different rarity tags
// (UNIQUE/RELIC) should produce perBuildRarity=[UNIQUE, RELIC] and
// canonicalRarity:UNIQUE — the foil flag visible without polluting
// the equality check.
func TestCompareGearRarityFieldsPopulated(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Belt": {Name: "Mageblood", Rarity: "UNIQUE"},
		}),
		calcResponseWithRareItems("Marauder", map[string]rareItemFixture{
			"Belt": {Name: "Mageblood", Rarity: "RELIC"},
		}),
	)
	resp := postCompareDiffsViaHarness(t, srv, idA, idB)
	belt := resp.Diffs.Gear["Belt"]

	if len(belt.PerBuildRarity) != 2 {
		t.Fatalf("perBuildRarity length = %d, want 2", len(belt.PerBuildRarity))
	}
	if belt.PerBuildRarity[0] == nil || *belt.PerBuildRarity[0] != "UNIQUE" {
		t.Errorf("perBuildRarity[0] = %v, want UNIQUE", belt.PerBuildRarity[0])
	}
	if belt.PerBuildRarity[1] == nil || *belt.PerBuildRarity[1] != "RELIC" {
		t.Errorf("perBuildRarity[1] = %v, want RELIC", belt.PerBuildRarity[1])
	}
	if belt.CanonicalRarity == nil || *belt.CanonicalRarity != "UNIQUE" {
		t.Errorf("canonicalRarity = %v, want UNIQUE (UNIQUE wins over RELIC)", belt.CanonicalRarity)
	}
}

// TestCompareGearRarityCanonicalAgrees pins canonicalRarity when all
// builds agree on a non-UNIQUE rarity (e.g. both RARE).
func TestCompareGearRarityCanonicalAgrees(t *testing.T) {
	srv, idA, idB := compareHarness(t, "<A/>", "<B/>",
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "A's Locket", Rarity: "RARE", Mods: []string{"+80 to maximum Life"}},
		}),
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "B's Idol", Rarity: "RARE", Mods: []string{"+80 to maximum Life"}},
		}),
	)
	resp := postCompareDiffsViaHarness(t, srv, idA, idB)
	amulet := resp.Diffs.Gear["Amulet"]
	if amulet.CanonicalRarity == nil || *amulet.CanonicalRarity != "RARE" {
		t.Errorf("canonicalRarity = %v, want RARE (all agree)", amulet.CanonicalRarity)
	}
}

// postCompareDiffsViaHarness invokes /compare via the existing test
// harness's mock pool and decodes the gear-diff section into the
// shape used by the new wire fields. Reuses compareSlotDiffOnWire
// (extended below by this task to carry the new fields).
func postCompareDiffsViaHarness(t *testing.T, srv *Server, idA, idB string) compareRespWithGear {
	t.Helper()
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	return decodeCompareWithGear(t, rec.Body.Bytes())
}
