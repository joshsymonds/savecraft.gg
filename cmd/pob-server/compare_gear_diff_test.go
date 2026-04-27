package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithGear decodes the /compare body using a gear-diff-aware
// shape, building on the summary + tree types.
type compareRespWithGear struct {
	Builds []compareEntry          `json:"builds"`
	Diffs  *compareDiffsGearOnWire `json:"diffs"`
}

type compareDiffsGearOnWire struct {
	Summary map[string]compareStatDiffOnWire `json:"summary"`
	Tree    *compareTreeDiffOnWire           `json:"tree"`
	Gear    map[string]compareSlotDiffOnWire `json:"gear"`
}

// compareSlotDiffOnWire mirrors the wire shape: perBuild is a list of
// pointers so JSON null encodes as nil — distinguishing "slot empty in
// this build" from "build absent". NameSame and ModsSame are independent
// so callers can distinguish "different rare display name, same mods"
// from "actually different mods".
type compareSlotDiffOnWire struct {
	PerBuild []*string `json:"perBuild"`
	NameSame bool      `json:"name_same"`
	ModsSame bool      `json:"mods_same"`
}

func decodeCompareWithGear(t *testing.T, body []byte) compareRespWithGear {
	t.Helper()
	var resp compareRespWithGear
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// calcResponseWithItems returns a wrapper.lua-shaped response with a
// custom items map. slot → name lets each test build a distinct gear
// loadout.
func calcResponseWithItems(class string, items map[string]string) string {
	b := strings.Builder{}
	b.WriteString("{")
	first := true
	for slot, name := range items {
		if !first {
			b.WriteString(",")
		}
		first = false
		// Each slot value is an object with at least `name`.
		nameJSON, _ := json.Marshal(name)
		slotJSON, _ := json.Marshal(slot)
		b.Write(slotJSON)
		b.WriteString(`:{"name":`)
		b.Write(nameJSON)
		b.WriteString(`,"baseName":"X","rarity":"UNIQUE","type":"X"}`)
	}
	b.WriteString("}")
	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{"items":` + b.String() + `}}}`
}

// TestCompareGearDiffIdenticalSlot: two builds with the same Helmet name
// produce diffs.gear.Helmet.same = true.
func TestCompareGearDiffIdenticalSlot(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Atziri's Foible"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Gear == nil {
		t.Fatalf("expected diffs.gear, got nil; body=%s", rec.Body.String())
	}
	helmet, ok := resp.Diffs.Gear["Helmet"]
	if !ok {
		t.Fatalf("expected Helmet slot in gear diff; got keys: %v", mapKeysGearDiff(resp.Diffs.Gear))
	}
	if !helmet.NameSame || !helmet.ModsSame {
		t.Errorf("Helmet identical: expected name_same:true mods_same:true, got name_same=%v mods_same=%v",
			helmet.NameSame, helmet.ModsSame)
	}
	if len(helmet.PerBuild) != 2 {
		t.Fatalf("perBuild length = %d, want 2", len(helmet.PerBuild))
	}
	for i, ptr := range helmet.PerBuild {
		if ptr == nil || *ptr != "Atziri's Foible" {
			t.Errorf("perBuild[%d] = %v, want Atziri's Foible", i, ptr)
		}
	}
}

// TestCompareGearDiffDifferentSlot: same slot, different items → name_same=false.
func TestCompareGearDiffDifferentSlot(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Devoto's Devotion"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	helmet := resp.Diffs.Gear["Helmet"]
	if helmet.NameSame {
		t.Errorf("Helmet name_same should be false (different items)")
	}
	names := []string{}
	for _, ptr := range helmet.PerBuild {
		if ptr != nil {
			names = append(names, *ptr)
		}
	}
	if len(names) != 2 {
		t.Errorf("expected 2 non-null names, got %v", names)
	}
}

// TestCompareGearDiffSlotEmptyInOneBuild: build A has Helmet, build B
// doesn't → perBuild = ["Helmet name", null], same: false.
func TestCompareGearDiffSlotEmptyInOneBuild(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Body Armour": "Kintsugi"}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())

	helmet := resp.Diffs.Gear["Helmet"]
	if helmet.NameSame || helmet.ModsSame {
		t.Errorf("Helmet should be name_same:false mods_same:false (one build has it, other doesn't); got name_same=%v mods_same=%v",
			helmet.NameSame, helmet.ModsSame)
	}
	if len(helmet.PerBuild) != 2 {
		t.Fatalf("perBuild length = %d, want 2", len(helmet.PerBuild))
	}
	hasName := 0
	hasNil := 0
	for _, ptr := range helmet.PerBuild {
		if ptr == nil {
			hasNil++
		} else {
			hasName++
		}
	}
	if hasName != 1 || hasNil != 1 {
		t.Errorf("expected 1 name + 1 null in Helmet perBuild, got %d/%d", hasName, hasNil)
	}

	body2 := resp.Diffs.Gear["Body Armour"]
	if body2.NameSame || body2.ModsSame {
		t.Errorf("Body Armour should be name_same:false mods_same:false (one build absent); got name_same=%v mods_same=%v",
			body2.NameSame, body2.ModsSame)
	}
}

// TestCompareGearDiffN3Mixed: three builds where two share a Helmet
// and one differs → same=false (any difference flags it).
func TestCompareGearDiffN3Mixed(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Marauder", map[string]string{"Helmet": "Atziri's Foible"}),
		calcResponseWithItems("Ranger", map[string]string{"Helmet": "Devoto's Devotion"}),
	})
	pool.maxSize = 1
	pool.affinityMaxPins = 1
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	idB := srv.cache.Put("<B/>")
	idC := srv.cache.Put("<C/>")
	for _, id := range []string{idA, idB, idC} {
		_ = srv.cache.store.Put(id, "<x/>", "", "", "")
	}

	body := `{"builds":["` + idA + `","` + idB + `","` + idC + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	helmet := resp.Diffs.Gear["Helmet"]
	if helmet.NameSame {
		t.Errorf("Helmet name_same should be false (one of three differs)")
	}
	if len(helmet.PerBuild) != 3 {
		t.Errorf("perBuild length = %d, want 3", len(helmet.PerBuild))
	}
}

// TestCompareGearDiffOmittedWhenSingleSuccess: one build resolves, one
// errors → diffs object exists for summary computation across the
// successful subset (just the one), but gear is omitted (need ≥2 with
// data).
func TestCompareGearDiffOmittedWhenSingleSuccess(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
	})
	defer pool.Shutdown()
	srv := newTestSrv(t, pool)
	srv.cache.store = newInMemoryStoreForTest(t)

	idA := srv.cache.Put("<A/>")
	_ = srv.cache.store.Put(idA, "<A/>", "", "", "")

	body := `{"builds":["` + idA + `","00000000000000000000000000000000"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	if resp.Diffs != nil && len(resp.Diffs.Gear) > 0 {
		t.Errorf("gear diff should be omitted with only 1 successful build; got %v", resp.Diffs.Gear)
	}
}

// TestCompareGearDiffEmptyItemsMap: a build with no items at all yields
// an empty itemsBySlot. With another build that has items, every slot
// the other build has shows perBuild=[name, null], same: false.
func TestCompareGearDiffEmptyItemsMap(t *testing.T) {
	// Build B has no items section at all (use minimalCalcResponseClass).
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithItems("Witch", map[string]string{"Helmet": "Atziri's Foible"}),
		minimalCalcResponseClass("Marauder", 100000),
	)

	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	helmet, ok := resp.Diffs.Gear["Helmet"]
	if !ok {
		t.Fatalf("Helmet should appear (build A has it); got keys %v", mapKeysGearDiff(resp.Diffs.Gear))
	}
	if helmet.NameSame || helmet.ModsSame {
		t.Errorf("Helmet should be name_same:false mods_same:false (B has no item); got name_same=%v mods_same=%v",
			helmet.NameSame, helmet.ModsSame)
	}
}

func mapKeysGearDiff(m map[string]compareSlotDiffOnWire) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
