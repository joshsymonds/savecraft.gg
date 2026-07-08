package main

import (
	"encoding/json"
	"errors"
	"fmt"
)

// transformToImportJSON converts a GGG OAuth `GET /character/<name>`
// Character object into the two JSON bodies wrapper.lua feeds into Path
// of Building's headless account-import, per game:
//
//   - PoE1 (game == GamePoE, or any other/empty value — the historical
//     default): the legacy `character-window/get-items` /
//     `character-window/get-passive-skills` bodies read by
//     ImportTabClass:ImportItemsAndSkills / ImportPassiveTreeAndJewels
//     via self:ProcessJSON (they decode the JSON string themselves).
//   - PoE2 (game == GamePoE2): PathOfBuilding-PoE2's ImportTab reads its
//     argument as an ALREADY-DECODED table (charData.equipment,
//     charData.passives, ...) with no ProcessJSON step — see
//     transformToImportJSONPoE2. wrapper.lua decodes these bodies before
//     calling loadBuildFromJSON when POB_GAME=poe2.
//
// All genuinely opaque sub-trees (item objects, hash arrays, jewel_data)
// pass through as json.RawMessage so output bytes are deterministic for
// identical input — required for the downstream content-addressed
// buildId.
//
// This is the only place the GGG→PoB field mapping lives (epic: Go owns
// the transform; Lua does only PoB API access).
func transformToImportJSON(gggCharacter json.RawMessage, game string) (getItems, getPassives []byte, err error) {
	if game == GamePoE2 {
		return transformToImportJSONPoE2(gggCharacter)
	}
	return transformToImportJSONPoE1(gggCharacter)
}

// transformToImportJSONPoE1 implements the PoE1 leg of transformToImportJSON.
// See that function's doc comment for the target shapes.
func transformToImportJSONPoE1(gggCharacter json.RawMessage) (getItems, getPassives []byte, err error) {
	var char oauthCharacter
	if err = json.Unmarshal(gggCharacter, &char); err != nil {
		return nil, nil, fmt.Errorf("parse GGG character: %w", err)
	}
	if char.Name == "" || char.Class == "" {
		return nil, nil, errors.New("GGG character missing required name/class")
	}

	classID, ascendID, ok := resolveClass(char.Class)
	if !ok {
		return nil, nil, fmt.Errorf("unknown PoE class %q", char.Class)
	}

	itemsBody := getItemsBody{
		Character: legacyCharacter{
			Name:            char.Name,
			League:          char.League,
			Class:           char.Class,
			ClassID:         classID,
			AscendancyClass: ascendID,
			Level:           char.Level,
		},
		Items: rawArray(char.Equipment),
	}
	getItems, err = json.Marshal(itemsBody)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal get-items body: %w", err)
	}

	passives := char.Passives
	passivesBody := getPassivesBody{
		Hashes:              rawArray(passives.Hashes),
		HashesEx:            rawArray(passives.HashesEx),
		MasteryEffects:      rawObject(passives.MasteryEffects),
		JewelData:           rawObject(passives.JewelData),
		SkillOverrides:      rawObject(passives.SkillOverrides),
		Items:               rawArray(char.Jewels),
		Character:           classID,
		Ascendancy:          ascendID,
		AlternateAscendancy: passives.AlternateAscendancy,
	}
	getPassives, err = json.Marshal(passivesBody)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal get-passive-skills body: %w", err)
	}

	return getItems, getPassives, nil
}

