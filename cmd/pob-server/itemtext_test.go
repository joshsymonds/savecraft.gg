package main

import (
	"strings"
	"testing"
)

func TestValidateItemText(t *testing.T) {
	// Valid PoB item text — must have Rarity header and -------- separator.
	validRare := strings.Join([]string{
		"Rarity: Rare",
		"Bramble Song",
		"Kinetic Wand",
		"--------",
		"Adds 20 to 360 Lightning Damage",
		"38% increased Critical Strike Chance",
	}, "\n")
	validUnique := strings.Join([]string{
		"Rarity: Unique",
		"Aegis Aurora",
		"Lacquered Buckler",
		"--------",
		"Chance to Block: 27%",
		"--------",
		"+2% to all maximum Resistances while your Energy Shield is full",
	}, "\n")
	validMagic := strings.Join([]string{
		"Rarity: Magic",
		"Enhanced Kinetic Wand of Woe",
		"--------",
		"Adds 10 to 50 Lightning Damage",
	}, "\n")
	// CRLF line endings — common from Windows exports.
	validCRLF := strings.ReplaceAll(validRare, "\n", "\r\n")

	// The exact production-captured crashing text (pob-server journal
	// 2026-04-18T07:19:22). No title line, no -------- separator.
	productionCrash := strings.Join([]string{
		"Kinetic Wand",
		"Rarity: Rare",
		"Cannot roll Caster Modifiers",
		"Adds 20 to 360 Lightning Damage",
		"Adds 14 to 28 Fire Damage",
		"Adds 14 to 28 Cold Damage",
		"38% increased Critical Strike Chance",
		"+45% to Global Critical Strike Multiplier",
		"Can have up to 3 Crafted Modifiers",
	}, "\n")

	cases := []struct {
		name      string
		text      string
		wantError string // substring; empty means must pass
	}{
		{"valid rare", validRare, ""},
		{"valid unique (two separators)", validUnique, ""},
		{"valid magic", validMagic, ""},
		{"valid with CRLF line endings", validCRLF, ""},

		{"empty string", "", "empty"},
		{"whitespace only", "   \n\t  \n  ", "empty"},

		{"missing Rarity header", "Kinetic Wand\n--------\nAdds 10 to 50 Lightning Damage", "Rarity:"},

		{"missing --------  separator", productionCrash, "--------"},
		{"no separator, just Rarity", "Rarity: Rare\nKinetic Wand\nAdds 10 to 50 Lightning Damage", "--------"},

		{"exceeds size limit", "Rarity: Rare\n" + strings.Repeat("a", maxItemTextBytes), "size limit"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateItemText(tc.text)
			switch {
			case tc.wantError == "" && err != nil:
				t.Fatalf("expected valid, got error: %v", err)
			case tc.wantError != "" && err == nil:
				t.Fatalf("expected error containing %q, got nil", tc.wantError)
			case tc.wantError != "" && !strings.Contains(err.Error(), tc.wantError):
				t.Fatalf("error %q does not contain %q", err.Error(), tc.wantError)
			}
		})
	}
}

// Invariant: the error message for missing-separator must mention the
// canonical PoB item format skeleton so the AI caller can self-correct
// without reading the server source. If this assertion ever changes,
// also update the tool-description in plugins/poe/reference/build-planner.ts
// so the two copies agree on the stated format.
func TestValidateItemTextErrorNamesFormat(t *testing.T) {
	err := validateItemText("Rarity: Rare\nKinetic Wand\nAdds 10 to 50 Lightning Damage")
	if err == nil {
		t.Fatal("expected error for missing separator")
	}
	msg := err.Error()
	for _, want := range []string{"--------", "Rarity:"} {
		if !strings.Contains(msg, want) {
			t.Errorf("error message missing %q: %s", want, msg)
		}
	}
}
