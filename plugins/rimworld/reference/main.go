// RimWorld reference module: serves computed game reference data.
// Runs server-side in Cloudflare Worker via WASI shim.
//
// Contract: JSON query on stdin, ndjson result on stdout.
// Empty query {} returns the module schema (self-describing).
//
// Build: GOOS=wasip1 GOARCH=wasm go build -o reference.wasm ./plugins/rimworld/reference
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/calc"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/combat"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/crops"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/drugs"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/genes"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/materials"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/raids"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/research"
	"github.com/joshsymonds/savecraft.gg/plugins/rimworld/reference/surgery"
)

// projectMap is lazily initialized on first use. WASI is single-threaded,
// so a simple nil check suffices.
var projectMap map[string]research.ResearchProject

func buildProjectMap() map[string]research.ResearchProject {
	if projectMap != nil {
		return projectMap
	}
	projectMap = make(map[string]research.ResearchProject, len(data.ResearchProjects))
	for _, p := range data.ResearchProjects {
		projectMap[p.DefName] = research.ResearchProject{
			DefName:       p.DefName,
			Label:         p.Label,
			BaseCost:      p.BaseCost,
			TechLevel:     p.TechLevel,
			Prerequisites: p.Prerequisites,
		}
	}
	return projectMap
}

func main() {
	enc := json.NewEncoder(os.Stdout)

	inputData, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError(enc, "read_error", "failed to read stdin: "+err.Error())
		os.Exit(1)
	}

	var query map[string]any
	if err := json.Unmarshal(inputData, &query); err != nil {
		writeError(enc, "parse_error", "invalid JSON query: "+err.Error())
		os.Exit(1)
	}

	if len(query) == 0 {
		writeResult(enc, "Schema", schema())
		return
	}

	module, _ := query["module"].(string)
	switch module {
	case "surgery":
		handleSurgery(enc, query)
	case "crops":
		handleCrops(enc, query)
	case "combat":
		handleCombat(enc, query)
	case "materials":
		handleMaterials(enc, query)
	case "drugs":
		handleDrugs(enc, query)
	case "raids":
		handleRaids(enc, query)
	case "genes":
		handleGenes(enc, query)
	case "research":
		handleResearch(enc, query)
	default:
		writeError(enc, "unknown_module", "unknown module: "+module)
		os.Exit(1)
	}
}

func handleSurgery(enc *json.Encoder, query map[string]any) {
	p := surgery.Params{
		MedicalSkill:    intParam(query, "skill", 10),
		Manipulation:    floatParam(query, "manipulation", 1.0),
		Sight:           floatParam(query, "sight", 1.0),
		Cleanliness:     floatParam(query, "cleanliness", 0),
		GlowLevel:       floatParam(query, "glow", 1.0),
		IsOutdoors:      boolParam(query, "outdoors", false),
		MedicinePotency: floatParam(query, "medicine_potency", 1.0),
		Difficulty:      floatParam(query, "difficulty", 1.0),
		Inspired:        boolParam(query, "inspired", false),
	}

	// Resolve bed and quality from string parameters
	p.BedFactor = resolveBedFactor(query)
	p.Quality = resolveQuality(query)

	// Allow direct medicine_potency or resolve from medicine name
	if _, has := query["medicine_potency"]; !has {
		if med, ok := query["medicine"].(string); ok {
			p.MedicinePotency = resolveMedicinePotency(med)
		}
	}

	result := surgery.Calculate(p)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Surgery Success Chance: %.1f%%\n\n", result.SuccessChance*100)
	fmt.Fprintf(&sb, "Factor Breakdown:\n")
	fmt.Fprintf(&sb, "  Surgeon stat:     %.2f (skill %d x manipulation %.0f%% x sight %.0f%%)\n",
		result.SurgeonFactor, p.MedicalSkill, p.Manipulation*100, p.Sight*100)
	fmt.Fprintf(&sb, "  Bed effective:    %.2f (base %.2f x quality %.2f x cleanliness %.2f x glow %.2f x outdoors %.2f)\n",
		result.BedEffectiveFactor, p.BedFactor,
		surgery.QualityFactor(p.Quality),
		surgery.CleanlinessFactor(p.Cleanliness),
		surgery.GlowFactor(p.GlowLevel),
		calc.OutdoorsFactor(p.IsOutdoors))
	fmt.Fprintf(&sb, "  Medicine:         %.2f (potency %.2f)\n", result.MedicineFactor, p.MedicinePotency)
	fmt.Fprintf(&sb, "  Difficulty:       %.2f\n", result.DifficultyFactor)
	if p.Inspired {
		fmt.Fprintf(&sb, "  Inspired surgery: x2.00\n")
	}
	if result.Capped {
		fmt.Fprintf(&sb, "\n! Result capped at 98%% (uncapped: %.1f%%)\n", result.Uncapped*100)
	}

	writeResult(enc, "Surgery Calculator", map[string]any{
		"formatted":       sb.String(),
		"success_chance":  roundN(result.SuccessChance, 3),
		"surgeon_factor":  roundN(result.SurgeonFactor, 2),
		"bed_factor":      roundN(result.BedEffectiveFactor, 2),
		"medicine_factor": roundN(result.MedicineFactor, 2),
		"difficulty":      roundN(result.DifficultyFactor, 2),
		"inspired":        p.Inspired,
		"capped":          result.Capped,
		"uncapped":        roundN(result.Uncapped, 3),
	})
}

