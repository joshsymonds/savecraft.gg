package main

import (
	"fmt"
	"math"
	"slices"
	"strings"
)

const seasonDays = 28

// Speed-Gro reduction multipliers (applied to initial growth only, not regrow).
const (
	speedGroMult       = 0.90
	deluxeSpeedGroMult = 0.75
	hyperSpeedGroMult  = 0.67
	kegDaysFruit       = 7 // days to process fruit in keg (wine)
	kegDaysVegetable   = 4 // days to process vegetable in keg (juice)
	preservesJarDays   = 4 // days for preserves jar (jelly/pickles)
)

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

	// Net profitability: subtract seed cost from gross revenue.
	netGPD := netGoldPerDay(info, gpd, harvests)

	result := map[string]any{
		"name":             name,
		"seed":             info.Seed,
		"seasons":          info.Seasons,
		"growthDays":       info.GrowthDays,
		"regrowDays":       info.RegrowDays,
		"sellPrice":        info.SellPrice,
		"seedCost":         info.SeedCost,
		"category":         info.Category,
		"goldPerDay":       gpd,
		"netGoldPerDay":    netGPD,
		"harvests":         harvests,
		"tillerGoldPerDay": tillerGPD,
	}

	// Artisan goods calculations
	result["artisanGoods"] = artisanGoods(info)

	// Speed-Gro calculations (reduces initial growth, not regrow)
	result["speedGro"] = speedGroCalc(info, speedGroMult)
	result["deluxeSpeedGro"] = speedGroCalc(info, deluxeSpeedGroMult)
	result["hyperSpeedGro"] = speedGroCalc(info, hyperSpeedGroMult)

	// Processing info (keg/jar throughput)
	result["processing"] = processingInfo(info)

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
		gpd, harvests := goldPerDay(info)
		netGPD := netGoldPerDay(info, gpd, harvests)
		crops = append(crops, map[string]any{
			"name":          name,
			"growthDays":    info.GrowthDays,
			"regrowDays":    info.RegrowDays,
			"sellPrice":     info.SellPrice,
			"seedCost":      info.SeedCost,
			"category":      info.Category,
			"goldPerDay":    gpd,
			"netGoldPerDay": netGPD,
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
		harvests := max(1, 1+(seasonDays-info.GrowthDays)/info.RegrowDays)
		return float64(info.SellPrice) * float64(harvests) / float64(seasonDays), harvests
	}
	// Single harvest crop
	return float64(info.SellPrice) / float64(info.GrowthDays), 1
}

// netGoldPerDay subtracts the one-time seed cost from gross seasonal revenue.
// If seed cost is -1 (not buyable), net equals gross (seed is free/found).
func netGoldPerDay(info cropInfo, grossGPD float64, harvests int) float64 {
	if info.SeedCost < 0 {
		return grossGPD
	}
	if info.RegrowDays > 0 {
		// Regrow crop: one seed cost spread over all harvests in the season
		revenue := float64(info.SellPrice) * float64(harvests)
		return (revenue - float64(info.SeedCost)) / float64(seasonDays)
	}
	// Single harvest: seed cost subtracted from that one harvest
	return float64(info.SellPrice-info.SeedCost) / float64(info.GrowthDays)
}

// speedGroCalc returns growth and profitability stats with a Speed-Gro multiplier.
// Speed-Gro only reduces the initial growth phase, not regrow days.
func speedGroCalc(info cropInfo, mult float64) map[string]any {
	reduced := max(1, int(math.Floor(float64(info.GrowthDays)*mult)))

	var gpd float64
	var harvests int
	if info.RegrowDays > 0 {
		harvests = max(1, 1+(seasonDays-reduced)/info.RegrowDays)
		gpd = float64(info.SellPrice) * float64(harvests) / float64(seasonDays)
	} else {
		harvests = 1
		gpd = float64(info.SellPrice) / float64(reduced)
	}

	return map[string]any{
		"growthDays": reduced,
		"goldPerDay": gpd,
		"harvests":   harvests,
	}
}

