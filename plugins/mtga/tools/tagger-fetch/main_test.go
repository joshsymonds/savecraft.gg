package main

import (
	"strings"
	"testing"
)

func TestBuildRolesImportSQL(t *testing.T) {
	entries := []roleEntry{
		{OracleID: "abc", FrontFaceName: "Murder", Role: "removal", SetCode: "DSK"},
		{OracleID: "def", FrontFaceName: "Grizzly Bears", Role: "creature", SetCode: "DSK"},
		{OracleID: "ghi", FrontFaceName: "Divination", Role: "noncreature_nonremoval", SetCode: "DSK"},
	}

	sql := buildRolesImportSQL(entries)

	if !strings.HasPrefix(sql, "DELETE FROM mtga_card_roles;") {
		t.Error("SQL should start with DELETE")
	}

	insertCount := strings.Count(sql, "INSERT INTO mtga_card_roles")
	if insertCount != 3 {
		t.Errorf("expected 3 INSERTs, got %d", insertCount)
	}

	for _, role := range []string{"removal", "creature", "noncreature_nonremoval"} {
		if !strings.Contains(sql, "'"+role+"'") {
			t.Errorf("SQL should contain role %q", role)
		}
	}
}

func TestBuildRolesImportSQL_EscapesQuotes(t *testing.T) {
	entries := []roleEntry{
		{OracleID: "a", FrontFaceName: "Frodo's Ring", Role: "removal", SetCode: "LTR"},
	}

	sql := buildRolesImportSQL(entries)

	if !strings.Contains(sql, "Frodo''s Ring") {
		t.Error("SQL should escape single quotes")
	}
}

func TestBuildRolesImportSQL_Empty(t *testing.T) {
	sql := buildRolesImportSQL(nil)

	if !strings.Contains(sql, "DELETE FROM mtga_card_roles;") {
		t.Error("SQL should contain DELETE even with no entries")
	}
	if strings.Contains(sql, "INSERT") {
		t.Error("SQL should not contain INSERT with empty entries")
	}
}

func TestRoleDeduplication(t *testing.T) {
	// Simulate the deduplication logic from run(): a card tagged as both
	// "removal" and "sweeper" should only appear once with role "removal".
	entries := []roleEntry{
		{OracleID: "abc", FrontFaceName: "Wrath of God", Role: "removal", SetCode: "DSK"},
		{OracleID: "abc", FrontFaceName: "Wrath of God", Role: "removal", SetCode: "DSK"}, // dup from sweeper tag
	}

	seen := make(map[roleKey]struct{})
	var deduped []roleEntry
	for _, e := range entries {
		key := roleKey{e.OracleID, e.Role, e.SetCode}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, e)
	}

	if len(deduped) != 1 {
		t.Errorf("expected 1 entry after dedup, got %d", len(deduped))
	}
}

func TestMultiRoleCard(t *testing.T) {
	// A creature with ETB removal (like Ravenous Chupacabra) should have both roles.
	entries := []roleEntry{
		{OracleID: "abc", FrontFaceName: "Ravenous Chupacabra", Role: "removal", SetCode: "DSK"},
		{OracleID: "abc", FrontFaceName: "Ravenous Chupacabra", Role: "creature", SetCode: "DSK"},
	}

	seen := make(map[roleKey]struct{})
	var deduped []roleEntry
	for _, e := range entries {
		key := roleKey{e.OracleID, e.Role, e.SetCode}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, e)
	}

	if len(deduped) != 2 {
		t.Errorf("expected 2 entries (creature + removal), got %d", len(deduped))
	}
}

