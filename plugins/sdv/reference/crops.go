package main

import (
	"fmt"
	"math"
	"strings"
)

const seasonDays = 28

// lookupCrop returns crop data with profitability calculations.
// Returns nil if the crop is not found.
func lookupCrop(name string) map[string]any {
	info, ok := cropData[name]
	if !ok {
		// Try case-insensitive match
		for k, v := range cropData {
			if strings.EqualFold(k, name) {
				info = v
				ok = true
				name = k
				break
			}
		}
		if !ok {
			return nil
		}
	}

	gpd, harvests := goldPerDay(info)
	tillerPrice := int(math.Floor(float64(info.SellPrice) * 1.1))
	tillerGPD := float64(tillerPrice) * float64(harvests) / float64(seasonDays)
	if info.RegrowDays < 0 {
		tillerGPD = float64(tillerPrice) / float64(info.GrowthDays)
	}

	result := map[string]any{
		"name":             name,
		"seed":             info.Seed,
		"seasons":          info.Seasons,
		"growthDays":       info.GrowthDays,
		"regrowDays":       info.RegrowDays,
		"sellPrice":        info.SellPrice,
		"category":         info.Category,
		"goldPerDay":       gpd,
		"tillerGoldPerDay": tillerGPD,
	}

	// Artisan goods calculations
	result["artisanGoods"] = artisanGoods(info)

	return result
}

// lookupSeason returns all crops for the given season, sorted by gold/day descending.
// Returns nil if the season is not recognized.
func lookupSeason(season string) map[string]any {
	season = capitalize(strings.ToLower(season))
	if season != "Spring" && season != "Summer" && season != "Fall" && season != "Winter" {
		return nil
	}

	var crops []any
	for name, info := range cropData {
		if !containsSeason(info.Seasons, season) {
			continue
		}
		gpd, _ := goldPerDay(info)
		crops = append(crops, map[string]any{
			"name":       name,
			"growthDays": info.GrowthDays,
			"regrowDays": info.RegrowDays,
			"sellPrice":  info.SellPrice,
			"category":   info.Category,
			"goldPerDay": gpd,
		})
	}

	// Sort by gold/day descending, then by name ascending for stability
	sortCrops(crops)

	return map[string]any{
		"season": season,
		"crops":  crops,
	}
}

// goldPerDay calculates the gold per day for a crop within a single season.
// Returns gold/day and number of harvests.
func goldPerDay(info cropInfo) (float64, int) {
	if info.RegrowDays > 0 {
		// Regrow crop: first harvest at GrowthDays, then every RegrowDays
		harvests := 1 + (seasonDays-info.GrowthDays)/info.RegrowDays
		if harvests < 1 {
			harvests = 1
		}
		return float64(info.SellPrice) * float64(harvests) / float64(seasonDays), harvests
	}
	// Single harvest crop
	return float64(info.SellPrice) / float64(info.GrowthDays), 1
}

// artisanGoods returns artisan processing info for the crop.
func artisanGoods(info cropInfo) map[string]any {
	switch info.Category {
	case "fruit":
		// Wine: 3x base price; Jelly: 2x + 50
		wineBase := info.SellPrice * 3
		jellyBase := info.SellPrice*2 + 50
		wineArtisan := int(math.Floor(float64(wineBase) * 1.4))
		jellyArtisan := int(math.Floor(float64(jellyBase) * 1.4))
		return map[string]any{
			"product":         "Wine",
			"baseValue":       wineBase,
			"artisanValue":    wineArtisan,
			"alt":             "Jelly",
			"altBaseValue":    jellyBase,
			"altArtisanValue": jellyArtisan,
		}
	case "vegetable":
		// Juice: 2.25x base price; Preserves/pickled: 2x + 50
		juiceBase := int(math.Floor(float64(info.SellPrice) * 2.25))
		preserveBase := info.SellPrice*2 + 50
		juiceArtisan := int(math.Floor(float64(juiceBase) * 1.4))
		preserveArtisan := int(math.Floor(float64(preserveBase) * 1.4))
		return map[string]any{
			"product":         "Pickles",
			"baseValue":       preserveBase,
			"artisanValue":    preserveArtisan,
			"alt":             "Juice",
			"altBaseValue":    juiceBase,
			"altArtisanValue": juiceArtisan,
		}
	default:
		return map[string]any{
			"product":   "None",
			"baseValue": 0,
		}
	}
}