// transformToImportJSONPoE2 implements the PoE2 leg of
// transformToImportJSON.
//
// Unlike PoE1, PathOfBuilding-PoE2's ImportTabClass:ImportItemsAndSkills
// and :ImportPassiveTreeAndJewels take their argument as an
// already-decoded table and index it directly (charData.equipment,
// charData.skills; charData.passives, charData.jewels, charData.class,
// charData.level) — there's no classId/ascendancyClass numeric mapping:
// PassiveSpecClass:ImportFromNodeList resolves the class BY NAME against
// the live tree data itself (self.tree.classNameMap /
// self.tree.ascendNameMap), so the class string passes through verbatim.
//
// Several fields PoE2's ImportTab reads have no nil-guard in PoB's own
// Lua (jewel_data, jewels, skill_overrides) — copyTable(nil)/ipairs(nil)
// crash the LuaJIT process outright, so every optional field defaults to
// its empty shape here, matching the defensive rawArray/rawObject
// pattern PoE1 already uses.
func transformToImportJSONPoE2(gggCharacter json.RawMessage) (getItems, getPassives []byte, err error) {
	var char oauthCharacterPoE2
	if err = json.Unmarshal(gggCharacter, &char); err != nil {
		return nil, nil, fmt.Errorf("parse GGG character: %w", err)
	}
	if char.Name == "" || char.Class == "" {
		return nil, nil, errors.New("GGG character missing required name/class")
	}

	itemsBody := poe2ItemsBody{
		Equipment: rawArray(char.Equipment),
		Skills:    rawArray(char.Skills),
		Level:     char.Level,
	}
	getItems, err = json.Marshal(itemsBody)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal poe2 items body: %w", err)
	}

	passives := char.Passives
	passivesBody := poe2PassivesBody{
		Class:  char.Class,
		Level:  char.Level,
		Jewels: rawArray(char.Jewels),
		Passives: poe2PassivesInner{
			Hashes:              rawArray(passives.Hashes),
			Specialisations:     rawObject(passives.Specialisations),
			QuestStats:          rawArray(passives.QuestStats),
			JewelData:           rawObject(passives.JewelData),
			MasteryEffects:      rawObject(passives.MasteryEffects),
			SkillOverrides:      rawObject(passives.SkillOverrides),
			AlternateAscendancy: passives.AlternateAscendancy,
		},
	}
	getPassives, err = json.Marshal(passivesBody)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal poe2 passives body: %w", err)
	}

	return getItems, getPassives, nil
}

// oauthCharacter is the subset of the GGG OAuth Character object we
// consume. Unlisted fields (icon URLs, experience, etc.) are ignored.
type oauthCharacter struct {
	Name      string          `json:"name"`
	League    string          `json:"league"`
	Class     string          `json:"class"`
	Level     int             `json:"level"`
	Equipment json.RawMessage `json:"equipment"`
	Jewels    json.RawMessage `json:"jewels"`
	Passives  oauthPassives   `json:"passives"`
}

//nolint:tagliatelle // snake_case is the GGG OAuth API wire contract (passives object).
type oauthPassives struct {
	Hashes              json.RawMessage `json:"hashes"`
	HashesEx            json.RawMessage `json:"hashes_ex"`
	MasteryEffects      json.RawMessage `json:"mastery_effects"`
	JewelData           json.RawMessage `json:"jewel_data"`
	SkillOverrides      json.RawMessage `json:"skill_overrides"`
	AlternateAscendancy int             `json:"alternate_ascendancy"`
}

type legacyCharacter struct {
	Name            string `json:"name"`
	League          string `json:"league"`
	Class           string `json:"class"`
	ClassID         int    `json:"classId"`
	AscendancyClass int    `json:"ascendancyClass"`
	Level           int    `json:"level"`
}

type getItemsBody struct {
	Character legacyCharacter `json:"character"`
	Items     json.RawMessage `json:"items"`
}

//nolint:tagliatelle // snake_case is PoB's character-window/get-passive-skills wire contract.
type getPassivesBody struct {
	Hashes              json.RawMessage `json:"hashes"`
	HashesEx            json.RawMessage `json:"hashes_ex"`
	MasteryEffects      json.RawMessage `json:"mastery_effects"`
	JewelData           json.RawMessage `json:"jewel_data"`
	SkillOverrides      json.RawMessage `json:"skill_overrides"`
	Items               json.RawMessage `json:"items"`
	Character           int             `json:"character"`
	Ascendancy          int             `json:"ascendancy"`
	AlternateAscendancy int             `json:"alternate_ascendancy"`
}

// oauthCharacterPoE2 is the subset of GGG's PoE2 OAuth Character object
// we consume. Shape verified against
// plugins/poe2/testdata/ggg-poe2-character-full.json (see that
// directory's README for provenance) and
// PathOfBuildingCommunity/PathOfBuilding-PoE2's ImportTab.lua. Unlisted
// fields are ignored.
type oauthCharacterPoE2 struct {
	Name      string            `json:"name"`
	League    string            `json:"league"`
	Class     string            `json:"class"`
	Level     int               `json:"level"`
	Equipment json.RawMessage   `json:"equipment"`
	Skills    json.RawMessage   `json:"skills"`
	Jewels    json.RawMessage   `json:"jewels"`
	Passives  oauthPassivesPoE2 `json:"passives"`
}

