package main

import (
	"slices"
	"testing"
)

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

func TestConvertManaCost(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "generic and two colors", input: "o2oUoB", want: "{2}{U}{B}"},
		{name: "empty string", input: "", want: ""},
		{name: "X and three colors", input: "oXoBoBoB", want: "{X}{B}{B}{B}"},
		{name: "single color", input: "oR", want: "{R}"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := convertManaCost(tt.input)
			if got != tt.want {
				t.Errorf("convertManaCost(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestComputeCMC(t *testing.T) {
	tests := []struct {
		name     string
		manaCost string
		want     float64
	}{
		{name: "generic plus two colors", manaCost: "{2}{U}{B}", want: 4.0},
		{name: "empty string", manaCost: "", want: 0.0},
		{name: "X plus three colors", manaCost: "{X}{B}{B}{B}", want: 3.0},
		{name: "single color", manaCost: "{R}", want: 1.0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := computeCMC(tt.manaCost)
			if got != tt.want {
				t.Errorf("computeCMC(%q) = %f, want %f", tt.manaCost, got, tt.want)
			}
		})
	}
}

func TestMapColors(t *testing.T) {
	tests := []struct {
		name string
		csv  string
		want []string
	}{
		{name: "two colors", csv: "2,3", want: []string{"U", "B"}},
		{name: "empty string", csv: "", want: nil},
		{name: "single color", csv: "1", want: []string{"W"}},
		{name: "all five colors", csv: "1,2,3,4,5", want: []string{"W", "U", "B", "R", "G"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := mapColors(tt.csv)
			if tt.want == nil {
				if got != nil && len(got) != 0 {
					t.Errorf("mapColors(%q) = %v, want nil or empty", tt.csv, got)
				}
			} else if !slices.Equal(got, tt.want) {
				t.Errorf("mapColors(%q) = %v, want %v", tt.csv, got, tt.want)
			}
		})
	}
}

func TestBuildTypeLine(t *testing.T) {
	enumMap := map[string]map[int]string{
		"SuperType": {2: "Legendary"},
		"CardType":  {1: "Artifact", 2: "Creature", 3: "Enchantment"},
		"SubType":   {39: "Human", 67: "Spider", 448: "Hero"},
	}

	tests := []struct {
		name       string
		supertypes string
		types      string
		subtypes   string
		want       string
	}{
		{
			name:       "legendary creature with subtypes",
			supertypes: "2",
			types:      "2",
			subtypes:   "67,39,448",
			want:       "Legendary Creature \u2014 Spider Human Hero",
		},
		{
			name:       "creature with single subtype",
			supertypes: "",
			types:      "2",
			subtypes:   "39",
			want:       "Creature \u2014 Human",
		},
		{
			name:       "artifact with no subtypes",
			supertypes: "",
			types:      "1",
			subtypes:   "",
			want:       "Artifact",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildTypeLine(tt.supertypes, tt.types, tt.subtypes, enumMap)
			if got != tt.want {
				t.Errorf("buildTypeLine(%q, %q, %q, enumMap) = %q, want %q",
					tt.supertypes, tt.types, tt.subtypes, got, tt.want)
			}
		})
	}
}

func TestParseProducedMana(t *testing.T) {
	tests := []struct {
		name         string
		abilityTexts []string
		want         []string
	}{
		{
			name:         "two mana abilities",
			abilityTexts: []string{"{oT}: Add {oU}.", "{oT}: Add {oG}."},
			want:         []string{"G", "U"},
		},
		{
			name:         "no mana abilities",
			abilityTexts: []string{"When CARDNAME enters..."},
			want:         nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseProducedMana(tt.abilityTexts)
			if tt.want == nil {
				if got != nil && len(got) != 0 {
					t.Errorf("parseProducedMana(%v) = %v, want nil or empty", tt.abilityTexts, got)
				}
			} else if !slices.Equal(got, tt.want) {
				t.Errorf("parseProducedMana(%v) = %v, want %v", tt.abilityTexts, got, tt.want)
			}
		})
	}
}

func TestAssembleOracleText(t *testing.T) {
	tests := []struct {
		name         string
		abilityTexts []string
		cardName     string
		want         string
	}{
		{
			name:         "multiple abilities with CARDNAME",
			abilityTexts: []string{"Flying", "When CARDNAME enters, draw a card."},
			cardName:     "Mulldrifter",
			want:         "Flying\nWhen Mulldrifter enters, draw a card.",
		},
		{
			name:         "empty abilities",
			abilityTexts: []string{},
			cardName:     "Island",
			want:         "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := assembleOracleText(tt.abilityTexts, tt.cardName)
			if got != tt.want {
				t.Errorf("assembleOracleText(%v, %q) = %q, want %q",
					tt.abilityTexts, tt.cardName, got, tt.want)
			}
		})
	}
}