func containsSeason(seasons []string, season string) bool {
	for _, s := range seasons {
		if s == season {
			return true
		}
	}
	return false
}

// sortCrops sorts by gold/day descending, then by name ascending for stability.
func sortCrops(crops []any) {
	for i := 1; i < len(crops); i++ {
		j := i
		for j > 0 {
			a := crops[j-1].(map[string]any)
			b := crops[j].(map[string]any)
			aGPD := a["goldPerDay"].(float64)
			bGPD := b["goldPerDay"].(float64)
			if aGPD > bGPD {
				break
			}
			if aGPD == bGPD && a["name"].(string) <= b["name"].(string) {
				break
			}
			crops[j-1], crops[j] = crops[j], crops[j-1]
			j--
		}
	}
}

// formatCropResult formats a crop lookup result as human-readable text.
func formatCropResult(result map[string]any) string {
	var b strings.Builder
	name := result["name"].(string)
	fmt.Fprintf(&b, "Crop: %s\n", name)
	fmt.Fprintf(&b, "Seed: %s\n", result["seed"])
	fmt.Fprintf(&b, "Season: %s\n", strings.Join(result["seasons"].([]string), ", "))
	fmt.Fprintf(&b, "Growth: %d days", result["growthDays"])
	if rd := result["regrowDays"].(int); rd > 0 {
		fmt.Fprintf(&b, " (regrows every %d days)", rd)
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "Category: %s\n\n", result["category"])

	// Sell prices
	sell := result["sellPrice"].(int)
	fmt.Fprintf(&b, "Sell: %dg\n", sell)
	fmt.Fprintf(&b, "Sell (Tiller): %dg\n\n", int(math.Floor(float64(sell)*1.1)))

	// Profitability
	fmt.Fprintf(&b, "Gold/day: %.1f\n", result["goldPerDay"])
	fmt.Fprintf(&b, "Gold/day (Tiller): %.1f\n", result["tillerGoldPerDay"])

	// Artisan goods
	ag := result["artisanGoods"].(map[string]any)
	if ag["product"] != "None" {
		b.WriteString("\nArtisan goods:\n")
		fmt.Fprintf(&b, "  %s: %dg (Artisan: %dg)\n", ag["product"], ag["baseValue"], ag["artisanValue"])
		if alt, ok := ag["alt"].(string); ok {
			fmt.Fprintf(&b, "  %s: %dg (Artisan: %dg)\n", alt, ag["altBaseValue"], ag["altArtisanValue"])
		}
	}

	return b.String()
}

// formatSeasonResult formats a season lookup result as human-readable text.
func formatSeasonResult(result map[string]any) string {
	var b strings.Builder
	season := result["season"].(string)
	fmt.Fprintf(&b, "%s crops (ranked by gold/day):\n\n", season)

	crops := result["crops"].([]any)
	for _, c := range crops {
		m := c.(map[string]any)
		name := m["name"].(string)
		gpd := m["goldPerDay"].(float64)
		sell := m["sellPrice"].(int)
		growth := m["growthDays"].(int)
		regrow := m["regrowDays"].(int)

		regrowStr := ""
		if regrow > 0 {
			regrowStr = fmt.Sprintf(", regrow %dd", regrow)
		}
		fmt.Fprintf(&b, "  %-16s %5.1f g/day  %4dg  %2dd%s\n", name, gpd, sell, growth, regrowStr)
	}

	return b.String()
}