// processingInfo returns keg/jar throughput data.
// For regrow crops, calculates kegsPerPlant (how many kegs you need per plant
// to keep up with harvest frequency).
func processingInfo(info cropInfo) map[string]any {
	result := map[string]any{}

	var kegDays int
	switch info.Category {
	case "fruit":
		kegDays = kegDaysFruit
		result["kegProduct"] = "Wine"
		result["kegValue"] = info.SellPrice * 3
		result["jarProduct"] = "Jelly"
		result["jarValue"] = info.SellPrice*2 + 50
	case "vegetable":
		kegDays = kegDaysVegetable
		result["kegProduct"] = "Juice"
		result["kegValue"] = int(math.Floor(float64(info.SellPrice) * 2.25))
		result["jarProduct"] = "Pickles"
		result["jarValue"] = info.SellPrice*2 + 50
	default:
		result["kegProduct"] = "None"
		result["jarProduct"] = "None"
		return result
	}

	result["kegDays"] = kegDays
	result["jarDays"] = preservesJarDays

	// For regrow crops, calculate how many kegs/jars you need per plant
	if info.RegrowDays > 0 {
		result["kegsPerPlant"] = float64(kegDays) / float64(info.RegrowDays)
		result["jarsPerPlant"] = float64(preservesJarDays) / float64(info.RegrowDays)
	}

	return result
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
	return slices.Contains(seasons, season)
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
	fmt.Fprintf(&b, "Seed: %s", result["seed"])
	if sc := result["seedCost"].(int); sc >= 0 {
		fmt.Fprintf(&b, " (%dg)", sc)
	} else {
		b.WriteString(" (not sold in shops)")
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "Season: %s\n", strings.Join(result["seasons"].([]string), ", "))
	fmt.Fprintf(&b, "Growth: %d days", result["growthDays"])
	if rd := result["regrowDays"].(int); rd > 0 {
		fmt.Fprintf(&b, " (regrows every %d days)", rd)
	}
	b.WriteString("\n")
	fmt.Fprintf(&b, "Category: %s\n", result["category"])
	fmt.Fprintf(&b, "Harvests per season: %d\n", result["harvests"])

	// Profitability
	sell := result["sellPrice"].(int)
	b.WriteString("\nProfitability:\n")
	fmt.Fprintf(&b, "  Sell: %dg (Tiller: %dg)\n", sell, int(math.Floor(float64(sell)*1.1)))
	fmt.Fprintf(&b, "  Gold/day: %.1f (Tiller: %.1f)\n", result["goldPerDay"], result["tillerGoldPerDay"])
	fmt.Fprintf(&b, "  Net gold/day: %.1f", result["netGoldPerDay"])
	if sc := result["seedCost"].(int); sc >= 0 {
		fmt.Fprintf(&b, " (after %dg seed cost)", sc)
	}
	b.WriteString("\n")

	// Speed-Gro
	b.WriteString("\nFertilizer:\n")
	formatSpeedGro(&b, "Speed-Gro", result["speedGro"].(map[string]any))
	formatSpeedGro(&b, "Deluxe Speed-Gro", result["deluxeSpeedGro"].(map[string]any))
	formatSpeedGro(&b, "Hyper Speed-Gro", result["hyperSpeedGro"].(map[string]any))

	// Artisan goods
	ag := result["artisanGoods"].(map[string]any)
	if ag["product"] != "None" {
		b.WriteString("\nArtisan goods:\n")
		fmt.Fprintf(&b, "  %s: %dg (Artisan: %dg)\n", ag["product"], ag["baseValue"], ag["artisanValue"])
		if alt, ok := ag["alt"].(string); ok {
			fmt.Fprintf(&b, "  %s: %dg (Artisan: %dg)\n", alt, ag["altBaseValue"], ag["altArtisanValue"])
		}
	}

	// Processing
	proc := result["processing"].(map[string]any)
	if proc["kegProduct"] != "None" {
		b.WriteString("\nProcessing:\n")
		fmt.Fprintf(&b, "  Keg: %s (%dg, %d days)\n", proc["kegProduct"], proc["kegValue"], proc["kegDays"])
		fmt.Fprintf(&b, "  Jar: %s (%dg, %d days)\n", proc["jarProduct"], proc["jarValue"], proc["jarDays"])
		if kpp, ok := proc["kegsPerPlant"].(float64); ok {
			fmt.Fprintf(&b, "  Kegs per plant: %.1f (jars: %.1f)\n", kpp, proc["jarsPerPlant"])
		}
	}

	return b.String()
}

func formatSpeedGro(b *strings.Builder, label string, sg map[string]any) {
	fmt.Fprintf(b, "  %-18s %dd growth, %d harvests, %.1f g/day\n",
		label+":", sg["growthDays"], sg["harvests"], sg["goldPerDay"])
}

// formatSeasonResult formats a season lookup result as human-readable text.
func formatSeasonResult(result map[string]any) string {
	var b strings.Builder
	season := result["season"].(string)
	fmt.Fprintf(&b, "%s crops (ranked by gold/day):\n\n", season)
	fmt.Fprintf(&b, "  %-16s %s  %s  %s  %s  %s  %s\n",
		"Name", "Gross", "  Net", " Sell", "Seed", "Growth", "Type")
	fmt.Fprintf(&b, "  %-16s %s  %s  %s  %s  %s  %s\n",
		"────", "─────", " ────", " ────", "────", "──────", "────")

	for _, c := range result["crops"].([]any) {
		m := c.(map[string]any)
		name := m["name"].(string)
		gpd := m["goldPerDay"].(float64)
		net := m["netGoldPerDay"].(float64)
		sell := m["sellPrice"].(int)
		seedCost := m["seedCost"].(int)
		growth := m["growthDays"].(int)
		regrow := m["regrowDays"].(int)
		cat := m["category"].(string)

		seedStr := "  — "
		if seedCost >= 0 {
			seedStr = fmt.Sprintf("%4d", seedCost)
		}

		growthStr := fmt.Sprintf("%2dd", growth)
		if regrow > 0 {
			growthStr = fmt.Sprintf("%2dd+%dd", growth, regrow)
		}

		fmt.Fprintf(&b, "  %-16s %5.1f  %5.1f  %4dg  %sg  %-7s %s\n",
			name, gpd, net, sell, seedStr, growthStr, cat)
	}

	return b.String()
}