func resolveBedFactor(query map[string]any) float64 {
	if f, ok := query["bed_factor"].(float64); ok {
		return f
	}
	bed, _ := query["bed"].(string)
	if bed != "" {
		// Try data-driven lookup first
		bestScore := 0
		bestFactor := 0.0
		for _, b := range data.Beds {
			if score := matchDef(bed, b.DefName, b.Label); score > bestScore {
				bestScore = score
				bestFactor = b.SurgerySuccessChanceFactor
			}
		}
		if bestScore > 0 {
			return bestFactor
		}
	}
	// Default: regular bed
	return 1.0
}

func resolveQuality(query map[string]any) int {
	if q, ok := query["quality"].(float64); ok {
		return int(q)
	}
	q, _ := query["quality"].(string)
	switch strings.ToLower(q) {
	case "awful":
		return calc.QualityAwful
	case "poor":
		return calc.QualityPoor
	case "normal", "":
		return calc.QualityNormal
	case "good":
		return calc.QualityGood
	case "excellent":
		return calc.QualityExcellent
	case "masterwork":
		return calc.QualityMasterwork
	case "legendary":
		return calc.QualityLegendary
	default:
		return calc.QualityNormal
	}
}

func resolveMedicinePotency(medicine string) float64 {
	// Try data-driven lookup first
	bestScore := 0
	bestPotency := 0.0
	for _, m := range data.Medicines {
		if score := matchDef(medicine, m.DefName, m.Label); score > bestScore {
			bestScore = score
			bestPotency = m.MedicalPotency
		}
	}
	if bestScore > 0 {
		return bestPotency
	}
	// Fallback for common aliases not in the data
	switch strings.ToLower(medicine) {
	case "none", "no medicine", "":
		return 0
	case "herbal", "herbal medicine":
		return 0.6
	case "medicine", "industrial", "industrial medicine":
		return 1.0
	case "glitterworld", "glitterworld medicine", "ultratech":
		return 1.6
	default:
		return 1.0
	}
}

func handleCrops(enc *json.Encoder, query map[string]any) {
	crop, _ := query["crop"].(string)
	soil, _ := query["soil"].(string)
	temperature := floatParam(query, "temperature", 20)
	colonists := intParam(query, "colonists", 1)

	// Find the plant (exact -> prefix -> substring)
	var plant *data.Plant
	bestScore := 0
	for i := range data.Plants {
		p := &data.Plants[i]
		if score := matchDef(crop, p.DefName, p.Label); score > bestScore {
			plant = p
			bestScore = score
		}
	}
	if plant == nil {
		// List available crops
		var names []string
		for _, p := range data.Plants {
			if len(p.SowTags) > 0 && containsTag(p.SowTags, "Ground", "Hydroponic") {
				names = append(names, p.Label)
			}
		}
		writeError(enc, "unknown_crop", fmt.Sprintf("Unknown crop %q. Available: %s", crop, strings.Join(names, ", ")))
		return
	}

	// Resolve soil fertility
	soilFertility := 1.0 // default: normal soil
	if soil != "" {
		bestSoilScore := 0
		for _, s := range data.Soils {
			if score := matchDef(soil, s.DefName, s.Label); score > bestSoilScore {
				soilFertility = s.Fertility
				bestSoilScore = score
			}
		}
		// Also handle "hydroponics" as a special case (fertility 2.0, no soil)
		if strings.Contains(strings.ToLower(soil), "hydroponic") {
			soilFertility = 2.0
		}
	}

	result := crops.Calculate(crops.CropParams{
		GrowDays:             plant.GrowDays,
		HarvestYield:         plant.HarvestYield,
		NutritionPerUnit:     plant.NutritionPerUnit,
		MarketValuePerUnit:   plant.MarketValuePerUnit,
		FertilitySensitivity: plant.FertilitySensitivity,
		SoilFertility:        soilFertility,
		Temperature:          temperature,
	})

	tiles := crops.TilesPerColonist(result.NutritionPerDay, colonists)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Crop: %s\n", plant.Label)
	fmt.Fprintf(&sb, "Soil fertility: %.1f | Temperature: %.0f C\n\n", soilFertility, temperature)

	if result.GrowthRate <= 0 {
		fmt.Fprintf(&sb, "Cannot grow at this temperature.\n")
	} else {
		fmt.Fprintf(&sb, "Growth rate: %.0f%%\n", result.GrowthRate*100)
		fmt.Fprintf(&sb, "Actual days to harvest: %.1f\n", result.ActualGrowDays)
		fmt.Fprintf(&sb, "Harvest: %.0f x %s\n\n", plant.HarvestYield, plant.HarvestedItem)
		if plant.NutritionPerUnit > 0 {
			fmt.Fprintf(&sb, "Nutrition/day/tile: %.4f\n", result.NutritionPerDay)
			if colonists > 0 {
				fmt.Fprintf(&sb, "Tiles to feed %d colonist(s): %.0f\n", colonists, tiles)
			}
		}
		fmt.Fprintf(&sb, "Silver/day/tile: %.3f\n", result.SilverPerDay)
	}

	canHydro := containsTag(plant.SowTags, "Hydroponic")
	fmt.Fprintf(&sb, "\nHydroponics eligible: %v\n", canHydro)
	fmt.Fprintf(&sb, "Sow tags: %s\n", strings.Join(plant.SowTags, ", "))

	writeResult(enc, plant.Label, map[string]any{
		"formatted":         sb.String(),
		"crop":              plant.Label,
		"growth_rate":       roundN(result.GrowthRate, 2),
		"actual_grow_days":  roundN(result.ActualGrowDays, 1),
		"nutrition_per_day": roundN(result.NutritionPerDay, 4),
		"silver_per_day":    roundN(result.SilverPerDay, 3),
		"tiles_needed":      roundN(tiles, 0),
		"hydroponics":       canHydro,
	})
}

