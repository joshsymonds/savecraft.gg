package main

import "testing"

func TestStripMarkup(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "no markup",
			input: "Lightning Bolt",
			want:  "Lightning Bolt",
		},
		{
			name:  "sprite tag for Alchemy",
			input: `<sprite="SpriteSheet_MiscIcons" name="arena_a">Alrund's Epiphany`,
			want:  "A-Alrund's Epiphany",
		},
		{
			name:  "nobr tag",
			input: "<nobr>Sewer-veillance</nobr> Cam",
			want:  "Sewer-veillance Cam",
		},
		{
			name:  "both sprite and nobr",
			input: `<sprite="SpriteSheet_MiscIcons" name="arena_a"><nobr>Some-Card</nobr> Name`,
			want:  "A-Some-Card Name",
		},
		{
			name:  "empty string",
			input: "",
			want:  "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripMarkup(tt.input)
			if got != tt.want {
				t.Errorf("stripMarkup(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestMapRarity(t *testing.T) {
	tests := []struct {
		input int
		want  string
	}{
		{0, "token"},
		{1, "common"},
		{2, "uncommon"},
		{3, "rare"},
		{4, "mythic"},
		{5, "mythic"},
		{99, "unknown"},
	}
	for _, tt := range tests {
		got := mapRarity(tt.input)
		if got != tt.want {
			t.Errorf("mapRarity(%d) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