func TestDeriveCABS(t *testing.T) {
	cards := []d1Card{
		// Creature → CABS
		{OracleID: "c-1", FrontFaceName: "Grizzly Bears", TypeLine: "Creature — Bear"},
		// Removal spell → CABS (via existing role)
		{OracleID: "r-1", FrontFaceName: "Murder", TypeLine: "Instant"},
		// Aura → CABS
		{OracleID: "a-1", FrontFaceName: "Pacifism", TypeLine: "Enchantment — Aura"},
		// Equipment → CABS
		{OracleID: "e-1", FrontFaceName: "Short Sword", TypeLine: "Artifact — Equipment"},
		// Planeswalker → CABS
		{OracleID: "p-1", FrontFaceName: "Liliana of the Veil", TypeLine: "Legendary Planeswalker — Liliana"},
		// Vehicle → CABS
		{OracleID: "v-1", FrontFaceName: "Smuggler's Copter", TypeLine: "Artifact — Vehicle"},
		// Pure draw spell → NOT CABS
		{OracleID: "d-1", FrontFaceName: "Divination", TypeLine: "Sorcery"},
		// Lifegain spell → NOT CABS
		{OracleID: "l-1", FrontFaceName: "Revitalize", TypeLine: "Instant"},
		// Non-aura enchantment → NOT CABS
		{OracleID: "n-1", FrontFaceName: "Omen of the Sea", TypeLine: "Enchantment"},
		// Land → NOT CABS (not a spell)
		{OracleID: "land-1", FrontFaceName: "Island", TypeLine: "Basic Land — Island"},
	}

	// Existing roles: creature for Grizzly Bears, removal for Murder
	existingRoles := map[roleKey]struct{}{
		{OracleID: "c-1", Role: "creature", SetCode: "DSK"}:  {},
		{OracleID: "r-1", Role: "removal", SetCode: "DSK"}:   {},
		{OracleID: "d-1", Role: "noncreature_nonremoval", SetCode: "DSK"}: {},
	}

	entries := deriveCABS(cards, existingRoles, "DSK")

	got := make(map[string]bool)
	for _, e := range entries {
		if e.Role != "cabs" {
			t.Errorf("deriveCABS returned role %q for %s, want 'cabs'", e.Role, e.FrontFaceName)
		}
		got[e.OracleID] = true
	}

	// Should be CABS
	for _, tc := range []struct{ id, name string }{
		{"c-1", "Grizzly Bears (creature)"},
		{"r-1", "Murder (removal)"},
		{"a-1", "Pacifism (aura)"},
		{"e-1", "Short Sword (equipment)"},
		{"p-1", "Liliana of the Veil (planeswalker)"},
		{"v-1", "Smuggler's Copter (vehicle)"},
	} {
		if !got[tc.id] {
			t.Errorf("%s should be CABS", tc.name)
		}
	}

	// Should NOT be CABS
	for _, tc := range []struct{ id, name string }{
		{"d-1", "Divination (draw spell)"},
		{"l-1", "Revitalize (lifegain)"},
		{"n-1", "Omen of the Sea (enchantment)"},
		{"land-1", "Island (land)"},
	} {
		if got[tc.id] {
			t.Errorf("%s should NOT be CABS", tc.name)
		}
	}
}

func TestDetectFixingLands(t *testing.T) {
	cards := []d1Card{
		{OracleID: "dual-1", FrontFaceName: "Sunpetal Grove", TypeLine: "Land", ProducedMana: `["G","W"]`},
		{OracleID: "basic-1", FrontFaceName: "Forest", TypeLine: "Basic Land — Forest", ProducedMana: `["G"]`},
		{OracleID: "art-1", FrontFaceName: "Arcane Signet", TypeLine: "Artifact", ProducedMana: `["W","U","B","R","G"]`},
		{OracleID: "tri-1", FrontFaceName: "Jetmir's Garden", TypeLine: "Land — Mountain Forest Plains", ProducedMana: `["R","G","W"]`},
		{OracleID: "empty-1", FrontFaceName: "Maze's End", TypeLine: "Land — Gate", ProducedMana: `[]`},
		{OracleID: "no-pm", FrontFaceName: "Unknown Land", TypeLine: "Land", ProducedMana: ""},
		{OracleID: "utility-1", FrontFaceName: "Hive of the Eye Tyrant", TypeLine: "Land", ProducedMana: `["B","C"]`},
	}

	entries := detectFixingLands(cards, "DSK")

	got := make(map[string]bool)
	for _, e := range entries {
		if e.Role != "mana_fixing" {
			t.Errorf("detectFixingLands returned non-mana_fixing role %q for %s", e.Role, e.FrontFaceName)
		}
		got[e.OracleID] = true
	}

	if !got["dual-1"] {
		t.Error("dual land (Sunpetal Grove) should get mana_fixing")
	}
	if !got["tri-1"] {
		t.Error("triome (Jetmir's Garden) should get mana_fixing")
	}
	if got["basic-1"] {
		t.Error("basic land (Forest) should NOT get mana_fixing")
	}
	if got["art-1"] {
		t.Error("artifact (Arcane Signet) should NOT get mana_fixing from land detection")
	}
	if got["empty-1"] {
		t.Error("land with empty produced_mana should NOT get mana_fixing")
	}
	if got["no-pm"] {
		t.Error("land with missing produced_mana should NOT get mana_fixing")
	}
	// Land producing one color + colorless: NOT mana fixing (colorless isn't a color)
	if got["utility-1"] {
		t.Error("land producing one color + colorless (Hive of the Eye Tyrant) should NOT get mana_fixing")
	}
}