func handleMaterials(enc *json.Encoder, query map[string]any) {
	material, _ := query["material"].(string)
	quality := resolveQuality(query)

	if material == "" {
		// List all materials
		var mats []map[string]any
		for _, m := range data.Materials {
			mats = append(mats, map[string]any{
				"name":          m.Label,
				"sharp_armor":   roundN(m.SharpArmorFactor, 2),
				"blunt_armor":   roundN(m.BluntArmorFactor, 2),
				"sharp_damage":  roundN(m.SharpDamageFactor, 2),
				"blunt_damage":  roundN(m.BluntDamageFactor, 2),
				"market_value":  roundN(m.MarketValue, 2),
				"max_hp_factor": roundN(m.MaxHitPointsFactor, 2),
				"categories":    m.Categories,
			})
		}
		writeResult(enc, "Materials", map[string]any{
			"materials": mats,
		})
		return
	}

	var mat *data.Material
	bestMatScore := 0
	for i := range data.Materials {
		m := &data.Materials[i]
		if score := matchDef(material, m.DefName, m.Label); score > bestMatScore {
			mat = m
			bestMatScore = score
		}
	}
	if mat == nil {
		writeError(enc, "unknown_material", fmt.Sprintf("Unknown material %q", material))
		return
	}

	armorQ := materials.ArmorQuality(quality)
	dmgQ := materials.DamageQuality(quality)
	hpQ := materials.HitPointsQuality(quality)
	mvQ := materials.MarketValueQuality(quality)

	qualityName := qualityNames[quality]

	var sb strings.Builder
	fmt.Fprintf(&sb, "%s (%s quality)\n\n", mat.Label, qualityName)
	fmt.Fprintf(&sb, "Stat Factors (material x quality):\n")
	fmt.Fprintf(&sb, "  Sharp armor:  %.2f x %.2f = %.2f\n", mat.SharpArmorFactor, armorQ, mat.SharpArmorFactor*armorQ)
	fmt.Fprintf(&sb, "  Blunt armor:  %.2f x %.2f = %.2f\n", mat.BluntArmorFactor, armorQ, mat.BluntArmorFactor*armorQ)
	fmt.Fprintf(&sb, "  Heat armor:   %.2f x %.2f = %.2f\n", mat.HeatArmorFactor, armorQ, mat.HeatArmorFactor*armorQ)
	fmt.Fprintf(&sb, "  Sharp damage: %.2f x %.2f = %.2f\n", mat.SharpDamageFactor, dmgQ, mat.SharpDamageFactor*dmgQ)
	fmt.Fprintf(&sb, "  Blunt damage: %.2f x %.2f = %.2f\n", mat.BluntDamageFactor, dmgQ, mat.BluntDamageFactor*dmgQ)
	fmt.Fprintf(&sb, "  Max HP:       %.2f x %.2f = %.2f\n", mat.MaxHitPointsFactor, hpQ, mat.MaxHitPointsFactor*hpQ)
	fmt.Fprintf(&sb, "  Market value: %.2f x %.2f = %.2f\n", mat.MarketValue, mvQ, mat.MarketValue*mvQ)
	if mat.ColdInsulation > 0 || mat.HeatInsulation > 0 {
		fmt.Fprintf(&sb, "\nInsulation:\n")
		fmt.Fprintf(&sb, "  Cold: %.1f C | Heat: %.1f C\n", mat.ColdInsulation, mat.HeatInsulation)
	}
	fmt.Fprintf(&sb, "\nCategories: %s\n", strings.Join(mat.Categories, ", "))

	writeResult(enc, mat.Label, map[string]any{
		"formatted":    sb.String(),
		"material":     mat.Label,
		"quality":      qualityName,
		"sharp_armor":  roundN(mat.SharpArmorFactor*armorQ, 2),
		"blunt_armor":  roundN(mat.BluntArmorFactor*armorQ, 2),
		"heat_armor":   roundN(mat.HeatArmorFactor*armorQ, 2),
		"sharp_damage": roundN(mat.SharpDamageFactor*dmgQ, 2),
		"blunt_damage": roundN(mat.BluntDamageFactor*dmgQ, 2),
		"max_hp":       roundN(mat.MaxHitPointsFactor*hpQ, 2),
	})
}

var qualityNames = [7]string{"awful", "poor", "normal", "good", "excellent", "masterwork", "legendary"}

