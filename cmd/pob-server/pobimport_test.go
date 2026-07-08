package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func loadGGGFixture(t *testing.T) json.RawMessage {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "ggg_character_basic.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return json.RawMessage(b)
}

// The get-items body PoB's ImportItemsAndSkills consumes:
// { character: {...}, items: [...] }.
func TestTransformToImportJSON_ItemsBody(t *testing.T) {
	getItems, _, err := transformToImportJSON(loadGGGFixture(t), GamePoE)
	if err != nil {
		t.Fatalf("transform: %v", err)
	}

	var body struct {
		Character struct {
			Name            string `json:"name"`
			League          string `json:"league"`
			Class           string `json:"class"`
			ClassID         int    `json:"classId"`
			AscendancyClass int    `json:"ascendancyClass"`
			Level           int    `json:"level"`
		} `json:"character"`
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(getItems, &body); err != nil {
		t.Fatalf("get-items body not valid JSON object: %v", err)
	}

	if body.Character.Name != "BoneShatterJugg" {
		t.Errorf("character.name = %q, want BoneShatterJugg", body.Character.Name)
	}
	if body.Character.League != "Standard" {
		t.Errorf("character.league = %q, want Standard", body.Character.League)
	}
	if body.Character.Class != "Juggernaut" {
		t.Errorf("character.class = %q, want Juggernaut", body.Character.Class)
	}
	if body.Character.Level != 92 {
		t.Errorf("character.level = %d, want 92", body.Character.Level)
	}
	// classId/ascendancyClass derived from the OAuth class string.
	if body.Character.ClassID != 1 {
		t.Errorf("character.classId = %d, want 1 (Marauder)", body.Character.ClassID)
	}
	if body.Character.AscendancyClass != 1 {
		t.Errorf("character.ascendancyClass = %d, want 1 (Juggernaut)", body.Character.AscendancyClass)
	}
	// Equipment passes through to items[] (weapon + body armour).
	if len(body.Items) != 2 {
		t.Fatalf("items length = %d, want 2", len(body.Items))
	}
}

// The get-passive-skills body PoB's ImportPassiveTreeAndJewels consumes.
func TestTransformToImportJSON_PassivesBody(t *testing.T) {
	_, getPassives, err := transformToImportJSON(loadGGGFixture(t), GamePoE)
	if err != nil {
		t.Fatalf("transform: %v", err)
	}

	var body struct {
		Hashes              []int             `json:"hashes"`
		HashesEx            []int             `json:"hashes_ex"`
		MasteryEffects      json.RawMessage   `json:"mastery_effects"`
		JewelData           json.RawMessage   `json:"jewel_data"`
		SkillOverrides      json.RawMessage   `json:"skill_overrides"`
		Items               []json.RawMessage `json:"items"`
		Character           int               `json:"character"`
		Ascendancy          int               `json:"ascendancy"`
		AlternateAscendancy int               `json:"alternate_ascendancy"`
	}
	if err := json.Unmarshal(getPassives, &body); err != nil {
		t.Fatalf("get-passive-skills body not valid JSON object: %v", err)
	}

	if len(body.Hashes) != 8 {
		t.Errorf("hashes length = %d, want 8 (copied from OAuth passives.hashes)", len(body.Hashes))
	}
	if body.HashesEx == nil {
		t.Error("hashes_ex missing (must be present even when empty)")
	}
	for _, name := range []string{"mastery_effects", "jewel_data", "skill_overrides"} {
		if !json.Valid(mustField(t, getPassives, name)) {
			t.Errorf("%s missing/invalid in passives body", name)
		}
	}
	// jewels → items[] for the passive importer.
	if len(body.Items) != 1 {
		t.Errorf("passives items length = %d, want 1 (the Timeless jewel)", len(body.Items))
	}
	// class/ascendancy indices derived from OAuth class string.
	if body.Character != 1 {
		t.Errorf("character = %d, want 1 (Marauder base class)", body.Character)
	}
	if body.Ascendancy != 1 {
		t.Errorf("ascendancy = %d, want 1 (Juggernaut)", body.Ascendancy)
	}
	if body.AlternateAscendancy != 0 {
		t.Errorf("alternate_ascendancy = %d, want 0", body.AlternateAscendancy)
	}
}

func TestTransformToImportJSON_Deterministic(t *testing.T) {
	fixture := loadGGGFixture(t)
	i1, p1, err := transformToImportJSON(fixture, GamePoE)
	if err != nil {
		t.Fatalf("transform #1: %v", err)
	}
	i2, p2, err := transformToImportJSON(fixture, GamePoE)
	if err != nil {
		t.Fatalf("transform #2: %v", err)
	}
	if !bytes.Equal(i1, i2) {
		t.Error("get-items body not byte-deterministic across calls")
	}
	if !bytes.Equal(p1, p2) {
		t.Error("get-passive-skills body not byte-deterministic across calls")
	}
}

func TestTransformToImportJSON_RejectsBadInput(t *testing.T) {
	cases := map[string]json.RawMessage{
		"empty":        json.RawMessage(``),
		"empty object": json.RawMessage(`{}`),
		"not object":   json.RawMessage(`"a string"`),
		"garbage":      json.RawMessage(`{not json`),
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if r := recover(); r != nil {
					t.Fatalf("panicked on %s input: %v", name, r)
				}
			}()
			if _, _, err := transformToImportJSON(in, GamePoE); err == nil {
				t.Fatalf("expected error for %s input, got nil", name)
			}
		})
	}
}

