package main

import (
	"testing"
)

func buildTestTranslator() *StatTranslator {
	entries := []RawStatTranslation{
		// Simple: +X to maximum Life
		{
			IDs: []string{"base_maximum_life"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}},
				Format:        []string{"+#"},
				IndexHandlers: [][]string{nil},
				String:        "{0} to maximum Life",
			}},
		},
		// Negated: increased/reduced pair
		{
			IDs: []string{"physical_damage_+%"},
			English: []TranslationVariant{
				{
					Condition:     []Condition{{Min: intPtr(1)}},
					Format:        []string{"#"},
					IndexHandlers: [][]string{nil},
					String:        "{0}% increased Physical Damage",
				},
				{
					Condition:     []Condition{{Max: intPtr(-1)}},
					Format:        []string{"#"},
					IndexHandlers: [][]string{{"negate"}},
					String:        "{0}% reduced Physical Damage",
				},
			},
		},
		// Multi-stat: Adds X to Y Fire Damage
		{
			IDs: []string{"attack_minimum_added_fire_damage", "attack_maximum_added_fire_damage"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}, {}},
				Format:        []string{"#", "#"},
				IndexHandlers: [][]string{nil, nil},
				String:        "Adds {0} to {1} Fire Damage to Attacks",
			}},
		},
		// Divide by 100
		{
			IDs: []string{"critical_strike_chance_+%_permyriad"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}},
				Format:        []string{"+#"},
				IndexHandlers: [][]string{{"divide_by_one_hundred"}},
				String:        "{0}% to Critical Strike Chance",
			}},
		},
		// Per minute to per second
		{
			IDs: []string{"life_regeneration_rate_per_minute_%"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}},
				Format:        []string{"#"},
				IndexHandlers: [][]string{{"per_minute_to_per_second"}},
				String:        "Regenerate {0}% of Life per second",
			}},
		},
		// Milliseconds to seconds
		{
			IDs: []string{"base_skill_effect_duration_ms"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}},
				Format:        []string{"#"},
				IndexHandlers: [][]string{{"milliseconds_to_seconds"}},
				String:        "Base duration is {0} seconds",
			}},
		},
		// Conditional enum (format: ignore)
		{
			IDs: []string{"jewel_radius_enum"},
			English: []TranslationVariant{
				{
					Condition:     []Condition{{Min: intPtr(1), Max: intPtr(1)}},
					Format:        []string{"ignore"},
					IndexHandlers: [][]string{nil},
					String:        "Only affects Passives in Small Ring",
				},
				{
					Condition:     []Condition{{Min: intPtr(2), Max: intPtr(2)}},
					Format:        []string{"ignore"},
					IndexHandlers: [][]string{nil},
					String:        "Only affects Passives in Medium Ring",
				},
			},
		},
		// Divide by 100 with _if_required
		{
			IDs: []string{"base_critical_multiplier_permyriad"},
			English: []TranslationVariant{{
				Condition:     []Condition{{}},
				Format:        []string{"+#"},
				IndexHandlers: [][]string{{"divide_by_one_hundred_2dp_if_required"}},
				String:        "{0}% to Critical Strike Multiplier",
			}},
		},
		// Chained handlers: negate + divide
		{
			IDs: []string{"leech_rate_per_12"},
			English: []TranslationVariant{
				{
					Condition:     []Condition{{Min: intPtr(1)}},
					Format:        []string{"#"},
					IndexHandlers: [][]string{{"divide_by_twelve"}},
					String:        "{0}% increased Maximum total Life Recovery per second from Leech",
				},
				{
					Condition:     []Condition{{Max: intPtr(-1)}},
					Format:        []string{"#"},
					IndexHandlers: [][]string{{"negate", "divide_by_twelve"}},
					String:        "{0}% reduced Maximum total Life Recovery per second from Leech",
				},
			},
		},
	}

	return NewStatTranslator(entries)
}

func intPtr(v int) *int { return &v }

func TestTranslateSimple(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{{ID: "base_maximum_life", Value: 50}})
	if result != "+50 to maximum Life" {
		t.Errorf("expected '+50 to maximum Life', got %q", result)
	}
}

func TestTranslateNegated(t *testing.T) {
	tr := buildTestTranslator()

	// Positive value → "increased"
	result := tr.Translate([]StatValue{{ID: "physical_damage_+%", Value: 170}})
	if result != "170% increased Physical Damage" {
		t.Errorf("expected '170%% increased Physical Damage', got %q", result)
	}

	// Negative value → "reduced" with negate handler
	result = tr.Translate([]StatValue{{ID: "physical_damage_+%", Value: -20}})
	if result != "20% reduced Physical Damage" {
		t.Errorf("expected '20%% reduced Physical Damage', got %q", result)
	}
}