func handleDrugs(enc *json.Encoder, query map[string]any) {
	drug, _ := query["drug"].(string)

	if drug == "" {
		// List all drugs
		var drugList []map[string]any
		for _, d := range data.Drugs {
			drugList = append(drugList, map[string]any{
				"name":          d.Label,
				"market_value":  roundN(d.MarketValue, 0),
				"category":      d.Category,
				"addictiveness": roundN(d.Addictiveness, 1),
				"ingredients":   d.Ingredients,
			})
		}
		writeResult(enc, "Drugs", map[string]any{
			"drugs": drugList,
		})
		return
	}

	var d *data.Drug
	bestDrugScore := 0
	for i := range data.Drugs {
		dd := &data.Drugs[i]
		if score := matchDef(drug, dd.DefName, dd.Label); score > bestDrugScore {
			d = dd
			bestDrugScore = score
		}
	}
	if d == nil {
		writeError(enc, "unknown_drug", fmt.Sprintf("Unknown drug %q", drug))
		return
	}

	// Check if production chain query (soil or temperature parameter present)
	_, hasSoil := query["soil"]
	_, hasTemp := query["temperature"]
	if hasSoil || hasTemp {
		handleDrugProductionChain(enc, query, d)
		return
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "%s (%s)\n\n", d.Label, d.Category)
	fmt.Fprintf(&sb, "Market value: %.0f silver\n", d.MarketValue)
	if d.WorkAmount > 0 {
		fmt.Fprintf(&sb, "Work to make: %.0f\n", d.WorkAmount)
	}
	if len(d.Ingredients) > 0 {
		fmt.Fprintf(&sb, "Ingredients: %s\n", strings.Join(d.Ingredients, ", "))
		// Compute silver per ingredient
		for _, ing := range d.Ingredients {
			parts := strings.SplitN(ing, ":", 2)
			if len(parts) == 2 {
				count := 0.0
				fmt.Sscanf(parts[1], "%f", &count)
				if count > 0 {
					fmt.Fprintf(&sb, "  Silver per %s: %.2f\n", parts[0], drugs.SilverPerLeaf(d.MarketValue, count))
				}
			}
		}
	}
	fmt.Fprintf(&sb, "\nAddiction Risk:\n")
	fmt.Fprintf(&sb, "  Base chance: %.1f%%\n", d.Addictiveness*100)
	if d.MinToleranceToAddict > 0 {
		fmt.Fprintf(&sb, "  Min tolerance to addict: %.0f%%\n", d.MinToleranceToAddict*100)
	}
	if d.OverdoseSeverity > 0 {
		fmt.Fprintf(&sb, "  Overdose severity: %.2f\n", d.OverdoseSeverity)
	}

	writeResult(enc, d.Label, map[string]any{
		"formatted":     sb.String(),
		"drug":          d.Label,
		"category":      d.Category,
		"market_value":  roundN(d.MarketValue, 0),
		"addictiveness": roundN(d.Addictiveness, 1),
		"work_amount":   roundN(d.WorkAmount, 0),
	})
}

// handleDrugProductionChain computes silver/day/tile for a drug's crop-to-drug pipeline.
// It looks up the drug's first ingredient plant in data.Plants and runs the production
// chain calculation with the given soil/temperature conditions.
func handleDrugProductionChain(enc *json.Encoder, query map[string]any, d *data.Drug) {
	soil, _ := query["soil"].(string)
	temperature := floatParam(query, "temperature", 20)

	// Find the first ingredient that corresponds to a plant's harvest
	var plant *data.Plant
	var leavesPerDrug float64
	for _, ing := range d.Ingredients {
		parts := strings.SplitN(ing, ":", 2)
		if len(parts) != 2 {
			continue
		}
		itemDef := parts[0]
		count := 0.0
		fmt.Sscanf(parts[1], "%f", &count)
		if count <= 0 {
			continue
		}
		// Search for a plant that harvests this item
		for i := range data.Plants {
			p := &data.Plants[i]
			if strings.EqualFold(p.HarvestedItem, itemDef) {
				plant = p
				leavesPerDrug = count
				break
			}
		}
		if plant != nil {
			break
		}
	}

	if plant == nil {
		writeError(enc, "no_plant_ingredient",
			fmt.Sprintf("Drug %q has no plant-based ingredient for production chain calculation", d.Label))
		return
	}

	// Resolve soil fertility
	soilFertility := 1.0
	if soil != "" {
		bestSoilScore := 0
		for _, s := range data.Soils {
			if score := matchDef(soil, s.DefName, s.Label); score > bestSoilScore {
				soilFertility = s.Fertility
				bestSoilScore = score
			}
		}
		if strings.Contains(strings.ToLower(soil), "hydroponic") {
			soilFertility = 2.0
		}
	}

	result := drugs.ProductionChain(drugs.ProductionParams{
		CropGrowDays:         plant.GrowDays,
		CropYield:            plant.HarvestYield,
		FertilitySensitivity: plant.FertilitySensitivity,
		SoilFertility:        soilFertility,
		Temperature:          temperature,
		LeavesPerDrug:        leavesPerDrug,
		DrugMarketValue:      d.MarketValue,
		DrugWorkAmount:       d.WorkAmount,
	})

	var sb strings.Builder
	fmt.Fprintf(&sb, "%s Production Chain\n\n", d.Label)
	fmt.Fprintf(&sb, "Crop: %s (%.1f grow days)\n", plant.Label, plant.GrowDays)
	fmt.Fprintf(&sb, "Soil fertility: %.1f | Temperature: %.0f C\n\n", soilFertility, temperature)

	if result.ActualGrowDays <= 0 {
		fmt.Fprintf(&sb, "Cannot grow at this temperature.\n")
	} else {
		fmt.Fprintf(&sb, "Actual grow days: %.1f\n", result.ActualGrowDays)
		fmt.Fprintf(&sb, "Leaves/day/tile: %.3f\n", result.LeavesPerDay)
		fmt.Fprintf(&sb, "Drugs/day/tile: %.4f (%.0f leaves per drug)\n", result.DrugsPerDayPerTile, leavesPerDrug)
		fmt.Fprintf(&sb, "Silver/day/tile: %.3f\n", result.SilverPerDayPerTile)
	}

	writeResult(enc, d.Label+" Production Chain", map[string]any{
		"formatted":        sb.String(),
		"drug":             d.Label,
		"crop":             plant.Label,
		"soil_fertility":   roundN(soilFertility, 1),
		"actual_grow_days": roundN(result.ActualGrowDays, 1),
		"leaves_per_day":   roundN(result.LeavesPerDay, 3),
		"drugs_per_day":    roundN(result.DrugsPerDayPerTile, 4),
		"silver_per_day":   roundN(result.SilverPerDayPerTile, 3),
	})
}

