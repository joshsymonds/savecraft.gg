package main

import (
	"testing"
)

func TestCropLookup(t *testing.T) {
	result := lookupCrop("Pumpkin")
	if result == nil {
		t.Fatal("expected result for Pumpkin, got nil")
	}

	if result["name"] != "Pumpkin" {
		t.Errorf("name = %q, want Pumpkin", result["name"])
	}

	seasons := result["seasons"].([]string)
	if len(seasons) != 1 || seasons[0] != "Fall" {
		t.Errorf("seasons = %v, want [Fall]", seasons)
	}

	if result["growthDays"] != 13 {
		t.Errorf("growthDays = %v, want 13", result["growthDays"])
	}

	if result["regrowDays"] != -1 {
		t.Errorf("regrowDays = %v, want -1", result["regrowDays"])
	}

	if result["sellPrice"] != 320 {
		t.Errorf("sellPrice = %v, want 320", result["sellPrice"])
	}

	if result["category"] != "vegetable" {
		t.Errorf("category = %q, want vegetable", result["category"])
	}
}

func TestCropLookupRegrow(t *testing.T) {
	result := lookupCrop("Corn")
	if result == nil {
		t.Fatal("expected result for Corn, got nil")
	}

	seasons := result["seasons"].([]string)
	if len(seasons) != 2 {
		t.Errorf("expected 2 seasons for Corn, got %d", len(seasons))
	}

	if result["growthDays"] != 14 {
		t.Errorf("growthDays = %v, want 14", result["growthDays"])
	}

	if result["regrowDays"] != 4 {
		t.Errorf("regrowDays = %v, want 4", result["regrowDays"])
	}
}

func TestCropLookupCaseInsensitive(t *testing.T) {
	result := lookupCrop("pumpkin")
	if result == nil {
		t.Fatal("expected case-insensitive match for pumpkin")
	}
	if result["name"] != "Pumpkin" {
		t.Errorf("name = %q, want Pumpkin", result["name"])
	}
}

func TestCropLookupUnknown(t *testing.T) {
	result := lookupCrop("Fake Crop")
	if result != nil {
		t.Error("expected nil for unknown crop")
	}
}

func TestSeasonLookup(t *testing.T) {
	results := lookupSeason("Summer")
	if results == nil {
		t.Fatal("expected results for Summer")
	}

	crops := results["crops"].([]any)
	if len(crops) < 5 {
		t.Errorf("expected at least 5 summer crops, got %d", len(crops))
	}

	// Verify sorted by gold/day descending
	var prevGPD float64 = 999999
	for _, c := range crops {
		m := c.(map[string]any)
		gpd := m["goldPerDay"].(float64)
		if gpd > prevGPD {
			t.Errorf("crops not sorted by gold/day: %v (%v) after %v",
				m["name"], gpd, prevGPD)
		}
		prevGPD = gpd
	}
}

func TestSeasonLookupUnknown(t *testing.T) {
	results := lookupSeason("Void")
	if results != nil {
		t.Error("expected nil for unknown season")
	}
}

func TestCropProfitability(t *testing.T) {
	result := lookupCrop("Parsnip")
	if result == nil {
		t.Fatal("expected result for Parsnip")
	}

	// Parsnip: 35g sell, 4 days growth, vegetable
	// Gold/day = 35/4 = 8.75
	gpd := result["goldPerDay"].(float64)
	if gpd < 8.5 || gpd > 9.0 {
		t.Errorf("goldPerDay = %v, want ~8.75", gpd)
	}

	// Tiller: 35 * 1.1 = 38 (truncated) → 38/4 = 9.5
	tillerGPD := result["tillerGoldPerDay"].(float64)
	if tillerGPD < 9.0 || tillerGPD > 10.0 {
		t.Errorf("tillerGoldPerDay = %v, want ~9.5", tillerGPD)
	}

	// Vegetable → Pickle: 2*35 + 50 = 120
	artisan := result["artisanGoods"].(map[string]any)
	if artisan["product"] != "Pickles" {
		t.Errorf("artisan product = %q, want Pickles", artisan["product"])
	}
	if artisan["baseValue"] != 120 {
		t.Errorf("artisan baseValue = %v, want 120", artisan["baseValue"])
	}
}

