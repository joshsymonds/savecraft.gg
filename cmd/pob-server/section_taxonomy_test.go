package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// rawWithOldSections constructs the wrapper.lua-shaped response (old section
// names) that filterSections must remap to the new taxonomy.
const rawWithOldSections = `{
	"character": {"class":"Witch","ascendancy":"Occultist","level":99},
	"summary": {"CombinedDPS":100000,"Life":6728},
	"section_index": [],
	"sections": {
		"offense": {"TotalDPS":100000,"CritChance":45.5},
		"ailments": {"BleedDamage":250},
		"defense": {"Armour":5000,"Evasion":3000},
		"resistances": {"FireResist":75,"ColdResist":75,"ChaosResist":40},
		"ehp": {"PhysicalMaximumHitTaken":25000},
		"recovery": {"LifeRegenRecovery":50},
		"charges": {"FrenzyChargeMax":3},
		"limits": {"ActiveTotemLimit":1},
		"minion_offense": {"MinionDamage":12345},
		"minion_defense": {"MinionLife":3000},
		"socket_groups": [{"label":"Main","gems":[]}],
		"items": {"Helmet":{"name":"Atziri's Foible"}},
		"keystones": ["Acrobatics"],
		"tree": {"version":"3.28","allocated_nodes":95},
		"config": {"conditionLowLife":true}
	}
}`

func mustFilter(t *testing.T, sections []string) map[string]json.RawMessage {
	t.Helper()
	out, err := filterSections(json.RawMessage(rawWithOldSections), sections)
	if err != nil {
		t.Fatalf("filterSections: %v", err)
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	return parsed
}

// sectionsObj returns the parsed `sections` field from a filtered result.
func sectionsObj(t *testing.T, parsed map[string]json.RawMessage) map[string]json.RawMessage {
	t.Helper()
	raw, ok := parsed["sections"]
	if !ok {
		return nil
	}
	var out map[string]json.RawMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("sections is not an object: %v", err)
	}
	return out
}

// TestSectionDefaultIsSummaryOnly: omitting `sections` returns a response
// without the `sections` key. Top-level summary is preserved.
func TestSectionDefaultIsSummaryOnly(t *testing.T) {
	parsed := mustFilter(t, nil)
	if _, hasSections := parsed["sections"]; hasSections {
		t.Errorf("default response must not include `sections` key, got: %s", parsed["sections"])
	}
	if _, hasSummary := parsed["summary"]; !hasSummary {
		t.Errorf("default response must include `summary`")
	}
}

// TestSectionOffenseAggregatesOldSections: requesting `offense` returns the
// union of old offense + ailments + minion_offense + charges + limits.
func TestSectionOffenseAggregatesOldSections(t *testing.T) {
	parsed := mustFilter(t, []string{"offense"})
	sections := sectionsObj(t, parsed)
	if len(sections) != 1 {
		t.Fatalf("expected only 'offense' key, got %v", keys(sections))
	}
	var offense map[string]any
	if err := json.Unmarshal(sections["offense"], &offense); err != nil {
		t.Fatal(err)
	}
	wantKeys := []string{"TotalDPS", "CritChance", "BleedDamage", "MinionDamage", "FrenzyChargeMax", "ActiveTotemLimit"}
	for _, key := range wantKeys {
		if _, ok := offense[key]; !ok {
			t.Errorf("offense missing %q (from old sub-section); got keys: %v", key, mapKeys(offense))
		}
	}
}

// TestSectionDefenseAggregatesOldSections: `defense` = old defense +
// resistances + ehp + recovery + minion_defense.
func TestSectionDefenseAggregatesOldSections(t *testing.T) {
	parsed := mustFilter(t, []string{"defense"})
	sections := sectionsObj(t, parsed)
	var defense map[string]any
	if err := json.Unmarshal(sections["defense"], &defense); err != nil {
		t.Fatal(err)
	}
	wantKeys := []string{"Armour", "Evasion", "FireResist", "ColdResist", "ChaosResist", "PhysicalMaximumHitTaken", "LifeRegenRecovery", "MinionLife"}
	for _, key := range wantKeys {
		if _, ok := defense[key]; !ok {
			t.Errorf("defense missing %q; got keys: %v", key, mapKeys(defense))
		}
	}
}