func handleRaids(enc *json.Encoder, query map[string]any) {
	itemWealth := floatParam(query, "item_wealth", 0)
	buildingWealth := floatParam(query, "building_wealth", 0)
	// Also accept simple "wealth" as total (items only)
	if itemWealth == 0 {
		itemWealth = floatParam(query, "wealth", 0)
	}
	colonists := intParam(query, "colonists", 1)

	result := raids.Calculate(raids.RaidParams{
		ItemWealth:     itemWealth,
		BuildingWealth: buildingWealth,
		Colonists:      colonists,
	})

	var sb strings.Builder
	fmt.Fprintf(&sb, "Raid Threat Estimate\n\n")
	fmt.Fprintf(&sb, "Colony Wealth:\n")
	fmt.Fprintf(&sb, "  Item wealth:     %.0f\n", itemWealth)
	fmt.Fprintf(&sb, "  Building wealth: %.0f (counted at 50%% = %.0f)\n", buildingWealth, buildingWealth*0.5)
	fmt.Fprintf(&sb, "  Effective total: %.0f\n\n", result.TotalWealth)
	fmt.Fprintf(&sb, "Raid Points:\n")
	fmt.Fprintf(&sb, "  From wealth:     %.0f\n", result.WealthPoints)
	fmt.Fprintf(&sb, "  From %d colonist(s): %.0f (%.0f each)\n", colonists, result.PawnPoints, result.PawnPoints/max(float64(colonists), 1))
	fmt.Fprintf(&sb, "  Total:           %.0f\n", result.TotalPoints)

	writeResult(enc, "Raid Threat Estimate", map[string]any{
		"formatted":     sb.String(),
		"total_wealth":  roundN(result.TotalWealth, 0),
		"wealth_points": roundN(result.WealthPoints, 0),
		"pawn_points":   roundN(result.PawnPoints, 0),
		"total_points":  roundN(result.TotalPoints, 0),
	})
}

func handleGenes(enc *json.Encoder, query map[string]any) {
	maxComplexity := intParam(query, "max_complexity", 6)
	minMetabolism := intParam(query, "min_metabolism", -5)

	// If gene names provided, validate the build
	geneNames, _ := query["genes"].([]any)
	if len(geneNames) > 0 {
		var entries []genes.GeneEntry
		for _, gn := range geneNames {
			name, _ := gn.(string)
			var bestGene *data.Gene
			bestGeneScore := 0
			for i := range data.Genes {
				g := &data.Genes[i]
				if score := matchDef(name, g.DefName, g.Label); score > bestGeneScore {
					bestGene = g
					bestGeneScore = score
				}
			}
			if bestGene != nil {
				entries = append(entries, genes.GeneEntry{
					DefName:          bestGene.DefName,
					Label:            bestGene.Label,
					Complexity:       bestGene.Complexity,
					MetabolismOffset: bestGene.MetabolismOffset,
					ArchiteCost:      bestGene.ArchiteCost,
					ExclusionTags:    bestGene.ExclusionTags,
					Category:         bestGene.Category,
				})
			}
		}

		result := genes.ValidateBuild(entries, maxComplexity, minMetabolism)

		var sb strings.Builder
		fmt.Fprintf(&sb, "Gene Build Validation (max complexity: %d, min metabolism: %d)\n\n", maxComplexity, minMetabolism)
		for _, e := range entries {
			fmt.Fprintf(&sb, "  %s: cpx %d, met %+d\n", e.Label, e.Complexity, e.MetabolismOffset)
		}
		fmt.Fprintf(&sb, "\nTotals: complexity %d/%d, metabolism %+d/%+d",
			result.TotalComplexity, maxComplexity, result.TotalMetabolism, minMetabolism)
		if !result.ComplexityOK {
			fmt.Fprintf(&sb, " [OVER COMPLEXITY]")
		}
		if !result.MetabolismOK {
			fmt.Fprintf(&sb, " [OVER METABOLISM]")
		}
		if result.TotalArchite > 0 {
			fmt.Fprintf(&sb, "\nArchite capsules needed: %d", result.TotalArchite)
		}
		if len(result.Conflicts) > 0 {
			fmt.Fprintf(&sb, "\n\nCONFLICTS:")
			for _, c := range result.Conflicts {
				fmt.Fprintf(&sb, "\n  %s vs %s (tag: %s)", c.Gene1, c.Gene2, c.Tag)
			}
		}

		writeResult(enc, "Gene Build", map[string]any{
			"formatted":        sb.String(),
			"total_complexity": result.TotalComplexity,
			"total_metabolism": result.TotalMetabolism,
			"total_archite":    result.TotalArchite,
			"complexity_ok":    result.ComplexityOK,
			"metabolism_ok":    result.MetabolismOK,
			"conflicts":        result.Conflicts,
		})
		return
	}

	// Search/list genes
	search, _ := query["search"].(string)
	category, _ := query["category"].(string)
	var results []map[string]any
	for _, g := range data.Genes {
		if g.Label == "" {
			continue
		}
		if search != "" && !strings.Contains(strings.ToLower(g.Label), strings.ToLower(search)) &&
			!strings.Contains(strings.ToLower(g.Description), strings.ToLower(search)) {
			continue
		}
		if category != "" && !strings.EqualFold(g.Category, category) {
			continue
		}
		results = append(results, map[string]any{
			"name":       g.Label,
			"def_name":   g.DefName,
			"complexity": g.Complexity,
			"metabolism": g.MetabolismOffset,
			"archite":    g.ArchiteCost,
			"category":   g.Category,
			"conflicts":  g.ExclusionTags,
		})
	}
	writeResult(enc, "Genes", map[string]any{
		"genes": results,
		"count": len(results),
	})
}