func TestCropProfitabilityRegrow(t *testing.T) {
	result := lookupCrop("Blueberry")
	if result == nil {
		t.Fatal("expected result for Blueberry")
	}

	// Blueberry: 80g sell, 13 days first, 4 day regrow, Summer only (28 days)
	// Harvests: day 13, 17, 21, 25 = 4 harvests in 28 days
	// Gold/day = (80 * 4) / 28 ≈ 11.43
	// But Blueberry yields 3 per harvest minimum, so 80*3 = 240 per harvest
	// We're computing simple: sellPrice / effective days
	// For regrow: gold/day based on 28-day season window
	gpd := result["goldPerDay"].(float64)
	if gpd < 5.0 {
		t.Errorf("goldPerDay for Blueberry = %v, expected > 5.0", gpd)
	}
}

func TestNetProfitability(t *testing.T) {
	result := lookupCrop("Parsnip")
	if result == nil {
		t.Fatal("expected result for Parsnip")
	}

	// Parsnip: 35g sell, 20g seed, 4 days
	// Net = (35 - 20) / 4 = 3.75
	net := result["netGoldPerDay"].(float64)
	if net < 3.5 || net > 4.0 {
		t.Errorf("netGoldPerDay = %v, want ~3.75", net)
	}

	if result["seedCost"] != 20 {
		t.Errorf("seedCost = %v, want 20", result["seedCost"])
	}
}

func TestNetProfitabilityRegrow(t *testing.T) {
	result := lookupCrop("Corn")
	if result == nil {
		t.Fatal("expected result for Corn")
	}

	// Corn: 50g sell, 150g seed, 14 days first, 4 day regrow
	// Harvests in 28 days: 1 + (28-14)/4 = 4
	// Revenue: 50 * 4 = 200, minus seed 150 = 50 net over 28 days
	// Net/day = 50/28 ≈ 1.79
	net := result["netGoldPerDay"].(float64)
	if net < 1.5 || net > 2.1 {
		t.Errorf("netGoldPerDay for Corn = %v, want ~1.79", net)
	}
}

func TestNetProfitabilityUnbuyableSeed(t *testing.T) {
	result := lookupCrop("Ancient Fruit")
	if result == nil {
		t.Fatal("expected result for Ancient Fruit")
	}

	// Ancient Fruit seeds aren't buyable (seedCost = -1)
	// Net gold/day should equal gross gold/day (no seed to subtract)
	if result["seedCost"] != -1 {
		t.Errorf("seedCost = %v, want -1", result["seedCost"])
	}
	gross := result["goldPerDay"].(float64)
	net := result["netGoldPerDay"].(float64)
	if gross != net {
		t.Errorf("unbuyable seed: netGoldPerDay (%v) != goldPerDay (%v)", net, gross)
	}
}

func TestSpeedGroEffect(t *testing.T) {
	result := lookupCrop("Parsnip")
	if result == nil {
		t.Fatal("expected result for Parsnip")
	}

	speedGro := result["speedGro"].(map[string]any)

	// Parsnip: 4 days base
	// Speed-Gro: floor(4 * 0.9) = 3 days → 35/3 = 11.67 g/day
	sgDays := speedGro["growthDays"].(int)
	if sgDays != 3 {
		t.Errorf("Speed-Gro growthDays = %v, want 3", sgDays)
	}
	sgGPD := speedGro["goldPerDay"].(float64)
	if sgGPD < 11.5 || sgGPD > 12.0 {
		t.Errorf("Speed-Gro goldPerDay = %v, want ~11.67", sgGPD)
	}

	// Deluxe: floor(4 * 0.75) = 3 days
	dsg := result["deluxeSpeedGro"].(map[string]any)
	dsgDays := dsg["growthDays"].(int)
	if dsgDays != 3 {
		t.Errorf("Deluxe Speed-Gro growthDays = %v, want 3", dsgDays)
	}

	// Hyper: floor(4 * 0.67) = 2 days
	hsg := result["hyperSpeedGro"].(map[string]any)
	hsgDays := hsg["growthDays"].(int)
	if hsgDays != 2 {
		t.Errorf("Hyper Speed-Gro growthDays = %v, want 2", hsgDays)
	}
}

