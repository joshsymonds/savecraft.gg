package main

import (
	"strings"
	"testing"
)

func TestBuildUniqueSQL_WipesAndInserts(t *testing.T) {
	uniques := []ProcessedUnique{
		{
			Name:         "Headhunter",
			BaseType:     "Leather Belt",
			ItemClass:    "Belt",
			LevelReq:     40,
			ImplicitMods: `["+25 to maximum Life"]`,
			ExplicitMods: `["+60 to Strength","+60 to Dexterity","+50 to maximum Life"]`,
			FlavourText:  "A man's soul rules from a cavern of bone.",
		},
	}

	sql := buildUniqueSQL(uniques)

	// Should wipe FTS first, then data.
	if !strings.Contains(sql, "DELETE FROM poe_uniques_fts;") {
		t.Error("SQL should wipe poe_uniques_fts")
	}
	if !strings.Contains(sql, "DELETE FROM poe_uniques;") {
		t.Error("SQL should wipe poe_uniques")
	}

	// Should INSERT (not UPSERT).
	if strings.Contains(sql, "ON CONFLICT") {
		t.Error("SQL should not contain ON CONFLICT (wipe-and-replace)")
	}

	// Should contain the unique name and variant column.
	if !strings.Contains(sql, "Headhunter") {
		t.Error("SQL should contain Headhunter")
	}
	if !strings.Contains(sql, "variant") {
		t.Error("SQL should contain variant column")
	}

	// Should contain FTS5 INSERT.
	ftsCount := strings.Count(sql, "INSERT INTO poe_uniques_fts")
	if ftsCount != 1 {
		t.Errorf("expected 1 FTS5 INSERT, got %d", ftsCount)
	}
}

func TestBuildUniqueSQL_VariantStored(t *testing.T) {
	uniques := []ProcessedUnique{
		{
			Name:         "Atziri's Splendour",
			Variant:      "Armour/ES",
			BaseType:     "Sacrificial Garb",
			ItemClass:    "Body Armour",
			ExplicitMods: `["+100 to Armour","+100 to Energy Shield"]`,
		},
		{
			Name:         "Atziri's Splendour",
			Variant:      "Evasion",
			BaseType:     "Sacrificial Garb",
			ItemClass:    "Body Armour",
			ExplicitMods: `["+200 to Evasion Rating"]`,
		},
	}

	sql := buildUniqueSQL(uniques)

	// Both variants should be present as separate rows.
	insertCount := strings.Count(sql, "INSERT INTO poe_uniques (")
	if insertCount != 2 {
		t.Errorf("expected 2 poe_uniques INSERTs, got %d", insertCount)
	}

	if !strings.Contains(sql, "Armour/ES") {
		t.Error("SQL should contain Armour/ES variant")
	}
	if !strings.Contains(sql, "Evasion") {
		t.Error("SQL should contain Evasion variant")
	}
}

func TestBuildUniqueSQL_EscapesSingleQuotes(t *testing.T) {
	uniques := []ProcessedUnique{
		{
			Name:         "Atziri's Disfavour",
			BaseType:     "Vaal Axe",
			ItemClass:    "Two Hand Axe",
			ExplicitMods: `["+2 to Level of Socketed Support Gems"]`,
			FlavourText:  "Atziri's favourite instrument of justice.",
		},
	}

	sql := buildUniqueSQL(uniques)

	if !strings.Contains(sql, "Atziri''s Disfavour") {
		t.Error("SQL should escape single quotes in unique names")
	}
	if !strings.Contains(sql, "Atziri''s favourite") {
		t.Error("SQL should escape single quotes in flavour text")
	}
}

func TestBuildUniqueSQL_NullableFields(t *testing.T) {
	uniques := []ProcessedUnique{
		{
			Name:         "Tabula Rasa",
			BaseType:     "Simple Robe",
			ItemClass:    "Body Armour",
			LevelReq:     0, // no level requirement
			ExplicitMods: `["Has 6 White Sockets"]`,
			// No flavour text, no properties, no requirements
		},
	}

	sql := buildUniqueSQL(uniques)

	// level_requirement should be NULL.
	if !strings.Contains(sql, "NULL") {
		t.Error("SQL should contain NULL for zero-value fields")
	}
}