// TestSectionGearGroupsItemsAndSocketGroups: `gear` exposes both old
// `items` (object) and `socket_groups` (array) under sub-keys.
func TestSectionGearGroupsItemsAndSocketGroups(t *testing.T) {
	parsed := mustFilter(t, []string{"gear"})
	sections := sectionsObj(t, parsed)
	var gear map[string]json.RawMessage
	if err := json.Unmarshal(sections["gear"], &gear); err != nil {
		t.Fatal(err)
	}
	if _, ok := gear["items"]; !ok {
		t.Errorf("gear.items missing")
	}
	if _, ok := gear["socket_groups"]; !ok {
		t.Errorf("gear.socket_groups missing")
	}
}

// TestSectionTreeIncludesKeystones: `tree` includes the old tree summary
// AND the keystones array under a sub-key.
func TestSectionTreeIncludesKeystones(t *testing.T) {
	parsed := mustFilter(t, []string{"tree"})
	sections := sectionsObj(t, parsed)
	var tree map[string]json.RawMessage
	if err := json.Unmarshal(sections["tree"], &tree); err != nil {
		t.Fatal(err)
	}
	// Tree summary fields preserved.
	if _, ok := tree["version"]; !ok {
		t.Errorf("tree.version missing")
	}
	if _, ok := tree["allocated_nodes"]; !ok {
		t.Errorf("tree.allocated_nodes missing")
	}
	// Keystones folded in.
	if _, ok := tree["keystones"]; !ok {
		t.Errorf("tree.keystones missing")
	}
}

// TestSectionConfigUnchanged: `config` is the same as old `config`.
func TestSectionConfigUnchanged(t *testing.T) {
	parsed := mustFilter(t, []string{"config"})
	sections := sectionsObj(t, parsed)
	var config map[string]any
	if err := json.Unmarshal(sections["config"], &config); err != nil {
		t.Fatal(err)
	}
	if got, _ := config["conditionLowLife"].(bool); !got {
		t.Errorf("config.conditionLowLife not preserved: %v", config)
	}
}

// TestSectionMultipleAtOnce: `offense,gear` returns both unions.
func TestSectionMultipleAtOnce(t *testing.T) {
	parsed := mustFilter(t, []string{"offense", "gear"})
	sections := sectionsObj(t, parsed)
	if _, ok := sections["offense"]; !ok {
		t.Error("offense missing")
	}
	if _, ok := sections["gear"]; !ok {
		t.Error("gear missing")
	}
	if len(sections) != 2 {
		t.Errorf("expected exactly 2 sections, got %v", keys(sections))
	}
}

// TestSectionUnknownNameRejected: an old (deleted) section name like
// "ailments" returns an error pointing at the new mapping.
func TestSectionUnknownNameRejected(t *testing.T) {
	for _, oldName := range []string{
		"ailments", "resistances", "ehp", "recovery", "charges", "limits",
		"socket_groups", "items", "keystones", "minion_offense", "minion_defense",
	} {
		_, err := filterSections(json.RawMessage(rawWithOldSections), []string{oldName})
		if err == nil {
			t.Errorf("expected error for old section %q, got nil", oldName)
			continue
		}
		if !strings.Contains(err.Error(), oldName) {
			t.Errorf("error for %q should mention the bad name; got: %v", oldName, err)
		}
	}
}

// TestSectionGarbageNameRejected: a totally unknown name is also rejected
// with a helpful error listing the valid names.
func TestSectionGarbageNameRejected(t *testing.T) {
	_, err := filterSections(json.RawMessage(rawWithOldSections), []string{"chiropractic"})
	if err == nil {
		t.Fatal("expected error for unknown section, got nil")
	}
	for _, want := range []string{"summary", "offense", "defense", "gear", "tree", "config"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error must list valid name %q; got: %v", want, err)
		}
	}
}

// TestSectionIndexLists6NewNames: the response's section_index lists the
// six new names (replacing the per-Lua-section list of 15 old names).
func TestSectionIndexLists6NewNames(t *testing.T) {
	parsed := mustFilter(t, nil)
	raw, ok := parsed["section_index"]
	if !ok {
		t.Fatal("section_index missing")
	}
	var index []map[string]string
	if err := json.Unmarshal(raw, &index); err != nil {
		t.Fatalf("section_index is not an array: %v", err)
	}
	gotIDs := make(map[string]bool)
	for _, entry := range index {
		gotIDs[entry["id"]] = true
	}
	wantIDs := []string{"summary", "offense", "defense", "gear", "tree", "config"}
	for _, want := range wantIDs {
		if !gotIDs[want] {
			t.Errorf("section_index missing id=%q; got: %v", want, mapKeysStr(gotIDs))
		}
	}
	if len(index) != 6 {
		t.Errorf("section_index should have 6 entries, got %d", len(index))
	}
}

// helpers
func keys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func mapKeys(m map[string]any) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func mapKeysStr(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