func handleResearch(enc *json.Encoder, query map[string]any) {
	target, _ := query["project"].(string)
	colonyTech, _ := query["colony_tech"].(string)
	if colonyTech == "" {
		colonyTech = "Industrial"
	}

	pm := buildProjectMap()

	if target == "" {
		// List all projects
		var projects []map[string]any
		for _, p := range data.ResearchProjects {
			projects = append(projects, map[string]any{
				"name":          p.Label,
				"def_name":      p.DefName,
				"cost":          p.BaseCost,
				"tech_level":    p.TechLevel,
				"prerequisites": p.Prerequisites,
			})
		}
		writeResult(enc, "Research Projects", map[string]any{
			"projects": projects,
			"count":    len(projects),
		})
		return
	}

	// Find the target project (exact -> prefix -> substring)
	var targetDef string
	bestProjScore := 0
	for _, p := range data.ResearchProjects {
		if score := matchDef(target, p.DefName, p.Label); score > bestProjScore {
			targetDef = p.DefName
			bestProjScore = score
		}
	}
	if targetDef == "" {
		writeError(enc, "unknown_project", fmt.Sprintf("Unknown research project %q", target))
		return
	}

	chain := research.PrerequisiteChain(pm, targetDef)
	totalCost := research.ChainCost(pm, chain, colonyTech)

	var sb strings.Builder
	fmt.Fprintf(&sb, "Research Chain: %s (colony tech: %s)\n\n", targetDef, colonyTech)
	for i, name := range chain {
		p := pm[name]
		mult := research.TechLevelMultiplier(p.TechLevel, colonyTech)
		effectiveCost := p.BaseCost * mult
		fmt.Fprintf(&sb, "  %d. %s [%s] -- %.0f", i+1, p.Label, p.TechLevel, p.BaseCost)
		if mult > 1 {
			fmt.Fprintf(&sb, " x %.1f = %.0f", mult, effectiveCost)
		}
		fmt.Fprintf(&sb, "\n")
	}
	fmt.Fprintf(&sb, "\nTotal cost: %.0f\n", totalCost)

	writeResult(enc, pm[targetDef].Label+" Research", map[string]any{
		"formatted":   sb.String(),
		"chain":       chain,
		"total_cost":  roundN(totalCost, 0),
		"colony_tech": colonyTech,
	})
}

func handleCombat(enc *json.Encoder, query map[string]any) {
	weapon, _ := query["weapon"].(string)

	if weapon == "" {
		var names []string
		for _, w := range data.RangedWeapons {
			names = append(names, w.Label)
		}
		for _, w := range data.MeleeWeapons {
			names = append(names, w.Label)
		}
		writeError(enc, "missing_weapon",
			fmt.Sprintf("No weapon specified. Available: %s", strings.Join(names, ", ")))
		return
	}

	rangeTiles := floatParam(query, "range", 12)
	armorRating := floatParam(query, "armor", 0)

	// Try ranged weapons (exact -> prefix -> substring)
	var bestRanged *data.RangedWeapon
	bestRangedScore := 0
	for i := range data.RangedWeapons {
		w := &data.RangedWeapons[i]
		if score := matchDef(weapon, w.DefName, w.Label); score > bestRangedScore {
			bestRanged = w
			bestRangedScore = score
		}
	}

	// Try melee weapons (exact -> prefix -> substring)
	var bestMelee *data.MeleeWeapon
	bestMeleeScore := 0
	for i := range data.MeleeWeapons {
		w := &data.MeleeWeapons[i]
		if score := matchDef(weapon, w.DefName, w.Label); score > bestMeleeScore {
			bestMelee = w
			bestMeleeScore = score
		}
	}

	// Pick the best overall match (ranged wins ties since it's checked first)
	if bestRanged != nil && bestRangedScore >= bestMeleeScore {
		w := bestRanged
		stats := combat.RangedWeaponStats{
			DamagePerShot:          w.DamagePerShot,
			ArmorPenetration:       w.ArmorPenetration,
			BurstShotCount:         w.BurstShotCount,
			WarmupTime:             w.WarmupTime,
			Cooldown:               w.Cooldown,
			TicksBetweenBurstShots: w.TicksBetweenBurstShots,
			Range:                  w.Range,
			AccuracyTouch:          w.AccuracyTouch,
			AccuracyShort:          w.AccuracyShort,
			AccuracyMedium:         w.AccuracyMedium,
			AccuracyLong:           w.AccuracyLong,
		}
		rawDPS := combat.RawRangedDPS(stats)
		acc := combat.AccuracyAtRange(stats, rangeTiles)
		dpsAtRange := rawDPS * acc
		expectedDmg := combat.ArmorExpectedDamage(w.DamagePerShot, w.ArmorPenetration, armorRating)

		var sb strings.Builder
		fmt.Fprintf(&sb, "%s (ranged)\n\n", w.Label)
		fmt.Fprintf(&sb, "Damage: %.0f | AP: %.2f | Range: %.1f\n", w.DamagePerShot, w.ArmorPenetration, w.Range)
		fmt.Fprintf(&sb, "Burst: %d shots", w.BurstShotCount)
		if w.BurstShotCount > 1 {
			fmt.Fprintf(&sb, " (%.0f ticks between)", float64(w.TicksBetweenBurstShots))
		}
		fmt.Fprintf(&sb, "\nWarmup: %.1fs | Cooldown: %.1fs\n\n", w.WarmupTime, w.Cooldown)
		fmt.Fprintf(&sb, "Raw DPS: %.2f\n", rawDPS)
		fmt.Fprintf(&sb, "Accuracy at %.0f tiles: %.0f%%\n", rangeTiles, acc*100)
		fmt.Fprintf(&sb, "DPS at %.0f tiles: %.2f\n", rangeTiles, dpsAtRange)
		if armorRating > 0 {
			fmt.Fprintf(&sb, "\nVs %.0f%% armor: %.1f expected damage per shot\n", armorRating*100, expectedDmg)
		}

		writeResult(enc, w.Label, map[string]any{
			"formatted":       sb.String(),
			"weapon":          w.Label,
			"type":            "ranged",
			"raw_dps":         roundN(rawDPS, 2),
			"accuracy":        roundN(acc, 2),
			"dps_at_range":    roundN(dpsAtRange, 2),
			"damage_per_shot": roundN(w.DamagePerShot, 0),
			"expected_damage": roundN(expectedDmg, 1),
		})
		return
	}

	if bestMelee != nil {
		w := bestMelee
		var tools []combat.MeleeTool
		for _, t := range w.Tools {
			tools = append(tools, combat.MeleeTool{
				Label:    t.Label,
				Power:    t.Power,
				Cooldown: t.Cooldown,
			})
		}
		dps := combat.MeleeTrueDPS(tools)

		var sb strings.Builder
		fmt.Fprintf(&sb, "%s (melee)\n\n", w.Label)
		fmt.Fprintf(&sb, "True DPS: %.2f\n\n", dps)
		fmt.Fprintf(&sb, "Attack verbs:\n")
		for _, t := range w.Tools {
			weight := t.Power * t.Power
			fmt.Fprintf(&sb, "  %s: %.0f dmg, %.1fs cd (sel. weight %.1f)\n",
				t.Label, t.Power, t.Cooldown, weight)
		}

		writeResult(enc, w.Label, map[string]any{
			"formatted": sb.String(),
			"weapon":    w.Label,
			"type":      "melee",
			"true_dps":  roundN(dps, 2),
		})
		return
	}

	writeError(enc, "unknown_weapon", fmt.Sprintf("Unknown weapon %q", weapon))
}