func TestBuildUniqueSQL_EmptyInput(t *testing.T) {
	sql := buildUniqueSQL(nil)

	// Should still have DELETE statements.
	if !strings.Contains(sql, "DELETE FROM poe_uniques_fts;") {
		t.Error("SQL should contain DELETE even with no uniques")
	}
	if !strings.Contains(sql, "DELETE FROM poe_uniques;") {
		t.Error("SQL should contain DELETE even with no uniques")
	}
	// No INSERT statements.
	if strings.Contains(sql, "INSERT") {
		t.Error("SQL should not contain INSERT with empty uniques")
	}
}

func TestDeduplicateUniques_PreferLeague(t *testing.T) {
	standard := []NinjaItem{
		{Name: "Headhunter", BaseType: "Leather Belt", ItemType: "Belt", LevelRequired: 40},
		{Name: "Kaom's Heart", BaseType: "Glorious Plate", ItemType: "Body Armour", LevelRequired: 68},
	}
	league := []NinjaItem{
		{Name: "Headhunter", BaseType: "Leather Belt", ItemType: "Belt", LevelRequired: 40,
			ExplicitModifiers: []NinjaMod{{Text: "+60 to Strength"}}},
	}

	result := deduplicateUniques(standard, league)

	if len(result) != 2 {
		t.Fatalf("expected 2 deduplicated uniques, got %d", len(result))
	}

	var hh *ProcessedUnique
	for i := range result {
		if result[i].Name == "Headhunter" {
			hh = &result[i]
			break
		}
	}
	if hh == nil {
		t.Fatal("Headhunter not found in results")
	}
	if hh.ExplicitMods == "[]" {
		t.Error("Headhunter should use league version (has explicit mods), got Standard version")
	}

	var kaom *ProcessedUnique
	for i := range result {
		if result[i].Name == "Kaom's Heart" {
			kaom = &result[i]
			break
		}
	}
	if kaom == nil {
		t.Fatal("Kaom's Heart not found in results")
	}
}

func TestDeduplicateUniques_FiltersLinkedItems(t *testing.T) {
	standard := []NinjaItem{
		{Name: "Briskwrap", BaseType: "Strapped Leather", ItemType: "Body Armour", Links: 0,
			ExplicitModifiers: []NinjaMod{{Text: "base version"}}},
		{Name: "Briskwrap", BaseType: "Strapped Leather", ItemType: "Body Armour", Links: 5,
			ExplicitModifiers: []NinjaMod{{Text: "5L version"}}},
		{Name: "Briskwrap", BaseType: "Strapped Leather", ItemType: "Body Armour", Links: 6,
			ExplicitModifiers: []NinjaMod{{Text: "6L version"}}},
	}

	result := deduplicateUniques(standard, nil)

	// Only links=0 should survive.
	if len(result) != 1 {
		t.Fatalf("expected 1 unique (links=0 only), got %d", len(result))
	}
	if !strings.Contains(result[0].ExplicitMods, "base version") {
		t.Error("should keep the links=0 version")
	}
}

func TestDeduplicateUniques_ReworkedBaseTypes(t *testing.T) {
	standard := []NinjaItem{
		{Name: "Briskwrap", BaseType: "Sun Leather", ItemType: "Body Armour",
			ExplicitModifiers: []NinjaMod{{Text: "old version"}}},
		{Name: "Briskwrap", BaseType: "Strapped Leather", ItemType: "Body Armour",
			ExplicitModifiers: []NinjaMod{{Text: "new version"}}},
	}

	result := deduplicateUniques(standard, nil)

	// Both base types should be separate rows with synthesized variants.
	if len(result) != 2 {
		t.Fatalf("expected 2 variants (different base types), got %d", len(result))
	}

	variantMap := make(map[string]ProcessedUnique)
	for _, u := range result {
		variantMap[u.Variant] = u
	}

	sun, ok := variantMap["Sun Leather"]
	if !ok {
		t.Fatal("Sun Leather variant not found")
	}
	if !strings.Contains(sun.ExplicitMods, "old version") {
		t.Error("Sun Leather variant should have old version mods")
	}

	strapped, ok := variantMap["Strapped Leather"]
	if !ok {
		t.Fatal("Strapped Leather variant not found")
	}
	if !strings.Contains(strapped.ExplicitMods, "new version") {
		t.Error("Strapped Leather variant should have new version mods")
	}
}

