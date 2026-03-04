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

func TestAllCropsHaveRequiredFields(t *testing.T) {
	required := []string{"name", "seed", "seasons", "growthDays", "regrowDays", "sellPrice", "category"}
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
