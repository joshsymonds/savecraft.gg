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
	getItems, _, err := transformToImportJSON(loadGGGFixture(t))
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
	_, getPassives, err := transformToImportJSON(loadGGGFixture(t))
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
	i1, p1, err := transformToImportJSON(fixture)
	if err != nil {
		t.Fatalf("transform #1: %v", err)
	}
	i2, p2, err := transformToImportJSON(fixture)
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
			if _, _, err := transformToImportJSON(in); err == nil {
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