func TestSpeedGroRegrowUnchanged(t *testing.T) {
	result := lookupCrop("Strawberry")
	if result == nil {
		t.Fatal("expected result for Strawberry")
	}

	// Speed-Gro only reduces initial growth, regrow is unchanged
	speedGro := result["speedGro"].(map[string]any)
	// Strawberry: 8 days → floor(8*0.9) = 7 days, but regrow stays 4
	if speedGro["growthDays"].(int) >= 8 {
		t.Errorf("Speed-Gro should reduce growth days from 8")
	}
	// More harvests because earlier first harvest
	baseHarvests := result["harvests"].(int)
	sgHarvests := speedGro["harvests"].(int)
	if sgHarvests < baseHarvests {
		t.Errorf("Speed-Gro harvests (%d) should be >= base (%d)", sgHarvests, baseHarvests)
	}
}

func TestProcessingInfo(t *testing.T) {
	result := lookupCrop("Hops")
	if result == nil {
		t.Fatal("expected result for Hops")
	}

	proc := result["processing"].(map[string]any)
	// Hops are vegetable → Pickles (jar) or Juice (keg)
	// But Hops are special: they make Pale Ale in the keg
	// For our generic calc: keg time for vegetable juice = 4 days
	// Hops regrow every 1 day, keg takes 4 days → need 4 kegs per plant
	kegRatio := proc["kegsPerPlant"].(float64)
	if kegRatio < 1.0 {
		t.Errorf("kegsPerPlant for Hops = %v, expected >= 1.0", kegRatio)
	}
}

func TestProcessingSingleHarvest(t *testing.T) {
	result := lookupCrop("Pumpkin")
	if result == nil {
		t.Fatal("expected result for Pumpkin")
	}

	proc := result["processing"].(map[string]any)
	// Single harvest → no ongoing ratio needed, just processing time
	if _, ok := proc["kegsPerPlant"]; ok {
		t.Error("single harvest crop should not have kegsPerPlant")
	}
}

func TestSeasonRankingIncludesNet(t *testing.T) {
	results := lookupSeason("Spring")
	if results == nil {
		t.Fatal("expected results for Spring")
	}

	crops := results["crops"].([]any)
	for _, c := range crops {
		m := c.(map[string]any)
		if _, ok := m["netGoldPerDay"]; !ok {
			t.Errorf("season crop %q missing netGoldPerDay", m["name"])
		}
	}
}

// Tests for structured output (view-compatible structuredContent).

func TestCropQueryResultHasStructuredFields(t *testing.T) {
	result := cropQueryResult("Pumpkin")
	if result == nil {
		t.Fatal("expected result for Pumpkin")
	}

	// Must have formatted text
	if _, ok := result["formatted"].(string); !ok {
		t.Error("missing formatted field")
	}

	// Must have all structured fields from lookupCrop
	required := []string{"name", "seed", "seasons", "growthDays", "regrowDays",
		"sellPrice", "seedCost", "category", "goldPerDay", "netGoldPerDay",
		"harvests", "tillerGoldPerDay", "artisanGoods",
		"speedGro", "deluxeSpeedGro", "hyperSpeedGro", "processing"}
	for _, field := range required {
		if _, ok := result[field]; !ok {
			t.Errorf("missing structured field %q", field)
		}
	}
	if result["name"] != "Pumpkin" {
		t.Errorf("name = %v, want Pumpkin", result["name"])
	}
}

func TestSeasonQueryResultHasStructuredFields(t *testing.T) {
	result := seasonQueryResult("Summer")
	if result == nil {
		t.Fatal("expected result for Summer")
	}

	// Must have formatted text
	if _, ok := result["formatted"].(string); !ok {
		t.Error("missing formatted field")
	}

	// Must have structured fields for view rendering
	if result["season"] != "Summer" {
		t.Errorf("season = %v, want Summer", result["season"])
	}
	crops := result["crops"].([]any)
	if len(crops) < 5 {
		t.Errorf("expected at least 5 crops, got %d", len(crops))
	}
}

func TestAllCropsHaveRequiredFields(t *testing.T) {
	required := []string{"name", "seed", "seasons", "growthDays", "regrowDays",
		"sellPrice", "seedCost", "category", "goldPerDay", "netGoldPerDay",
		"speedGro", "deluxeSpeedGro", "hyperSpeedGro", "processing"}
	for name := range cropData {
		result := lookupCrop(name)
		if result == nil {
			t.Errorf("lookupCrop(%q) returned nil", name)
			continue
		}
		for _, field := range required {
			if _, ok := result[field]; !ok {
				t.Errorf("crop %q missing field %q", name, field)
			}
		}
	}
}