func TestTranslateMultiStat(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{
		{ID: "attack_minimum_added_fire_damage", Value: 10},
		{ID: "attack_maximum_added_fire_damage", Value: 20},
	})
	if result != "Adds 10 to 20 Fire Damage to Attacks" {
		t.Errorf("expected 'Adds 10 to 20 Fire Damage to Attacks', got %q", result)
	}
}

func TestTranslateDivideBy100(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{{ID: "critical_strike_chance_+%_permyriad", Value: 350}})
	if result != "+3.5% to Critical Strike Chance" {
		t.Errorf("expected '+3.5%% to Critical Strike Chance', got %q", result)
	}

	// Whole number result should not have decimals
	result = tr.Translate([]StatValue{{ID: "critical_strike_chance_+%_permyriad", Value: 200}})
	if result != "+2% to Critical Strike Chance" {
		t.Errorf("expected '+2%% to Critical Strike Chance', got %q", result)
	}
}

func TestTranslatePerMinuteToPerSecond(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{{ID: "life_regeneration_rate_per_minute_%", Value: 120}})
	if result != "Regenerate 2% of Life per second" {
		t.Errorf("expected 'Regenerate 2%% of Life per second', got %q", result)
	}
}

func TestTranslateMillisecondsToSeconds(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{{ID: "base_skill_effect_duration_ms", Value: 4000}})
	if result != "Base duration is 4 seconds" {
		t.Errorf("expected 'Base duration is 4 seconds', got %q", result)
	}
}

func TestTranslateConditionalEnum(t *testing.T) {
	tr := buildTestTranslator()

	result := tr.Translate([]StatValue{{ID: "jewel_radius_enum", Value: 1}})
	if result != "Only affects Passives in Small Ring" {
		t.Errorf("expected 'Only affects Passives in Small Ring', got %q", result)
	}

	result = tr.Translate([]StatValue{{ID: "jewel_radius_enum", Value: 2}})
	if result != "Only affects Passives in Medium Ring" {
		t.Errorf("expected 'Only affects Passives in Medium Ring', got %q", result)
	}
}

func TestTranslateDivideIfRequired(t *testing.T) {
	tr := buildTestTranslator()

	// Fractional result — should show decimals
	result := tr.Translate([]StatValue{{ID: "base_critical_multiplier_permyriad", Value: 350}})
	if result != "+3.50% to Critical Strike Multiplier" {
		t.Errorf("expected '+3.50%% to Critical Strike Multiplier', got %q", result)
	}

	// Whole number result — should still show 2dp for _2dp_if_required when fractional
	result = tr.Translate([]StatValue{{ID: "base_critical_multiplier_permyriad", Value: 200}})
	if result != "+2% to Critical Strike Multiplier" {
		t.Errorf("expected '+2%% to Critical Strike Multiplier', got %q", result)
	}
}

func TestTranslateChainedHandlers(t *testing.T) {
	tr := buildTestTranslator()

	// Positive: just divide by 12
	result := tr.Translate([]StatValue{{ID: "leech_rate_per_12", Value: 24}})
	if result != "2% increased Maximum total Life Recovery per second from Leech" {
		t.Errorf("expected '2%% increased...', got %q", result)
	}

	// Negative: negate then divide by 12
	result = tr.Translate([]StatValue{{ID: "leech_rate_per_12", Value: -24}})
	if result != "2% reduced Maximum total Life Recovery per second from Leech" {
		t.Errorf("expected '2%% reduced...', got %q", result)
	}
}

func TestTranslateUnknownStat(t *testing.T) {
	tr := buildTestTranslator()
	result := tr.Translate([]StatValue{{ID: "unknown_stat_xyz", Value: 42}})
	if result != "" {
		t.Errorf("expected empty string for unknown stat, got %q", result)
	}
}

func TestTranslatePlusFormat(t *testing.T) {
	tr := buildTestTranslator()
	// Negative value with +# format should still show the sign
	result := tr.Translate([]StatValue{{ID: "base_maximum_life", Value: -10}})
	if result != "-10 to maximum Life" {
		t.Errorf("expected '-10 to maximum Life', got %q", result)
	}
}

func TestExtractModName(t *testing.T) {
	tests := []struct {
		template string
		expected string
	}{
		{"{0}% increased Physical Damage", "% increased Physical Damage"},
		{"+{0} to maximum Life", "to maximum Life"},
		{"Adds {0} to {1} Fire Damage to Attacks", "Adds to Fire Damage to Attacks"},
		{"Only affects Passives in Small Ring", "Only affects Passives in Small Ring"},
		{"Regenerate {0}% of Life per second", "Regenerate % of Life per second"},
	}

	for _, tt := range tests {
		result := extractModName(tt.template)
		if result != tt.expected {
			t.Errorf("extractModName(%q) = %q, want %q", tt.template, result, tt.expected)
		}
	}
}
