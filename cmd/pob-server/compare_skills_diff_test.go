package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// compareRespWithSkills decodes /compare body using the skills-diff
// shape, building on summary + tree + gear types from earlier tests.
type compareRespWithSkills struct {
	Builds []compareEntry            `json:"builds"`
	Diffs  *compareDiffsSkillsOnWire `json:"diffs"`
}

type compareDiffsSkillsOnWire struct {
	Summary map[string]compareStatDiffOnWire `json:"summary"`
	Tree    *compareTreeDiffOnWire           `json:"tree"`
	Gear    map[string]compareSlotDiffOnWire `json:"gear"`
	Skills  []compareSocketGroupOnWire       `json:"skills"`
}

type compareSocketGroupOnWire struct {
	Label    string     `json:"label"`
	PerBuild [][]string `json:"perBuild"`
	Same     bool       `json:"same"`
}

func decodeCompareWithSkills(t *testing.T, body []byte) compareRespWithSkills {
	t.Helper()
	var resp compareRespWithSkills
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decode response: %v\nbody: %s", err, string(body))
	}
	return resp
}

// socketGroup is a tiny shape for building canned wrapper.lua responses
// in tests. Each group has a label + gem-name list.
type testSocketGroup struct {
	Label string
	Gems  []string
}

// calcResponseWithSkills builds a wrapper.lua-shaped response with a
// custom socket_groups array. Matches the schema from
// serializeSocketGroups: each group has label + gems[].name.
func calcResponseWithSkills(class string, groups []testSocketGroup) string {
	type gemEntry struct {
		Name string `json:"name"`
	}
	type groupEntry struct {
		Label string     `json:"label"`
		Gems  []gemEntry `json:"gems"`
	}
	out := make([]groupEntry, 0, len(groups))
	for _, g := range groups {
		gems := make([]gemEntry, len(g.Gems))
		for i, name := range g.Gems {
			gems[i] = gemEntry{Name: name}
		}
		out = append(out, groupEntry{Label: g.Label, Gems: gems})
	}
	groupsJSON, _ := json.Marshal(out)

	return `{"type":"result","data":{` +
		`"character":{"class":"` + class + `","ascendancy":"X","level":99},` +
		`"summary":{"CombinedDPS":100000,"Life":6000,"LifeUnreserved":6000,"LifeUnreservedPercent":100,` +
		`"EnergyShield":0,"Mana":500,"Armour":0,"Evasion":0,` +
		`"FireResist":75,"ColdResist":75,"LightningResist":75,"ChaosResist":40,` +
		`"BlockChance":0,"SpellSuppressionChance":0,"MovementSpeedMod":1,` +
		`"Str":100,"Dex":100,"Int":100,"FlaskEffect":0,"FlaskChargeGen":0,` +
		`"LootQuantityNormalEnemies":0,"LootRarityMagicEnemies":0,` +
		`"EnemyCurseLimit":1,"TotalDPS":100000},` +
		`"section_index":[],"sections":{"socket_groups":` + string(groupsJSON) + `}}}`
}

// findGroup returns the entry with matching label, or nil.
func findGroup(skills []compareSocketGroupOnWire, label string) *compareSocketGroupOnWire {
	for i := range skills {
		if skills[i].Label == label {
			return &skills[i]
		}
	}
	return nil
}

// TestCompareSkillsDiffIdentical: two builds with the same group label
// AND same gem set → same: true.
func TestCompareSkillsDiffIdentical(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Cyclone Setup", Gems: []string{"Cyclone", "Pulverise", "Brutality"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Cyclone Setup", Gems: []string{"Cyclone", "Pulverise", "Brutality"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	if resp.Diffs == nil || resp.Diffs.Skills == nil {
		t.Fatalf("expected diffs.skills, got nil; body=%s", rec.Body.String())
	}
	g := findGroup(resp.Diffs.Skills, "Cyclone Setup")
	if g == nil {
		t.Fatalf("Cyclone Setup not found in skills diff")
	}
	if !g.Same {
		t.Errorf("same should be true (identical), got false")
	}
	if len(g.PerBuild) != 2 {
		t.Errorf("perBuild length = %d, want 2", len(g.PerBuild))
	}
}

// TestCompareSkillsDiffSameLabelDifferentGems: label match alone isn't
// enough — gem set must match for same: true.
func TestCompareSkillsDiffSameLabelDifferentGems(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Cyclone Setup", Gems: []string{"Cyclone", "Pulverise"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Cyclone Setup", Gems: []string{"Cyclone", "Brutality"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Cyclone Setup")
	if g == nil {
		t.Fatal("expected Cyclone Setup")
	}
	if g.Same {
		t.Errorf("same should be false (gems differ)")
	}
}

// TestCompareSkillsDiffDifferentLabels: each label appears as its own
// entry; the build that lacks the label has empty gem list there.
func TestCompareSkillsDiffDifferentLabels(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Aura Setup", Gems: []string{"Discipline", "Determination"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Curse Setup", Gems: []string{"Despair"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())

	aura := findGroup(resp.Diffs.Skills, "Aura Setup")
	curse := findGroup(resp.Diffs.Skills, "Curse Setup")
	if aura == nil {
		t.Fatal("Aura Setup missing")
	}
	if curse == nil {
		t.Fatal("Curse Setup missing")
	}
	// Build A has Aura, build B doesn't.
	if aura.Same {
		t.Errorf("Aura Setup.same should be false (only in build A)")
	}
	if curse.Same {
		t.Errorf("Curse Setup.same should be false (only in build B)")
	}

	// Each entry's perBuild should be length 2 with one populated, one empty.
	for _, g := range []*compareSocketGroupOnWire{aura, curse} {
		if len(g.PerBuild) != 2 {
			t.Errorf("%s.perBuild length = %d, want 2", g.Label, len(g.PerBuild))
		}
		populated := 0
		empty := 0
		for _, gems := range g.PerBuild {
			if len(gems) > 0 {
				populated++
			} else {
				empty++
			}
		}
		if populated != 1 || empty != 1 {
			t.Errorf("%s: expected 1 populated + 1 empty, got %d/%d", g.Label, populated, empty)
		}
	}
}

// TestCompareSkillsDiffN3Mixed: three builds; two share a group and
// one doesn't → same: false.
func TestCompareSkillsDiffN3Mixed(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Cyclone", Gems: []string{"Cyclone", "Brutality"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Cyclone", Gems: []string{"Cyclone", "Brutality"}},
		}),
		calcResponseWithSkills("Ranger", []testSocketGroup{
			{Label: "Cyclone", Gems: []string{"Cyclone", "Pulverise"}},
		}),
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
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Cyclone")
	if g == nil {
		t.Fatal("Cyclone not found")
	}
	if g.Same {
		t.Errorf("same should be false (one of three differs)")
	}
	if len(g.PerBuild) != 3 {
		t.Errorf("perBuild length = %d, want 3", len(g.PerBuild))
	}
}