func TestDeduplicateUniques_VariantsPreserved(t *testing.T) {
	standard := []NinjaItem{
		{Name: "Atziri's Splendour", Variant: "Armour/ES", BaseType: "Sacrificial Garb", ItemType: "Body Armour"},
		{Name: "Atziri's Splendour", Variant: "Evasion", BaseType: "Sacrificial Garb", ItemType: "Body Armour"},
	}
	league := []NinjaItem{
		{Name: "Atziri's Splendour", Variant: "Armour/ES", BaseType: "Sacrificial Garb", ItemType: "Body Armour",
			ExplicitModifiers: []NinjaMod{{Text: "league version mods"}}},
	}

	result := deduplicateUniques(standard, league)

	if len(result) != 2 {
		t.Fatalf("expected 2 variants, got %d", len(result))
	}

	variantMap := make(map[string]ProcessedUnique)
	for _, u := range result {
		variantMap[u.Variant] = u
	}

	armourES, ok := variantMap["Armour/ES"]
	if !ok {
		t.Fatal("Armour/ES variant not found")
	}
	if armourES.ExplicitMods == "[]" {
		t.Error("Armour/ES variant should use league version")
	}

	_, ok = variantMap["Evasion"]
	if !ok {
		t.Fatal("Evasion variant not found (should be preserved from Standard)")
	}
}

func TestDeduplicateUniques_LeagueOnlyItems(t *testing.T) {
	standard := []NinjaItem{}
	league := []NinjaItem{
		{Name: "New League Unique", BaseType: "Vaal Regalia", ItemType: "Body Armour"},
	}

	result := deduplicateUniques(standard, league)

	if len(result) != 1 {
		t.Fatalf("expected 1 unique, got %d", len(result))
	}
	if result[0].Name != "New League Unique" {
		t.Errorf("expected 'New League Unique', got %q", result[0].Name)
	}
}

func TestProcessNinjaItem(t *testing.T) {
	item := NinjaItem{
		Name:          "Headhunter",
		BaseType:      "Leather Belt",
		ItemType:      "Belt",
		LevelRequired: 40,
		ImplicitModifiers: []NinjaMod{
			{Text: "+25 to maximum Life", Optional: false},
		},
		ExplicitModifiers: []NinjaMod{
			{Text: "+60 to Strength", Optional: false},
			{Text: "+60 to Dexterity", Optional: false},
		},
		FlavourText: "A man's soul rules from a cavern of bone.",
	}

	result := processNinjaItem(item)

	if result.Name != "Headhunter" {
		t.Errorf("expected name 'Headhunter', got %q", result.Name)
	}
	if result.BaseType != "Leather Belt" {
		t.Errorf("expected base_type 'Leather Belt', got %q", result.BaseType)
	}
	if result.ItemClass != "Belt" {
		t.Errorf("expected item_class 'Belt', got %q", result.ItemClass)
	}
	if result.LevelReq != 40 {
		t.Errorf("expected level_requirement 40, got %d", result.LevelReq)
	}
	if !strings.Contains(result.ImplicitMods, "+25 to maximum Life") {
		t.Error("implicit_mods should contain +25 to maximum Life")
	}
	if !strings.Contains(result.ExplicitMods, "+60 to Strength") {
		t.Error("explicit_mods should contain +60 to Strength")
	}
	if result.FlavourText != "A man's soul rules from a cavern of bone." {
		t.Errorf("unexpected flavour_text: %q", result.FlavourText)
	}
}

func TestUniqueEmbeddingText(t *testing.T) {
	u := ProcessedUnique{
		Name:         "Headhunter",
		BaseType:     "Leather Belt",
		ExplicitMods: `["+60 to Strength","+50 to maximum Life"]`,
	}

	text := uniqueEmbeddingText(u)

	if !strings.Contains(text, "Headhunter") {
		t.Error("embedding text should contain name")
	}
	if !strings.Contains(text, "Leather Belt") {
		t.Error("embedding text should contain base type")
	}
	if !strings.Contains(text, "+60 to Strength") {
		t.Error("embedding text should contain explicit mods")
	}
}
