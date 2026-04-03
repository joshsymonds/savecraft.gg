// Command datagen reads Factorio's data-raw-dump.json and generates Go source files
// for the reference module's data package.
//
// Usage:
//
//	go run ./plugins/factorio/tools/datagen
//	go run ./plugins/factorio/tools/datagen -input .reference/factorio-data-raw-dump.json -output plugins/factorio/reference/data
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

var (
	inputPath = ".reference/factorio-data-raw-dump.json"
	outputDir = "plugins/factorio/reference/data"
)

func main() {
	for i := 1; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "-input":
			i++
			inputPath = os.Args[i]
		case "-output":
			i++
			outputDir = os.Args[i]
		}
	}

	raw, err := os.ReadFile(inputPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", inputPath, err)
		os.Exit(1)
	}

	var dump map[string]map[string]json.RawMessage
	if err := json.Unmarshal(raw, &dump); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing JSON: %v\n", err)
		os.Exit(1)
	}

	generators := []struct {
		name string
		fn   func(map[string]map[string]json.RawMessage) error
	}{
		{"recipes", genRecipes},
		{"technologies", genTechnologies},
		{"machines", genMachines},
		{"modules", genModules},
		{"logistics", genLogistics},
		{"fluids", genFluids},
		{"evolution", genEvolution},
		{"entity_sizes", genEntitySizes},
	}

	for _, g := range generators {
		fmt.Printf("Generating %s...\n", g.name)
		if err := g.fn(dump); err != nil {
			fmt.Fprintf(os.Stderr, "Error generating %s: %v\n", g.name, err)
			os.Exit(1)
		}
	}
	fmt.Println("Done.")
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

type rawRecipe struct {
	Name           string          `json:"name"`
	Category       string          `json:"category"`
	EnergyRequired *float64        `json:"energy_required"`
	Ingredients    json.RawMessage `json:"ingredients"`
	Results        json.RawMessage `json:"results"`
	Result         string          `json:"result"`
	ResultCount    *float64        `json:"result_count"`
	Enabled        *bool           `json:"enabled"`
}