// TestCompareSkillsDiffOmittedWithSingleSuccess: only one successful
// build → diffs.skills omitted.
func TestCompareSkillsDiffOmittedWithSingleSuccess(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "X", Gems: []string{"Y"}},
		}),
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
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	if resp.Diffs != nil && len(resp.Diffs.Skills) > 0 {
		t.Errorf("skills diff should be omitted; got %d entries", len(resp.Diffs.Skills))
	}
}

// TestCompareSkillsDiffEmptyGroups: a build with no socket_groups
// section contributes empty entries to other builds' groups.
func TestCompareSkillsDiffEmptyGroups(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Cyclone", Gems: []string{"Cyclone"}},
		}),
		// minimalCalcResponseClass has no socket_groups — extracts to
		// an empty socketGroups list on the entry.
		minimalCalcResponseClass("Marauder", 100000),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Cyclone")
	if g == nil {
		t.Fatal("Cyclone should still appear (one build has it)")
	}
	if g.Same {
		t.Errorf("same should be false (B has no group)")
	}
	if len(g.PerBuild) != 2 {
		t.Errorf("perBuild length = %d, want 2", len(g.PerBuild))
	}
	// Exactly one populated, one empty.
	populated := 0
	for _, gems := range g.PerBuild {
		if len(gems) > 0 {
			populated++
		}
	}
	if populated != 1 {
		t.Errorf("expected exactly 1 populated entry, got %d", populated)
	}
}

// TestCompareSkillsDiffWithinBuildLabelCollision: when one build has
// two socket groups with the same label (PoB permits this), the diff
// keeps only the LAST occurrence. Documents the behavior described at
// compare.go:628-632 so it can't silently drift.
func TestCompareSkillsDiffWithinBuildLabelCollision(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Main Skill", Gems: []string{"Cyclone", "Pulverise"}},
			{Label: "Main Skill", Gems: []string{"Arc", "Spell Echo"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Main Skill", Gems: []string{"Cyclone", "Brutality"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Main Skill")
	if g == nil {
		t.Fatal("Main Skill group missing")
	}
	// Build A had two "Main Skill" groups: ["Cyclone","Pulverise"] then
	// ["Arc","Spell Echo"]. Last occurrence wins → ["Arc","Spell Echo"]
	// (sorted by hydrateEntryFromData → ["Arc","Spell Echo"]).
	wantA := []string{"Arc", "Spell Echo"}
	if len(g.PerBuild[0]) != len(wantA) {
		t.Fatalf("perBuild[0] len = %d, want %d (gems: %v)", len(g.PerBuild[0]), len(wantA), g.PerBuild[0])
	}
	for i, gem := range wantA {
		if g.PerBuild[0][i] != gem {
			t.Errorf("perBuild[0][%d] = %q, want %q", i, g.PerBuild[0][i], gem)
		}
	}
}

// TestCompareSkillsDiffOrderInsensitive: gem order within a group
// shouldn't matter — same gems in different order are still "same".
func TestCompareSkillsDiffOrderInsensitive(t *testing.T) {
	srv, idA, idB, _ := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "X", Gems: []string{"Cyclone", "Brutality", "Pulverise"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "X", Gems: []string{"Pulverise", "Cyclone", "Brutality"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "X")
	if g == nil {
		t.Fatal("X group missing")
	}
	if !g.Same {
		t.Errorf("same should be true (same gem set, different order)")
	}
}
