package main

import "testing"

func TestCommanderSlug(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple", "Atraxa, Praetors' Voice", "atraxa-praetors-voice"},
		{"single word", "Meren", "meren"},
		{"multiple spaces", "The Ur-Dragon", "the-ur-dragon"},
		{"commas", "Korvold, Fae-Cursed King", "korvold-fae-cursed-king"},
		{"apostrophe", "Kozilek, Butcher of Truth", "kozilek-butcher-of-truth"},
		{"slash partner", "Kraum, Ludevic's Opus // Tymna the Weaver", "kraum-ludevics-opus-tymna-the-weaver"},
		{"accent stripped", "Jégo", "jego"},
		{"already slug", "atraxa-praetors-voice", "atraxa-praetors-voice"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := commanderSlug(tc.in)
			if got != tc.want {
				t.Errorf("commanderSlug(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