type rawIngredient struct {
	Type   string  `json:"type"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
}

type rawProduct struct {
	Type        string   `json:"type"`
	Name        string   `json:"name"`
	Amount      *float64 `json:"amount"`
	Probability *float64 `json:"probability"`
}

func genRecipes(dump map[string]map[string]json.RawMessage) error {
	recipes := dump["recipe"]

	var lines []string
	names := sortedKeys(recipes)
	for _, name := range names {
		var r rawRecipe
		if err := json.Unmarshal(recipes[name], &r); err != nil {
			return fmt.Errorf("parse recipe %s: %w", name, err)
		}

		energy := 0.5
		if r.EnergyRequired != nil {
			energy = *r.EnergyRequired
		}

		category := r.Category
		if category == "" {
			category = "crafting"
		}

		enabled := true
		if r.Enabled != nil {
			enabled = *r.Enabled
		}

		// Parse ingredients — can be an array or an empty object {}
		var ingredients []rawIngredient
		if len(r.Ingredients) > 0 {
			if err := json.Unmarshal(r.Ingredients, &ingredients); err != nil {
				// Might be an empty object {} instead of []
				var obj map[string]json.RawMessage
				if json.Unmarshal(r.Ingredients, &obj) == nil {
					// Empty or non-array — treat as no ingredients
				} else {
					return fmt.Errorf("parse ingredients for %s: %w", name, err)
				}
			}
		}

		// Parse results — can be explicit results array, empty object {}, or legacy result/result_count
		var products []rawProduct
		if len(r.Results) > 0 {
			if err := json.Unmarshal(r.Results, &products); err != nil {
				var obj map[string]json.RawMessage
				if json.Unmarshal(r.Results, &obj) == nil {
					// Empty or non-array — treat as no results
				} else {
					return fmt.Errorf("parse results for %s: %w", name, err)
				}
			}
		} else if r.Result != "" {
			count := 1.0
			if r.ResultCount != nil {
				count = *r.ResultCount
			}
			products = []rawProduct{{Type: "item", Name: r.Result, Amount: &count}}
		}

		ingStr := "nil"
		if len(ingredients) > 0 {
			var parts []string
			for _, ing := range ingredients {
				typ := ing.Type
				if typ == "" {
					typ = "item"
				}
				parts = append(parts, fmt.Sprintf(
					`{Type: %q, Name: %q, Amount: %s}`,
					typ, ing.Name, formatFloat(ing.Amount),
				))
			}
			ingStr = "[]Ingredient{\n\t\t\t" + strings.Join(parts, ",\n\t\t\t") + ",\n\t\t}"
		}

		resStr := "nil"
		if len(products) > 0 {
			var parts []string
			for _, p := range products {
				typ := p.Type
				if typ == "" {
					typ = "item"
				}
				amount := 1.0
				if p.Amount != nil {
					amount = *p.Amount
				}
				prob := 1.0
				if p.Probability != nil {
					prob = *p.Probability
				}
				parts = append(parts, fmt.Sprintf(
					`{Type: %q, Name: %q, Amount: %s, Probability: %s}`,
					typ, p.Name, formatFloat(amount), formatFloat(prob),
				))
			}
			resStr = "[]Product{\n\t\t\t" + strings.Join(parts, ",\n\t\t\t") + ",\n\t\t}"
		}

		lines = append(lines, fmt.Sprintf(
			`	%q: {Name: %q, Category: %q, EnergyRequired: %s, Enabled: %v, Ingredients: %s, Results: %s},`,
			name, name, category, formatFloat(energy), enabled, ingStr, resStr,
		))
	}

	return writeGenFile("recipes_gen.go", "Recipes", "map[string]Recipe", lines)
}

// ─── Technologies ────────────────────────────────────────────────────────────

type rawTechnology struct {
	Name          string          `json:"name"`
	Prerequisites []string        `json:"prerequisites"`
	Unit          rawTechUnit     `json:"unit"`
	Effects       []rawTechEffect `json:"effects"`
	MaxLevel      any             `json:"max_level"`
}

type rawTechUnit struct {
	Count       *float64        `json:"count"`
	Ingredients json.RawMessage `json:"ingredients"`
	Time        float64         `json:"time"`
}

type rawTechEffect struct {
	Type   string `json:"type"`
	Recipe string `json:"recipe"`
}

func genTechnologies(dump map[string]map[string]json.RawMessage) error {
	techs := dump["technology"]

	var lines []string
	names := sortedKeys(techs)
	for _, name := range names {
		var t rawTechnology
		if err := json.Unmarshal(techs[name], &t); err != nil {
			return fmt.Errorf("parse tech %s: %w", name, err)
		}

		unitCount := 0.0
		if t.Unit.Count != nil {
			unitCount = *t.Unit.Count
		}

		// Parse ingredients — can be [[name, count], ...] or [{type, name, amount}, ...]
		var ingredients []string
		if len(t.Unit.Ingredients) > 0 {
			var arrForm [][]json.RawMessage
			if err := json.Unmarshal(t.Unit.Ingredients, &arrForm); err == nil {
				for _, pair := range arrForm {
					if len(pair) >= 2 {
						var iname string
						var iamount float64
						json.Unmarshal(pair[0], &iname)
						json.Unmarshal(pair[1], &iamount)
						ingredients = append(ingredients, fmt.Sprintf(
							`{Type: "item", Name: %q, Amount: %s}`,
							iname, formatFloat(iamount),
						))
					}
				}
			}
		}

		ingStr := "nil"
		if len(ingredients) > 0 {
			ingStr = "[]Ingredient{\n\t\t\t" + strings.Join(ingredients, ",\n\t\t\t") + ",\n\t\t}"
		}

		prereqStr := "nil"
		if len(t.Prerequisites) > 0 {
			var parts []string
			for _, p := range t.Prerequisites {
				parts = append(parts, fmt.Sprintf("%q", p))
			}
			prereqStr = "[]string{" + strings.Join(parts, ", ") + "}"
		}

		// Collect unlocked recipes
		var effects []string
		for _, e := range t.Effects {
			if e.Type == "unlock-recipe" && e.Recipe != "" {
				effects = append(effects, fmt.Sprintf("%q", e.Recipe))
			}
		}
		effectStr := "nil"
		if len(effects) > 0 {
			effectStr = "[]string{" + strings.Join(effects, ", ") + "}"
		}

		maxLevel := 0.0
		if t.MaxLevel != nil {
			switch v := t.MaxLevel.(type) {
			case float64:
				maxLevel = v
			case string:
				if v == "infinite" {
					maxLevel = math.Inf(1)
				}
			}
		}

		maxLevelStr := formatFloat(maxLevel)
		if math.IsInf(maxLevel, 1) {
			maxLevelStr = "math.Inf(1)"
		}

		lines = append(lines, fmt.Sprintf(
			`	%q: {Name: %q, Prerequisites: %s, UnitCount: %s, UnitTime: %s, Ingredients: %s, Effects: %s, MaxLevel: %s},`,
			name, name, prereqStr, formatFloat(unitCount), formatFloat(t.Unit.Time), ingStr, effectStr, maxLevelStr,
		))
	}

	return writeGenFile("technologies_gen.go", "Technologies", "map[string]Technology", lines)
}

// ─── Machines ────────────────────────────────────────────────────────────────

type rawMachine struct {
	Name               string          `json:"name"`
	CraftingSpeed      float64         `json:"crafting_speed"`
	EnergyUsage        string          `json:"energy_usage"`
	ModuleSlots        int             `json:"module_slots"`
	CraftingCategories json.RawMessage `json:"crafting_categories"`
	AllowedEffects     json.RawMessage `json:"allowed_effects"`
}

func genMachines(dump map[string]map[string]json.RawMessage) error {
	// Collect from multiple entity types that can craft
	entityTypes := []string{"assembling-machine", "furnace", "chemical-plant", "oil-refinery", "rocket-silo"}

	var lines []string
	for _, entityType := range entityTypes {
		entities, ok := dump[entityType]
		if !ok {
			continue
		}
		names := sortedKeys(entities)
		for _, name := range names {
			var m rawMachine
			if err := json.Unmarshal(entities[name], &m); err != nil {
				return fmt.Errorf("parse machine %s: %w", name, err)
			}

			catStr := "nil"
			if cats := parseStringArray(m.CraftingCategories); len(cats) > 0 {
				var parts []string
				for _, c := range cats {
					parts = append(parts, fmt.Sprintf("%q", c))
				}
				catStr = "[]string{" + strings.Join(parts, ", ") + "}"
			}

			effectStr := "nil"
			if effs := parseStringArray(m.AllowedEffects); len(effs) > 0 {
				var parts []string
				for _, e := range effs {
					parts = append(parts, fmt.Sprintf("%q", e))
				}
				effectStr = "[]string{" + strings.Join(parts, ", ") + "}"
			}

			lines = append(lines, fmt.Sprintf(
				`	%q: {Name: %q, CraftingSpeed: %s, EnergyUsage: %q, ModuleSlots: %d, CraftingCategories: %s, AllowedEffects: %s},`,
				name, name, formatFloat(m.CraftingSpeed), m.EnergyUsage, m.ModuleSlots, catStr, effectStr,
			))
		}
	}

	return writeGenFile("machines_gen.go", "Machines", "map[string]CraftingMachine", lines)
}

// ─── Modules ─────────────────────────────────────────────────────────────────

type rawModule struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Tier     int    `json:"tier"`
	Effect   struct {
		Speed        float64 `json:"speed"`
		Consumption  float64 `json:"consumption"`
		Productivity float64 `json:"productivity"`
		Pollution    float64 `json:"pollution"`
		Quality      float64 `json:"quality"`
	} `json:"effect"`
}

func genModules(dump map[string]map[string]json.RawMessage) error {
	modules := dump["module"]

	var lines []string
	names := sortedKeys(modules)
	for _, name := range names {
		var m rawModule
		if err := json.Unmarshal(modules[name], &m); err != nil {
			return fmt.Errorf("parse module %s: %w", name, err)
		}

		lines = append(lines, fmt.Sprintf(
			`	%q: {Name: %q, Category: %q, Tier: %d, Effects: ModuleEffects{Speed: %s, Consumption: %s, Productivity: %s, Pollution: %s, Quality: %s}},`,
			name, name, m.Category, m.Tier,
			formatFloat(m.Effect.Speed), formatFloat(m.Effect.Consumption),
			formatFloat(m.Effect.Productivity), formatFloat(m.Effect.Pollution),
			formatFloat(m.Effect.Quality),
		))
	}

	return writeGenFile("modules_gen.go", "Modules", "map[string]Module", lines)
}

// ─── Logistics (belts, inserters, beacons) ───────────────────────────────────

type rawBelt struct {
	Name  string  `json:"name"`
	Speed float64 `json:"speed"`
}

type rawInserter struct {
	Name           string     `json:"name"`
	RotationSpeed  float64    `json:"rotation_speed"`
	StackSizeBonus int        `json:"stack_size_bonus"`
	PickupPosition [2]float64 `json:"pickup_position"`
	InsertPosition [2]float64 `json:"insert_position"`
}

type rawBeacon struct {
	Name                    string  `json:"name"`
	DistributionEffectivity float64 `json:"distribution_effectivity"`
	ModuleSlots             int     `json:"module_slots"`
	SupplyAreaDistance      float64 `json:"supply_area_distance"`
	EnergyUsage             string  `json:"energy_usage"`
}

func genLogistics(dump map[string]map[string]json.RawMessage) error {
	var lines []string

	// Belts
	lines = append(lines, "// Belts — speed is tiles/tick, ItemsPerSec = speed * 480 (60 ticks/s * 8 items/tile)")
	belts := dump["transport-belt"]
	beltNames := sortedKeys(belts)
	var beltLines []string
	for _, name := range beltNames {
		var b rawBelt
		if err := json.Unmarshal(belts[name], &b); err != nil {
			return fmt.Errorf("parse belt %s: %w", name, err)
		}
		itemsPerSec := b.Speed * 480
		beltLines = append(beltLines, fmt.Sprintf(
			`	%q: {Name: %q, Speed: %s, ItemsPerSec: %s},`,
			name, name, formatFloat(b.Speed), formatFloat(itemsPerSec),
		))
	}

	// Inserters
	inserters := dump["inserter"]
	inserterNames := sortedKeys(inserters)
	var inserterLines []string
	for _, name := range inserterNames {
		var ins rawInserter
		if err := json.Unmarshal(inserters[name], &ins); err != nil {
			return fmt.Errorf("parse inserter %s: %w", name, err)
		}
		inserterLines = append(inserterLines, fmt.Sprintf(
			`	%q: {Name: %q, RotationSpeed: %s, StackSizeBonus: %d, PickupOffset: [2]float64{%s, %s}, InsertOffset: [2]float64{%s, %s}},`,
			name, name, formatFloat(ins.RotationSpeed), ins.StackSizeBonus,
			formatFloat(ins.PickupPosition[0]), formatFloat(ins.PickupPosition[1]),
			formatFloat(ins.InsertPosition[0]), formatFloat(ins.InsertPosition[1]),
		))
	}

	// Beacons
	beacons := dump["beacon"]
	var beaconLines []string
	beaconNames := sortedKeys(beacons)
	for _, name := range beaconNames {
		var b rawBeacon
		if err := json.Unmarshal(beacons[name], &b); err != nil {
			return fmt.Errorf("parse beacon %s: %w", name, err)
		}
		beaconLines = append(beaconLines, fmt.Sprintf(
			`	%q: {Name: %q, DistributionEffectivity: %s, ModuleSlots: %d, SupplyAreaDistance: %s, EnergyUsage: %q},`,
			name, name, formatFloat(b.DistributionEffectivity), b.ModuleSlots, formatFloat(b.SupplyAreaDistance), b.EnergyUsage,
		))
	}

	// Write a single file with three vars
	f, err := os.Create(outputDir + "/logistics_gen.go")
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Fprintln(f, "// Code generated by plugins/factorio/tools/datagen. DO NOT EDIT.")
	fmt.Fprintln(f, "package data")
	fmt.Fprintln(f)
	fmt.Fprintln(f, "// Belts — speed is tiles/tick, ItemsPerSec = speed * 480 (60 ticks/s * 8 items/tile)")
	fmt.Fprintf(f, "var Belts = map[string]Belt{\n%s\n}\n\n", strings.Join(beltLines, "\n"))
	fmt.Fprintf(f, "var Inserters = map[string]Inserter{\n%s\n}\n\n", strings.Join(inserterLines, "\n"))
	fmt.Fprintf(f, "var Beacons = map[string]Beacon{\n%s\n}\n", strings.Join(beaconLines, "\n"))
	return nil
}

// ─── Fluids ──────────────────────────────────────────────────────────────────

func genFluids(dump map[string]map[string]json.RawMessage) error {
	fluids := dump["fluid"]

	var lines []string
	names := sortedKeys(fluids)
	for _, name := range names {
		lines = append(lines, fmt.Sprintf(`	%q: {Name: %q},`, name, name))
	}

	return writeGenFile("fluids_gen.go", "Fluids", "map[string]Fluid", lines)
}

// ─── Evolution ──────────────────────────────────────────────────────────────

type rawMapSettings struct {
	EnemyEvolution struct {
		Enabled         bool    `json:"enabled"`
		TimeFactor      float64 `json:"time_factor"`
		DestroyFactor   float64 `json:"destroy_factor"`
		PollutionFactor float64 `json:"pollution_factor"`
	} `json:"enemy_evolution"`
}

type rawPresetEntry struct {
	AdvancedSettings *struct {
		EnemyEvolution *struct {
			TimeFactor      *float64 `json:"time_factor"`
			DestroyFactor   *float64 `json:"destroy_factor"`
			PollutionFactor *float64 `json:"pollution_factor"`
		} `json:"enemy_evolution"`
	} `json:"advanced_settings"`
}

type rawTurret struct {
	Name                          string  `json:"name"`
	BuildBaseEvolutionRequirement float64 `json:"build_base_evolution_requirement"`
}

func genEvolution(dump map[string]map[string]json.RawMessage) error {
	// 1. Base evolution settings from map-settings
	msRaw, ok := dump["map-settings"]["map-settings"]
	if !ok {
		return fmt.Errorf("map-settings not found in dump")
	}
	var ms rawMapSettings
	if err := json.Unmarshal(msRaw, &ms); err != nil {
		return fmt.Errorf("parse map-settings: %w", err)
	}

	// 2. Difficulty presets from map-gen-presets
	presetsRaw, ok := dump["map-gen-presets"]["default"]
	if !ok {
		return fmt.Errorf("map-gen-presets.default not found in dump")
	}
	var allPresets map[string]json.RawMessage
	if err := json.Unmarshal(presetsRaw, &allPresets); err != nil {
		return fmt.Errorf("parse map-gen-presets: %w", err)
	}

	type presetData struct {
		name            string
		timeFactor      float64
		destroyFactor   float64
		pollutionFactor float64
	}
	var presets []presetData
	presetNames := sortedKeys(allPresets)
	for _, name := range presetNames {
		var entry rawPresetEntry
		if err := json.Unmarshal(allPresets[name], &entry); err != nil {
			continue // skip non-object entries like "type", "name"
		}
		if entry.AdvancedSettings == nil || entry.AdvancedSettings.EnemyEvolution == nil {
			continue
		}
		evo := entry.AdvancedSettings.EnemyEvolution
		p := presetData{name: name}
		if evo.TimeFactor != nil {
			p.timeFactor = *evo.TimeFactor
		}
		if evo.DestroyFactor != nil {
			p.destroyFactor = *evo.DestroyFactor
		}
		if evo.PollutionFactor != nil {
			p.pollutionFactor = *evo.PollutionFactor
		}
		presets = append(presets, p)
	}

	// 3. Spawner tables from unit-spawner
	spawnerEntities := dump["unit-spawner"]
	type spawnerData struct {
		name  string
		units []struct {
			name    string
			weights [][2]float64
		}
	}
	var spawners []spawnerData
	spawnerNames := sortedKeys(spawnerEntities)
	for _, name := range spawnerNames {
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(spawnerEntities[name], &raw); err != nil {
			return fmt.Errorf("parse spawner %s: %w", name, err)
		}
		ruRaw, ok := raw["result_units"]
		if !ok {
			continue
		}
		// result_units is [[unitName, [[evo, weight], ...]], ...]
		var resultUnits []json.RawMessage
		if err := json.Unmarshal(ruRaw, &resultUnits); err != nil {
			return fmt.Errorf("parse result_units for %s: %w", name, err)
		}

		s := spawnerData{name: name}
		for _, unitRaw := range resultUnits {
			var pair [2]json.RawMessage
			if err := json.Unmarshal(unitRaw, &pair); err != nil {
				return fmt.Errorf("parse unit entry in %s: %w", name, err)
			}
			var unitName string
			if err := json.Unmarshal(pair[0], &unitName); err != nil {
				return fmt.Errorf("parse unit name in %s: %w", name, err)
			}
			var weightPairs [][2]float64
			if err := json.Unmarshal(pair[1], &weightPairs); err != nil {
				return fmt.Errorf("parse weight pairs for %s in %s: %w", unitName, name, err)
			}
			s.units = append(s.units, struct {
				name    string
				weights [][2]float64
			}{name: unitName, weights: weightPairs})
		}
		spawners = append(spawners, s)
	}

	// 4. Enemy tiers from turret build_base_evolution_requirement
	turrets := dump["turret"]
	type tierData struct {
		name      string
		threshold float64
	}
	var tiers []tierData
	turretNames := sortedKeys(turrets)
	for _, name := range turretNames {
		var t rawTurret
		if err := json.Unmarshal(turrets[name], &t); err != nil {
			continue
		}
		if t.BuildBaseEvolutionRequirement > 0 {
			tiers = append(tiers, tierData{name: name, threshold: t.BuildBaseEvolutionRequirement})
		}
	}
	sort.Slice(tiers, func(i, j int) bool { return tiers[i].threshold < tiers[j].threshold })

	// Write evolution_gen.go
	f, err := os.Create(outputDir + "/evolution_gen.go")
	if err != nil {
		return err
	}
	defer f.Close()

	fmt.Fprintln(f, "// Code generated by plugins/factorio/tools/datagen. DO NOT EDIT.")
	fmt.Fprintln(f, "package data")
	fmt.Fprintln(f)

	// BaseEvolution
	fmt.Fprintf(f, "var BaseEvolution = EvolutionSettings{\n")
	fmt.Fprintf(f, "\tTimeFactor:      %s,\n", formatFloat(ms.EnemyEvolution.TimeFactor))
	fmt.Fprintf(f, "\tDestroyFactor:   %s,\n", formatFloat(ms.EnemyEvolution.DestroyFactor))
	fmt.Fprintf(f, "\tPollutionFactor: %s,\n", formatFloat(ms.EnemyEvolution.PollutionFactor))
	fmt.Fprintln(f, "}")
	fmt.Fprintln(f)

	// DifficultyPresets
	fmt.Fprintln(f, "var DifficultyPresets = map[string]DifficultyPreset{")
	for _, p := range presets {
		fmt.Fprintf(f, "\t%q: {Name: %q, TimeFactor: %s, DestroyFactor: %s, PollutionFactor: %s},\n",
			p.name, p.name, formatFloat(p.timeFactor), formatFloat(p.destroyFactor), formatFloat(p.pollutionFactor))
	}
	fmt.Fprintln(f, "}")
	fmt.Fprintln(f)

	// Spawners
	fmt.Fprintln(f, "var Spawners = map[string]Spawner{")
	for _, s := range spawners {
		fmt.Fprintf(f, "\t%q: {Name: %q, Units: []SpawnerUnit{\n", s.name, s.name)
		for _, u := range s.units {
			fmt.Fprintf(f, "\t\t{Name: %q, Weights: []SpawnWeight{", u.name)
			for i, w := range u.weights {
				if i > 0 {
					fmt.Fprint(f, ", ")
				}
				fmt.Fprintf(f, "{Evolution: %s, Weight: %s}", formatFloat(w[0]), formatFloat(w[1]))
			}
			fmt.Fprintln(f, "}},")
		}
		fmt.Fprintln(f, "\t}},")
	}
	fmt.Fprintln(f, "}")
	fmt.Fprintln(f)

	// EnemyTiers
	fmt.Fprintln(f, "var EnemyTiers = []EnemyTier{")
	for _, t := range tiers {
		fmt.Fprintf(f, "\t{Name: %q, Threshold: %s},\n", t.name, formatFloat(t.threshold))
	}
	fmt.Fprintln(f, "}")

	return nil
}

// ─── Entity Sizes ───────────────────────────────────────────────────────────

type rawEntityWithCollisionBox struct {
	CollisionBox [2][2]float64 `json:"collision_box"`
}

func genEntitySizes(dump map[string]map[string]json.RawMessage) error {
	// Collect entity sizes from all prototype categories.
	// collision_box is [[x_min, y_min], [x_max, y_max]].
	type sizeEntry struct {
		name   string
		width  float64
		height float64
	}
	var entries []sizeEntry

	for _, entities := range dump {
		for name, raw := range entities {
			var e rawEntityWithCollisionBox
			if err := json.Unmarshal(raw, &e); err != nil {
				continue
			}
			w := e.CollisionBox[1][0] - e.CollisionBox[0][0]
			h := e.CollisionBox[1][1] - e.CollisionBox[0][1]
			if w <= 0 || h <= 0 {
				continue
			}
			entries = append(entries, sizeEntry{name: name, width: w, height: h})
		}
	}

	// Deduplicate by name — same entity name can appear in multiple categories
	// (e.g. as item + as entity), but only one will have a real collision_box.
	seen := map[string]bool{}
	var unique []sizeEntry
	for _, e := range entries {
		if !seen[e.name] {
			seen[e.name] = true
			unique = append(unique, e)
		}
	}

	sort.Slice(unique, func(i, j int) bool { return unique[i].name < unique[j].name })

	var lines []string
	for _, e := range unique {
		lines = append(lines, fmt.Sprintf(
			`	%q: {Name: %q, Width: %s, Height: %s},`,
			e.name, e.name, formatFloat(e.width), formatFloat(e.height),
		))
	}

	return writeGenFile("entity_sizes_gen.go", "EntitySizes", "map[string]EntitySize", lines)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// parseStringArray handles Factorio's quirk where empty collections are {} instead of [].
func parseStringArray(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var arr []string
	if json.Unmarshal(raw, &arr) == nil {
		return arr
	}
	return nil
}

func sortedKeys(m map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func formatFloat(f float64) string {
	if f == float64(int64(f)) {
		return strconv.FormatInt(int64(f), 10)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)

}

func writeGenFile(filename, varName, varType string, entries []string) error {
	path := outputDir + "/" + filename
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	needsMath := false
	for _, e := range entries {
		if strings.Contains(e, "math.Inf") {
			needsMath = true
			break
		}
	}

	fmt.Fprintln(f, "// Code generated by plugins/factorio/tools/datagen. DO NOT EDIT.")
	fmt.Fprintln(f, "package data")
	if needsMath {
		fmt.Fprintln(f)
		fmt.Fprintln(f, `import "math"`)
	}
	fmt.Fprintln(f)
	fmt.Fprintf(f, "var %s = %s{\n", varName, varType)
	for _, line := range entries {
		if strings.HasPrefix(line, "//") {
			continue
		}
		fmt.Fprintln(f, line)
	}
	fmt.Fprintln(f, "}")

	return nil
}