//nolint:tagliatelle // snake_case is the GGG OAuth API wire contract (passives object).
type oauthPassivesPoE2 struct {
	Hashes              json.RawMessage `json:"hashes"`
	Specialisations     json.RawMessage `json:"specialisations"`
	QuestStats          json.RawMessage `json:"quest_stats"`
	JewelData           json.RawMessage `json:"jewel_data"`
	MasteryEffects      json.RawMessage `json:"mastery_effects"`
	SkillOverrides      json.RawMessage `json:"skill_overrides"`
	AlternateAscendancy int             `json:"alternate_ascendancy"`
}

// poe2ItemsBody is the table PathOfBuilding-PoE2's
// ImportTabClass:ImportItemsAndSkills(charData) indexes directly
// (charData.equipment, charData.skills, charData.level) — no ProcessJSON
// decode step, unlike PoE1.
type poe2ItemsBody struct {
	Equipment json.RawMessage `json:"equipment"`
	Skills    json.RawMessage `json:"skills"`
	Level     int             `json:"level"`
}

// poe2PassivesBody is the table
// ImportTabClass:ImportPassiveTreeAndJewels(charData) indexes directly
// (charData.class, charData.level, charData.jewels, charData.passives).
type poe2PassivesBody struct {
	Class    string            `json:"class"`
	Level    int               `json:"level"`
	Jewels   json.RawMessage   `json:"jewels"`
	Passives poe2PassivesInner `json:"passives"`
}

//nolint:tagliatelle // snake_case is the GGG OAuth API wire contract (passives object).
type poe2PassivesInner struct {
	Hashes              json.RawMessage `json:"hashes"`
	Specialisations     json.RawMessage `json:"specialisations"`
	QuestStats          json.RawMessage `json:"quest_stats"`
	JewelData           json.RawMessage `json:"jewel_data"`
	MasteryEffects      json.RawMessage `json:"mastery_effects"`
	SkillOverrides      json.RawMessage `json:"skill_overrides"`
	AlternateAscendancy int             `json:"alternate_ascendancy"`
}

// rawArray returns v verbatim, or `[]` when absent — PoB's importers
// iterate these with pairs()/ipairs() and must never see null.
func rawArray(v json.RawMessage) json.RawMessage {
	if len(v) == 0 || string(v) == "null" {
		return json.RawMessage(`[]`)
	}
	return v
}

// rawObject returns v verbatim, or `{}` when absent.
func rawObject(v json.RawMessage) json.RawMessage {
	if len(v) == 0 || string(v) == "null" {
		return json.RawMessage(`{}`)
	}
	return v
}

// poeClass maps a GGG `class` string — which is the ascendancy name
// once ascended, otherwise the base class name — to PoB's base classId
// and ascendancy classId. Ordering mirrors PoB's TreeData classes
// (verified against the newest src/TreeData/*/tree.lua). The real-PoB
// integration test in the wrapper-seam task is the correctness arbiter.
type poeClass struct {
	classID  int
	ascendID int
}

//nolint:gochecknoglobals // static class table, built once.
var poeClasses = map[string]poeClass{
	// Base classes (not ascended): ascendancy 0.
	"Scion": {0, 0}, "Marauder": {1, 0}, "Ranger": {2, 0},
	"Witch": {3, 0}, "Duelist": {4, 0}, "Templar": {5, 0}, "Shadow": {6, 0},
	// Ascendancies.
	"Ascendant":  {0, 1},
	"Juggernaut": {1, 1}, "Berserker": {1, 2}, "Chieftain": {1, 3},
	"Deadeye": {2, 1}, "Pathfinder": {2, 2}, "Warden": {2, 3},
	"Occultist": {3, 1}, "Elementalist": {3, 2}, "Necromancer": {3, 3},
	"Slayer": {4, 1}, "Gladiator": {4, 2}, "Champion": {4, 3},
	"Inquisitor": {5, 1}, "Hierophant": {5, 2}, "Guardian": {5, 3},
	"Assassin": {6, 1}, "Trickster": {6, 2}, "Saboteur": {6, 3},
}

func resolveClass(class string) (classID, ascendID int, ok bool) {
	c, found := poeClasses[class]
	if !found {
		return 0, 0, false
	}
	return c.classID, c.ascendID, true
}
