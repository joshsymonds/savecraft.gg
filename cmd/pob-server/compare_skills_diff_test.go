package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
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
	Label    string                `json:"label"`
	PerBuild [][]string            `json:"perBuild"`
	Same     bool                  `json:"same"`
	GemsDiff *skillsGemsDiffOnWire `json:"gemsDiff,omitempty"`
}

// skillsGemsDiffOnWire mirrors the production skillsGemsDiff struct.
// PerBuild[i] = gems unique to build i (not present in EVERY build);
// Common = gems present in every successful build's group at this
// label. Both sorted ascending. Emitted only when same:false AND every
// build has a non-empty group at this label.
type skillsGemsDiffOnWire struct {
	PerBuild [][]string `json:"perBuild"`
	Common   []string   `json:"common"`
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
// custom socketGroups array. Matches the schema from
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
		`"section_index":[],"sections":{"socketGroups":` + string(groupsJSON) + `}}}`
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
	srv, idA, idB := compareHarness(
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
	srv, idA, idB := compareHarness(
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
	srv, idA, idB := compareHarness(
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

// TestCompareSkillsDiffEmptyGroups: a build with no socketGroups
// section contributes empty entries to other builds' groups.
func TestCompareSkillsDiffEmptyGroups(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Cyclone", Gems: []string{"Cyclone"}},
		}),
		// minimalCalcResponseClass has no socketGroups — extracts to
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
	srv, idA, idB := compareHarness(
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

// TestCompareSkillsDiffIgnoresLinkCount: two builds with the same gem
// set in the same labeled group, but different mainGemLinkCount /
// hostItemMaxLink values, must still report same:true. The new
// socket-link fields are informational for the AI consumer (so it can
// say "you went from 5L to 6L") — they are NOT part of the "same gem
// set" question. Folding link count into equality would split otherwise
// identical groups when the player kept the same skill but improved
// gear, which is the opposite of what /compare should surface.
func TestCompareSkillsDiffIgnoresLinkCount(t *testing.T) {
	// Build A: 5-link Cyclone setup. Build B: same gems, 6-link.
	respA := calcResponseWithSkillsAndLinks("Witch",
		testSocketGroupWithLinks{
			Label:            "Main Skill",
			Gems:             []string{"Cyclone", "Brutality", "Pulverise"},
			MainGemLinkCount: intPtr(5),
			HostItemMaxLink:  intPtr(5),
			HostItemName:     strPtr("Saintly Chainmail"),
		},
	)
	respB := calcResponseWithSkillsAndLinks("Marauder",
		testSocketGroupWithLinks{
			Label:            "Main Skill",
			Gems:             []string{"Cyclone", "Brutality", "Pulverise"},
			MainGemLinkCount: intPtr(6),
			HostItemMaxLink:  intPtr(6),
			HostItemName:     strPtr("Loath Bane"),
		},
	)

	srv, idA, idB := compareHarness(t, "<A/>", "<B/>", respA, respB)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Main Skill")
	if g == nil {
		t.Fatal("Main Skill group missing")
	}
	if !g.Same {
		t.Errorf(
			"same should be true (identical gem set; only link count + host item differ); got false",
		)
	}
}

// TestCompareSkillsDiffOrderInsensitive: gem order within a group
// shouldn't matter — same gems in different order are still "same".
func TestCompareSkillsDiffOrderInsensitive(t *testing.T) {
	srv, idA, idB := compareHarness(
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

// TestCompareSkillsDiffEmitsGemsBreakdown: three builds share the same
// labeled group "Main Skill" but with overlapping-not-identical gem
// sets. The diff MUST emit gemsDiff with common = gems in all three
// AND perBuild[i] = gems in build i but missing from at least one
// other build. Mirrors gearModsDiff semantics: any gem with tally < N
// counts as "unique" to the builds that contain it.
//
//	Build A: [Cyclone, Brutality, Pulverise]
//	Build B: [Cyclone, Brutality, Fortify]
//	Build C: [Cyclone, Pulverise, Awakened Brutality]
//
// Expected:
//
//	common = [Cyclone]
//	perBuild[0] = [Brutality, Pulverise]
//	perBuild[1] = [Brutality, Fortify]
//	perBuild[2] = [Awakened Brutality, Pulverise]
func TestCompareSkillsDiffEmitsGemsBreakdown(t *testing.T) {
	pool, _ := captureMockPool(t, []string{
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Main Skill", Gems: []string{"Cyclone", "Brutality", "Pulverise"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Main Skill", Gems: []string{"Cyclone", "Brutality", "Fortify"}},
		}),
		calcResponseWithSkills("Ranger", []testSocketGroup{
			{Label: "Main Skill", Gems: []string{"Cyclone", "Pulverise", "Awakened Brutality"}},
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
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Main Skill")
	if g == nil {
		t.Fatal("Main Skill group missing")
	}
	if g.Same {
		t.Errorf("same should be false (gem sets differ across the three builds)")
	}
	if g.GemsDiff == nil {
		t.Fatalf("expected gemsDiff to be present, got nil; perBuild=%v", g.PerBuild)
	}

	// Common: only Cyclone is in all three builds' Main Skill groups.
	if !equalStringSlices(g.GemsDiff.Common, []string{"Cyclone"}) {
		t.Errorf("gemsDiff.common = %v, want [Cyclone]", g.GemsDiff.Common)
	}
	if got := len(g.GemsDiff.PerBuild); got != 3 {
		t.Fatalf("gemsDiff.perBuild length = %d, want 3 (parallel to successful builds)", got)
	}
	// Mock pool round-robins responses, so the build-position → class
	// mapping isn't deterministic. Assert by membership: union of all
	// three perBuild entries must equal {Brutality, Pulverise, Fortify,
	// Awakened Brutality} and contain nothing else (Cyclone is in
	// common, never in perBuild).
	gotUnique := make(map[string]int)
	for _, slot := range g.GemsDiff.PerBuild {
		for _, gem := range slot {
			gotUnique[gem]++
		}
	}
	wantUnique := map[string]bool{
		"Brutality":          true,
		"Pulverise":          true,
		"Fortify":            true,
		"Awakened Brutality": true,
	}
	for gem := range wantUnique {
		if gotUnique[gem] == 0 {
			t.Errorf("expected gem %q in some perBuild entry; got %v", gem, gotUnique)
		}
	}
	for gem := range gotUnique {
		if !wantUnique[gem] {
			t.Errorf("unexpected gem %q in gemsDiff.perBuild (should be common or filtered)", gem)
		}
	}
	if gotUnique["Cyclone"] != 0 {
		t.Errorf("Cyclone leaked into perBuild but it's in all three builds (should be common only)")
	}
	// Brutality: in 2 of 3 builds → should appear in 2 perBuild slots.
	// Pulverise: in 2 of 3 builds → should appear in 2 perBuild slots.
	// Fortify: in 1 of 3 → 1 slot.
	// Awakened Brutality: in 1 of 3 → 1 slot.
	if gotUnique["Brutality"] != 2 {
		t.Errorf("Brutality appears in %d perBuild slots, want 2", gotUnique["Brutality"])
	}
	if gotUnique["Pulverise"] != 2 {
		t.Errorf("Pulverise appears in %d perBuild slots, want 2", gotUnique["Pulverise"])
	}
	if gotUnique["Fortify"] != 1 {
		t.Errorf("Fortify appears in %d perBuild slots, want 1", gotUnique["Fortify"])
	}
	if gotUnique["Awakened Brutality"] != 1 {
		t.Errorf("Awakened Brutality appears in %d perBuild slots, want 1", gotUnique["Awakened Brutality"])
	}

	// Per-build entries are sorted ascending.
	for i, slot := range g.GemsDiff.PerBuild {
		if !sort.StringsAreSorted(slot) {
			t.Errorf("gemsDiff.perBuild[%d] = %v, want sorted ascending", i, slot)
		}
	}
}

// TestCompareSkillsDiffGemsBreakdownOmittedWhenEmptyGroup: when any
// build has an empty gem list at this label (e.g. one build has the
// label but the others don't), the gemsDiff is omitted entirely —
// computing common + per-build over partial data would mislead the
// breakdown. Mirrors gear's !anyMissing gate.
func TestCompareSkillsDiffGemsBreakdownOmittedWhenEmptyGroup(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Aura", Gems: []string{"Discipline", "Wrath"}},
		}),
		// Build B has no Aura group at all — it's missing entirely.
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Curse", Gems: []string{"Despair"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	aura := findGroup(resp.Diffs.Skills, "Aura")
	if aura == nil {
		t.Fatal("Aura group missing")
	}
	if aura.Same {
		t.Errorf("same should be false (B has no Aura group)")
	}
	if aura.GemsDiff != nil {
		t.Errorf(
			"expected gemsDiff to be omitted (B has no Aura group); got %+v",
			aura.GemsDiff,
		)
	}
}

// TestCompareSkillsDiffGemsBreakdownOmittedWhenSame: when the gem
// sets match across all builds, gemsDiff is omitted — the consumer
// can read perBuild[0] directly and there's no breakdown to surface.
// Mirrors gear's !modsSame gate.
func TestCompareSkillsDiffGemsBreakdownOmittedWhenSame(t *testing.T) {
	srv, idA, idB := compareHarness(
		t,
		"<A/>", "<B/>",
		calcResponseWithSkills("Witch", []testSocketGroup{
			{Label: "Movement", Gems: []string{"Leap Slam", "Faster Attacks"}},
		}),
		calcResponseWithSkills("Marauder", []testSocketGroup{
			{Label: "Movement", Gems: []string{"Leap Slam", "Faster Attacks"}},
		}),
	)
	body := `{"builds":["` + idA + `","` + idB + `"]}`
	rec := httptest.NewRecorder()
	srv.handleCompare(rec, httptest.NewRequest(http.MethodPost, "/compare", strings.NewReader(body)))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	resp := decodeCompareWithSkills(t, rec.Body.Bytes())
	g := findGroup(resp.Diffs.Skills, "Movement")
	if g == nil {
		t.Fatal("Movement group missing")
	}
	if !g.Same {
		t.Errorf("same should be true (identical gem sets)")
	}
	if g.GemsDiff != nil {
		t.Errorf(
			"expected gemsDiff to be omitted when same:true; got %+v",
			g.GemsDiff,
		)
	}
}

// testSocketGroupWithLinks extends testSocketGroup with the new
// socket-link fields. Used by TestCompareSkillsDiffIgnoresLinkCount to
// craft per-build responses where same gems land at different link
// counts — pinning that link count is informational only and does not
// participate in skills-diff equality.
type testSocketGroupWithLinks struct {
	Label            string
	Gems             []string
	MainGemLinkCount *int
	HostItemMaxLink  *int
	HostItemName     *string
}

// calcResponseWithSkillsAndLinks emits a wrapper.lua-shaped JSON
// response with link-aware socketGroups. Mirrors calcResponseWithSkills
// but threads through the optional pointer fields, omitting them when
// nil (matches Lua's nil → JSON-absent behavior).
func calcResponseWithSkillsAndLinks(class string, groups ...testSocketGroupWithLinks) string {
	type gemEntry struct {
		Name string `json:"name"`
	}
	type groupEntry struct {
		Label            string     `json:"label"`
		Gems             []gemEntry `json:"gems"`
		MainGemLinkCount *int       `json:"mainGemLinkCount,omitempty"`
		HostItemMaxLink  *int       `json:"hostItemMaxLink,omitempty"`
		HostItemName     *string    `json:"hostItemName,omitempty"`
	}
	out := make([]groupEntry, 0, len(groups))
	for _, g := range groups {
		gems := make([]gemEntry, len(g.Gems))
		for i, name := range g.Gems {
			gems[i] = gemEntry{Name: name}
		}
		out = append(out, groupEntry{
			Label:            g.Label,
			Gems:             gems,
			MainGemLinkCount: g.MainGemLinkCount,
			HostItemMaxLink:  g.HostItemMaxLink,
			HostItemName:     g.HostItemName,
		})
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
		`"section_index":[],"sections":{"socketGroups":` + string(groupsJSON) + `}}}`
}

func strPtr(s string) *string { return &s }
