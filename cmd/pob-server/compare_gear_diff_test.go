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
// from "actually different mods". ModsDiff carries the per-build set
// difference when ModsSame is false (omitted on the wire when same).
// PerBuildRarity + CanonicalRarity expose PoB's per-export rarity tag
// and a derived canonical view (UNIQUE-wins-on-mismatch) for surfacing
// foil/relic distinctions without polluting equality.
type compareSlotDiffOnWire struct {
	PerBuild        []*string         `json:"perBuild"`
	NameSame        bool              `json:"nameSame"`
	ModsSame        bool              `json:"modsSame"`
	ModsDiff        *gearModsDiffWire `json:"modsDiff,omitempty"`
	PerBuildRarity  []*string         `json:"perBuildRarity,omitempty"`
	CanonicalRarity *string           `json:"canonicalRarity,omitempty"`
}

type gearModsDiffWire struct {
	PerBuild [][]string `json:"perBuild"`
	Common   []string   `json:"common"`
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
// loadout. All items are emitted as UNIQUE with no mod text — fine for
// most tests since mods_same trivially holds when both builds emit nil
// mods. For tests exercising the name vs mods split (rares with mod
// text), use calcResponseWithRareItems.
func calcResponseWithItems(class string, items map[string]string) string {
	rareItems := make(map[string]rareItemFixture, len(items))
	for slot, name := range items {
		rareItems[slot] = rareItemFixture{Name: name, Rarity: "UNIQUE"}
	}
	return calcResponseWithRareItems(class, rareItems)
}

// rareItemFixture is the per-slot fixture shape used by
// calcResponseWithRareItems. Mods is the per-item mod-text array as
// wrapper.lua's serializeItems emits it for non-uniques.
type rareItemFixture struct {
	Name   string
	Rarity string
	Mods   []string
}

// calcResponseWithRareItems returns a wrapper.lua-shaped response with
// per-item rarity + mod text — needed to test the gear diff's
// name_same vs mods_same split.
func calcResponseWithRareItems(class string, items map[string]rareItemFixture) string {
	b := strings.Builder{}
	b.WriteString("{")
	first := true
	for slot, item := range items {
		if !first {
			b.WriteString(",")
		}
		first = false
		nameJSON, _ := json.Marshal(item.Name)
		slotJSON, _ := json.Marshal(slot)
		rarity := item.Rarity
		if rarity == "" {
			rarity = "UNIQUE"
		}
		b.Write(slotJSON)
		b.WriteString(`:{"name":`)
		b.Write(nameJSON)
		b.WriteString(`,"baseName":"X","rarity":"` + rarity + `","type":"X"`)
		if len(item.Mods) > 0 {
			modsJSON, _ := json.Marshal(item.Mods)
			b.WriteString(`,"mods":`)
			b.Write(modsJSON)
		}
		b.WriteString(`}`)
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
		t.Errorf(
			"Helmet should be both-false (one build absent); got name_same=%v mods_same=%v",
			helmet.NameSame, helmet.ModsSame,
		)
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
		t.Errorf(
			"Body Armour should be both-false (one build absent); got name_same=%v mods_same=%v",
			body2.NameSame, body2.ModsSame,
		)
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
	// Three uniques with no mods emitted → mods_same is true (all-empty
	// mod sets compare equal); the divergence is purely in display name.
	if !helmet.ModsSame {
		t.Errorf("Helmet mods_same should be true (all uniques, no mods); got false")
	}
	if len(helmet.PerBuild) != 3 {
		t.Fatalf("perBuild length = %d, want 3", len(helmet.PerBuild))
	}
	wantNames := []string{"Atziri's Foible", "Atziri's Foible", "Devoto's Devotion"}
	for i, ptr := range helmet.PerBuild {
		if ptr == nil || *ptr != wantNames[i] {
			t.Errorf("perBuild[%d] = %v, want %s", i, ptr, wantNames[i])
		}
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

// TestCompareGearDiffNameDiffersModsIdentical pins the requirement-5
// case: two rares with different display names but identical mod text
// produce name_same:false, mods_same:true. Hand-built fixture so this
// runs without POB_DIR.
func TestCompareGearDiffNameDiffersModsIdentical(t *testing.T) {
	mods := []string{
		"+80 to maximum Life",
		"32% increased Critical Strike Chance",
		"+45% to Cold Resistance",
	}
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "Onslaught Locket", Rarity: "RARE", Mods: mods},
		}),
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "Ghoul Idol", Rarity: "RARE", Mods: mods},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	amulet := resp.Diffs.Gear["Amulet"]
	if amulet.NameSame {
		t.Errorf("Amulet name_same should be false (different display names); got true")
	}
	if !amulet.ModsSame {
		t.Errorf("Amulet mods_same should be true (identical mods); got false")
	}
}

// TestCompareGearDiffModsOrderIndependent pins that two rares with
// the same mod *set* in different roll order compare mods_same:true.
// Without canonicalization, equalStringSlices would return false here.
func TestCompareGearDiffModsOrderIndependent(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "Same Amulet", Rarity: "RARE", Mods: []string{
				"+80 to maximum Life",
				"32% increased Critical Strike Chance",
				"+45% to Cold Resistance",
			}},
		}),
		calcResponseWithRareItems("Witch", map[string]rareItemFixture{
			"Amulet": {Name: "Same Amulet", Rarity: "RARE", Mods: []string{
				"+45% to Cold Resistance",
				"+80 to maximum Life",
				"32% increased Critical Strike Chance",
			}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	resp := decodeCompareWithGear(t, rec.Body.Bytes())
	amulet := resp.Diffs.Gear["Amulet"]
	if !amulet.ModsSame {
		t.Errorf("Amulet mods_same should be true (same mod set, different order); got false")
	}
}