// loadPoE2FullFixture reads the hand-built (documented-shape) GGG PoE2
// character fixture also used by wrapper_poe2_integration_test.go
// (integration_luajit-gated). Cross-tree because the fixture is shared
// with the poe2 adapter's own tests (plugins/poe2/testdata) rather than
// duplicated under cmd/pob-server/testdata — see that fixture
// directory's README for provenance.
func loadPoE2FullFixture(t *testing.T) json.RawMessage {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "..", "plugins", "poe2", "testdata", "ggg-poe2-character-full.json"))
	if err != nil {
		t.Fatalf("read poe2 character fixture: %v", err)
	}
	return json.RawMessage(b)
}

// The poe2 get-items body PoB2's ImportItemsAndSkills indexes directly
// (charData.equipment, charData.skills, charData.level) — no
// ProcessJSON decode step, unlike PoE1.
func TestTransformToImportJSONPoE2_ItemsBody(t *testing.T) {
	getItems, _, err := transformToImportJSON(loadPoE2FullFixture(t), GamePoE2)
	if err != nil {
		t.Fatalf("transform: %v", err)
	}

	var body poe2ItemsBody
	if err := json.Unmarshal(getItems, &body); err != nil {
		t.Fatalf("poe2 items body not valid JSON: %v", err)
	}

	var equipment []json.RawMessage
	if err := json.Unmarshal(body.Equipment, &equipment); err != nil {
		t.Fatalf("equipment not an array: %v", err)
	}
	if len(equipment) != 4 {
		t.Errorf("equipment length = %d, want 4", len(equipment))
	}

	var skills []json.RawMessage
	if err := json.Unmarshal(body.Skills, &skills); err != nil {
		t.Fatalf("skills not an array: %v", err)
	}
	if len(skills) != 2 {
		t.Errorf("skills length = %d, want 2", len(skills))
	}

	if body.Level != 87 {
		t.Errorf("level = %d, want 87", body.Level)
	}
}

// The poe2 get-passive-skills body PoB2's ImportPassiveTreeAndJewels
// indexes directly (charData.class, charData.level, charData.jewels,
// charData.passives). Unlike PoE1, the class string passes through
// verbatim — PassiveSpecClass:ImportFromNodeList resolves the class BY
// NAME against the live tree data, so there is no classId/ascendancyClass
// numeric mapping to assert on.
func TestTransformToImportJSONPoE2_PassivesBody(t *testing.T) {
	_, getPassives, err := transformToImportJSON(loadPoE2FullFixture(t), GamePoE2)
	if err != nil {
		t.Fatalf("transform: %v", err)
	}

	var body poe2PassivesBody
	if err := json.Unmarshal(getPassives, &body); err != nil {
		t.Fatalf("poe2 passives body not valid JSON: %v", err)
	}

	if body.Class != "Chronomancer" {
		t.Errorf("class = %q, want %q verbatim (no numeric mapping for poe2)", body.Class, "Chronomancer")
	}
	if body.Level != 87 {
		t.Errorf("level = %d, want 87", body.Level)
	}

	var hashes []int
	if err := json.Unmarshal(body.Passives.Hashes, &hashes); err != nil {
		t.Fatalf("hashes not an array: %v", err)
	}
	if len(hashes) != 10 {
		t.Errorf("hashes length = %d, want 10 (copied from OAuth passives.hashes)", len(hashes))
	}

	var specialisations map[string][]int
	if err := json.Unmarshal(body.Passives.Specialisations, &specialisations); err != nil {
		t.Fatalf("specialisations not an object: %v", err)
	}
	if len(specialisations) != 2 {
		t.Errorf("specialisations length = %d, want 2 (set1, set2)", len(specialisations))
	}

	var questStats map[string]int
	if err := json.Unmarshal(body.Passives.QuestStats, &questStats); err != nil {
		t.Fatalf("quest_stats not an object: %v", err)
	}
	if len(questStats) != 2 {
		t.Errorf("quest_stats length = %d, want 2 (PassiveRefundPoints, AscendancyPoints)", len(questStats))
	}
}

