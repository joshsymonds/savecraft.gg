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