// matchDef matches a query string against a defName and label using
// three-pass priority: exact match -> prefix match -> substring match.
// Returns a score: 3 = exact, 2 = prefix, 1 = substring, 0 = no match.
func matchDef(query, defName, label string) int {
	q := strings.ToLower(query)
	dn := strings.ToLower(defName)
	lb := strings.ToLower(label)

	// Exact match (highest priority)
	if q == lb || q == dn {
		return 3
	}
	// Prefix match
	if strings.HasPrefix(lb, q) || strings.HasPrefix(dn, q) {
		return 2
	}
	// Substring match
	if strings.Contains(lb, q) || strings.Contains(dn, q) {
		return 1
	}
	return 0
}

func containsTag(tags []string, targets ...string) bool {
	for _, t := range tags {
		for _, target := range targets {
			if strings.EqualFold(t, target) {
				return true
			}
		}
	}
	return false
}

func schema() map[string]any {
	return map[string]any{
		"modules": map[string]any{
			"crops": map[string]any{
				"name":        "Crop Production Optimizer",
				"description": "Calculate nutrition/day/tile and silver/day/tile for any crop on any soil type, accounting for fertility sensitivity, temperature, and rest periods.",
				"parameters": map[string]any{
					"crop":        map[string]any{"type": "string", "description": "Crop name (e.g. rice, potato, corn, strawberry, devilstrand)"},
					"soil":        map[string]any{"type": "string", "description": "Soil type (e.g. soil, rich soil, gravel, hydroponics)", "default": "soil"},
					"temperature": map[string]any{"type": "number", "description": "Average temperature in C", "default": 20},
					"colonists":   map[string]any{"type": "integer", "description": "Number of colonists to feed (for tiles calculation)", "default": 1},
				},
			},
			"surgery": map[string]any{
				"name":        "Surgery Success Calculator",
				"description": "Calculate the true surgery success probability from surgeon skill, bed, medicine, room conditions, and operation difficulty.",
				"parameters": map[string]any{
					"skill":            map[string]any{"type": "integer", "description": "Surgeon's Medicine skill level (0-20)", "default": 10},
					"manipulation":     map[string]any{"type": "number", "description": "Surgeon's Manipulation capacity (0-1+, 1.0 = healthy)", "default": 1.0},
					"sight":            map[string]any{"type": "number", "description": "Surgeon's Sight capacity (0-1+, 1.0 = healthy)", "default": 1.0},
					"bed":              map[string]any{"type": "string", "description": "Bed type: sleeping spot, bed, hospital bed, ancient bed, rusted bed"},
					"bed_factor":       map[string]any{"type": "number", "description": "Direct bed factor override (alternative to bed name)"},
					"quality":          map[string]any{"type": "string", "description": "Bed quality: awful, poor, normal, good, excellent, masterwork, legendary", "default": "normal"},
					"cleanliness":      map[string]any{"type": "number", "description": "Room cleanliness stat (-5 to +5, 0 = clean)", "default": 0},
					"glow":             map[string]any{"type": "number", "description": "Light level (0 = dark, 1 = fully lit)", "default": 1.0},
					"outdoors":         map[string]any{"type": "boolean", "description": "Whether surgery is performed outdoors", "default": false},
					"medicine":         map[string]any{"type": "string", "description": "Medicine type: none, herbal, industrial/medicine, glitterworld"},
					"medicine_potency": map[string]any{"type": "number", "description": "Direct medicine potency override (0=none, 0.6=herbal, 1.0=industrial, 1.6=glitterworld)"},
					"difficulty":       map[string]any{"type": "number", "description": "Operation's surgerySuccessChanceFactor (1.0 = standard)", "default": 1.0},
					"inspired":         map[string]any{"type": "boolean", "description": "Whether the surgeon has Inspired Surgery", "default": false},
				},
			},
			"combat": map[string]any{
				"name":        "Weapon DPS & Armor Calculator",
				"description": "Compute ranged DPS at distance with accuracy interpolation, or melee true DPS with weighted verb selection. Supports armor penetration vs armor rating.",
				"parameters": map[string]any{
					"weapon": map[string]any{"type": "string", "description": "Weapon name (ranged or melee)"},
					"range":  map[string]any{"type": "number", "description": "Distance in tiles for ranged DPS", "default": 12},
					"armor":  map[string]any{"type": "number", "description": "Target armor rating (0-2, e.g. 1.0 = flak vest)", "default": 0},
				},
			},
			"materials": map[string]any{
				"name":        "Material & Quality Stat Calculator",
				"description": "Look up material stat factors (armor, damage, HP, insulation) and apply quality multipliers.",
				"parameters": map[string]any{
					"material": map[string]any{"type": "string", "description": "Material name (e.g. steel, plasteel, hyperweave). Omit to list all."},
					"quality":  map[string]any{"type": "string", "description": "Quality level: awful, poor, normal, good, excellent, masterwork, legendary", "default": "normal"},
				},
			},
			"drugs": map[string]any{
				"name":        "Drug Economy & Addiction Analyzer",
				"description": "Look up drug production value, work efficiency, addiction risk, and ingredient breakdown. Add soil/temperature parameters for production chain silver/day/tile analysis.",
				"parameters": map[string]any{
					"drug":        map[string]any{"type": "string", "description": "Drug name (e.g. flake, yayo, beer, smokeleaf joint). Omit to list all."},
					"soil":        map[string]any{"type": "string", "description": "Soil type for production chain (e.g. soil, rich soil, gravel)"},
					"temperature": map[string]any{"type": "number", "description": "Average temperature for production chain calculation"},
				},
			},
			"raids": map[string]any{
				"name":        "Raid Threat Estimator",
				"description": "Estimate raid points from colony wealth and colonist count using the wealth-to-points curve.",
				"parameters": map[string]any{
					"item_wealth":     map[string]any{"type": "number", "description": "Total item/silver wealth"},
					"building_wealth": map[string]any{"type": "number", "description": "Total building wealth (counted at 50%)", "default": 0},
					"colonists":       map[string]any{"type": "integer", "description": "Number of colonists", "default": 1},
				},
			},
			"genes": map[string]any{
				"name":        "Gene Build Validator & Browser",
				"description": "Validate xenotype gene builds for complexity/metabolism limits and exclusion conflicts, or search/browse available genes.",
				"parameters": map[string]any{
					"genes":          map[string]any{"type": "array", "description": "Array of gene names to validate as a build"},
					"max_complexity": map[string]any{"type": "integer", "description": "Maximum allowed complexity", "default": 6},
					"min_metabolism": map[string]any{"type": "integer", "description": "Minimum allowed metabolism", "default": -5},
					"search":         map[string]any{"type": "string", "description": "Search genes by name or description substring"},
					"category":       map[string]any{"type": "string", "description": "Filter genes by category"},
				},
			},
			"research": map[string]any{
				"name":        "Research Chain Calculator",
				"description": "Compute prerequisite chains and total research cost adjusted for colony tech level.",
				"parameters": map[string]any{
					"project":     map[string]any{"type": "string", "description": "Research project name. Omit to list all."},
					"colony_tech": map[string]any{"type": "string", "description": "Colony tech level for cost multipliers", "default": "Industrial"},
				},
			},
		},
	}
}

func writeResult(enc *json.Encoder, title string, data any) {
	if err := enc.Encode(map[string]any{
		"type":  "result",
		"title": title,
		"data":  data,
	}); err != nil {
		os.Exit(1)
	}
}

func writeError(enc *json.Encoder, errType, message string) {
	if err := enc.Encode(map[string]any{
		"type":      "error",
		"errorType": errType,
		"message":   message,
	}); err != nil {
		os.Exit(1)
	}
}

var powersOf10 = [...]float64{1, 10, 100, 1000, 10000}

func roundN(v float64, n int) float64 {
	shift := powersOf10[n]
	return math.Round(v*shift) / shift
}

func intParam(query map[string]any, key string, defaultVal int) int {
	if v, ok := query[key].(float64); ok {
		return int(v)
	}
	return defaultVal
}

func floatParam(query map[string]any, key string, defaultVal float64) float64 {
	if v, ok := query[key].(float64); ok {
		return v
	}
	return defaultVal
}

func boolParam(query map[string]any, key string, defaultVal bool) bool {
	if v, ok := query[key].(bool); ok {
		return v
	}
	return defaultVal
}