// pobimport.go's doc comment (lines 101-106) explains several poe2
// fields PoB2's own Lua has no nil-guard for (jewel_data, jewels,
// skill_overrides) — copyTable(nil)/ipairs(nil) crash the LuaJIT
// process outright — so every optional field must default to its empty
// shape (rawArray → [], rawObject → {}) when the GGG character omits
// it. This exercises that crash-prevention behavior directly against
// the produced JSON bytes, for a character carrying none of them.
func TestTransformToImportJSONPoE2_DefensiveDefaults(t *testing.T) {
	minimal := json.RawMessage(`{"name":"MinimalHuntress","class":"Huntress","level":50}`)

	getItems, getPassives, err := transformToImportJSON(minimal, GamePoE2)
	if err != nil {
		t.Fatalf("transform: %v", err)
	}

	var itemsBody poe2ItemsBody
	if err := json.Unmarshal(getItems, &itemsBody); err != nil {
		t.Fatalf("poe2 items body not valid JSON: %v", err)
	}
	if string(itemsBody.Equipment) != "[]" {
		t.Errorf("equipment default = %s, want []", itemsBody.Equipment)
	}
	if string(itemsBody.Skills) != "[]" {
		t.Errorf("skills default = %s, want []", itemsBody.Skills)
	}

	var passivesBody poe2PassivesBody
	if err := json.Unmarshal(getPassives, &passivesBody); err != nil {
		t.Fatalf("poe2 passives body not valid JSON: %v", err)
	}
	if string(passivesBody.Jewels) != "[]" {
		t.Errorf("jewels default = %s, want []", passivesBody.Jewels)
	}
	if string(passivesBody.Passives.Hashes) != "[]" {
		t.Errorf("hashes default = %s, want []", passivesBody.Passives.Hashes)
	}
	if string(passivesBody.Passives.Specialisations) != "{}" {
		t.Errorf("specialisations default = %s, want {}", passivesBody.Passives.Specialisations)
	}
	if string(passivesBody.Passives.QuestStats) != "[]" {
		t.Errorf("quest_stats default = %s, want [] (rawArray-wrapped)", passivesBody.Passives.QuestStats)
	}
	if string(passivesBody.Passives.JewelData) != "{}" {
		t.Errorf("jewel_data default = %s, want {}", passivesBody.Passives.JewelData)
	}
	if string(passivesBody.Passives.MasteryEffects) != "{}" {
		t.Errorf("mastery_effects default = %s, want {}", passivesBody.Passives.MasteryEffects)
	}
	if string(passivesBody.Passives.SkillOverrides) != "{}" {
		t.Errorf("skill_overrides default = %s, want {}", passivesBody.Passives.SkillOverrides)
	}
}

func TestTransformToImportJSONPoE2_Deterministic(t *testing.T) {
	fixture := loadPoE2FullFixture(t)
	i1, p1, err := transformToImportJSON(fixture, GamePoE2)
	if err != nil {
		t.Fatalf("transform #1: %v", err)
	}
	i2, p2, err := transformToImportJSON(fixture, GamePoE2)
	if err != nil {
		t.Fatalf("transform #2: %v", err)
	}
	if !bytes.Equal(i1, i2) {
		t.Error("poe2 get-items body not byte-deterministic across calls")
	}
	if !bytes.Equal(p1, p2) {
		t.Error("poe2 get-passive-skills body not byte-deterministic across calls")
	}
}

func TestTransformToImportJSONPoE2_RejectsMissingNameOrClass(t *testing.T) {
	cases := map[string]json.RawMessage{
		"missing name":  json.RawMessage(`{"class":"Huntress","level":50}`),
		"missing class": json.RawMessage(`{"name":"X","level":50}`),
		"empty name":    json.RawMessage(`{"name":"","class":"Huntress","level":50}`),
		"empty class":   json.RawMessage(`{"name":"X","class":"","level":50}`),
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, err := transformToImportJSON(in, GamePoE2); err == nil {
				t.Fatalf("expected error for %s input, got nil", name)
			}
		})
	}
}

func mustField(t *testing.T, obj json.RawMessage, key string) json.RawMessage {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(obj, &m); err != nil {
		t.Fatalf("not an object: %v", err)
	}
	v, ok := m[key]
	if !ok {
		t.Fatalf("missing key %q", key)
	}
	return v
}
