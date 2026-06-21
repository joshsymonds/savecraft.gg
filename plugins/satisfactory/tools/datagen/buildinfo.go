package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// buildingInfos emits the game's own reference card for every placeable
// building: its in-game description, clearance-derived footprint, category, and
// type-specific key stats. The discriminator is the ClassName "Build_" prefix,
// NOT the FGBuildable* NativeClass — several placeables (the Dimensional Depot
// is FGCentralStorageContainer, the hypertube entrance is FGPipeHyperStart)
// live under other native classes, and the Build_ prefix is the authoritative
// signal that a class is something the player can place.
//
// Build cost (via the build recipe producing each Desc_ class) and unlock tier
// are joined in a later pass.
func (g *generator) buildingInfos() {
	recipeByClass, descToRecipe := g.buildRecipeIndexes()

	type row struct{ className, line string }
	var rows []row
	skipped, resolvedCost := 0, 0
	for native, classes := range g.byNative {
		category := nativeClassCategory(native)
		for _, c := range classes {
			className := field(c, "ClassName")
			if !strings.HasPrefix(className, "Build_") {
				continue
			}
			display := field(c, "mDisplayName")
			if display == "" {
				skipped++
				continue
			}
			desc := normalizeDesc(field(c, "mDescription"))
			footprint := footprintLiteral(field(c, "mClearanceData"))
			stats := statsLiteral(c, native)

			// Resolve the build recipe: prefer Recipe_<stem>, else the recipe
			// that produces the building descriptor Desc_<stem>. (Variant walls
			// reorder the descriptor name and some build recipes ship an empty
			// mProducedIn, so neither rule alone is complete.)
			stem := strings.TrimPrefix(className, "Build_")
			recipeClass := ""
			if _, ok := recipeByClass["Recipe_"+stem]; ok {
				recipeClass = "Recipe_" + stem
			} else if rc, ok := descToRecipe["Desc_"+stem]; ok {
				recipeClass = rc
			}
			cost := "nil"
			if rc, ok := recipeByClass[recipeClass]; ok {
				cost = itemAmountsGo(parseItemAmounts(field(rc, "mIngredients")))
				if cost != "nil" {
					resolvedCost++
				}
			}
			unlockName, unlockTier := "", -1
			if sch, ok := g.recipeSchematic[recipeClass]; ok && recipeClass != "" {
				unlockName, unlockTier = sch.Display, sch.Tier
			}

			line := fmt.Sprintf(
				"\t%q: {ClassName: %q, DisplayName: %q, Description: %q, Category: %q, Footprint: %s, "+
					"Stats: %s, BuildCost: %s, UnlockSchematic: %q, UnlockTier: %d},\n",
				className,
				className,
				display,
				desc,
				category,
				footprint,
				stats,
				cost,
				unlockName,
				unlockTier,
			)
			rows = append(rows, row{className, line})
			g.buildingInfoCount++
		}
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].className < rows[j].className })
	fmt.Fprintf(
		os.Stderr,
		"buildingInfos: %d of %d buildings resolved a build cost\n",
		resolvedCost,
		g.buildingInfoCount,
	)

	var b strings.Builder
	b.WriteString("var BuildingInfos = map[string]BuildingInfo{\n")
	for _, r := range rows {
		b.WriteString(r.line)
	}
	b.WriteString("}\n")
	g.write("building_info_gen.go", b.String())
	if skipped > 0 {
		fmt.Fprintf(
			os.Stderr,
			"buildingInfos: skipped %d Build_ classes with no display name\n",
			skipped,
		)
	}
}

// buildRecipeIndexes returns (recipes keyed by class) and (building-descriptor
// class -> the class of a recipe that produces it). The descriptor index is
// restricted to FGBuildingDescriptor products so only actual buildings resolve.
func (g *generator) buildRecipeIndexes() (map[string]map[string]json.RawMessage, map[string]string) {
	buildingDescriptors := map[string]bool{}
	for _, c := range g.byNative["FGBuildingDescriptor"] {
		if cn := field(c, "ClassName"); cn != "" {
			buildingDescriptors[cn] = true
		}
	}
	recipeByClass := map[string]map[string]json.RawMessage{}
	descToRecipe := map[string]string{}
	for _, c := range g.byNative["FGRecipe"] {
		rc := field(c, "ClassName")
		recipeByClass[rc] = c
		for _, p := range parseItemAmounts(field(c, "mProduct")) {
			if buildingDescriptors[p.class] {
				if _, seen := descToRecipe[p.class]; !seen {
					descToRecipe[p.class] = rc
				}
			}
		}
	}
	return recipeByClass, descToRecipe
}

// normalizeDesc turns the game's CRLF description into clean \n-delimited text.
func normalizeDesc(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return strings.TrimSpace(s)
}

// nativeClassCategory buckets a buildable's NativeClass into a coarse category.
// Checks are ordered most-specific first; unknown natives fall through to "other".
func nativeClassCategory(native string) string {
	switch {
	case strings.Contains(native, "BlueprintDesigner"),
		strings.Contains(native, "CentralStorage"),
		strings.Contains(native, "SpaceElevator"),
		native == "FGBuildableMAM",
		strings.Contains(native, "TradingPost"),
		strings.Contains(native, "ResourceSink"),
		strings.Contains(native, "Portal"),
		strings.Contains(native, "RadarTower"):
		return "special"
	case strings.Contains(native, "Manufacturer"),
		strings.Contains(native, "FactorySimpleProducer"):
		return "production"
	case strings.Contains(native, "ResourceExtractor"),
		strings.Contains(native, "WaterPump"),
		strings.Contains(native, "FrackingExtractor"),
		strings.Contains(native, "FrackingActivator"):
		return "extraction"
	case strings.Contains(native, "Generator"),
		strings.Contains(native, "PowerStorage"),
		strings.Contains(native, "PowerBooster"),
		strings.Contains(native, "PowerPole"),
		strings.Contains(native, "PriorityPowerSwitch"),
		strings.Contains(native, "CircuitSwitch"):
		return "power"
	case strings.Contains(native, "Conveyor"),
		strings.Contains(native, "Pipe"),
		strings.Contains(native, "Pipeline"),
		strings.Contains(native, "Splitter"),
		strings.Contains(native, "Merger"),
		strings.Contains(native, "Storage"),
		strings.Contains(native, "StackableShelf"),
		strings.Contains(native, "Drone"),
		strings.Contains(native, "Train"),
		strings.Contains(native, "Railroad"),
		strings.Contains(native, "Docking"),
		strings.Contains(native, "VehiclePath"),
		strings.Contains(native, "Wire"):
		return "logistics"
	case strings.Contains(native, "Foundation"),
		strings.Contains(native, "Wall"),
		strings.Contains(native, "Ramp"),
		strings.Contains(native, "Pillar"),
		strings.Contains(native, "Beam"),
		strings.Contains(native, "Walkway"),
		strings.Contains(native, "Stair"),
		strings.Contains(native, "Door"),
		strings.Contains(native, "Pole"),
		strings.Contains(native, "Ladder"),
		strings.Contains(native, "Barrier"),
		strings.Contains(native, "Floodlight"),
		strings.Contains(native, "Light"),
		strings.Contains(native, "WidgetSign"),
		strings.Contains(native, "Jumppad"),
		strings.Contains(native, "Snow"),
		strings.Contains(native, "Elevator"):
		return "structure"
	default:
		return "other"
	}
}

var clearanceBoxPattern = regexp.MustCompile(
	`Min=\(X=(-?[0-9.]+),Y=(-?[0-9.]+),Z=(-?[0-9.]+)\),Max=\(X=(-?[0-9.]+),Y=(-?[0-9.]+),Z=(-?[0-9.]+)\)`,
)

// footprintLiteral parses the first ClearanceBox of a building's mClearanceData
// and returns a Go literal for its footprint in meters, or "nil" when the game
// ships no clearance (spline buildings, blueprint designers).
func footprintLiteral(clearance string) string {
	m := clearanceBoxPattern.FindStringSubmatch(clearance)
	if m == nil {
		return "nil"
	}
	cm := func(s string) float64 {
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0
		}
		return v
	}
	round2 := func(v float64) float64 { return math.Round(v*100) / 100 }
	width := round2((cm(m[4]) - cm(m[1])) / 100)
	depth := round2((cm(m[5]) - cm(m[2])) / 100)
	height := round2(cm(m[6]) / 100)
	return fmt.Sprintf(
		"&Footprint{WidthM: %s, DepthM: %s, HeightM: %s, WidthFoundations: %d, DepthFoundations: %d}",
		fnum(width),
		fnum(depth),
		fnum(height),
		foundationCount(width),
		foundationCount(depth),
	)
}

// foundationCount returns the 8 m-foundation count for an extent, or 0 when the
// extent is not within 5 cm of an 8 m multiple.
func foundationCount(m float64) int {
	n := m / 8
	r := math.Round(n)
	if math.Abs(n-r) > 0.05 || r <= 0 {
		return 0
	}
	return int(r)
}

// statsLiteral builds the []BuildingStat literal for a buildable from the real
// Docs.json stat fields (never parsed back out of the description prose).
func statsLiteral(c map[string]json.RawMessage, native string) string {
	var stats []string
	add := func(label, value, unit string) {
		stats = append(stats, fmt.Sprintf("{Label: %q, Value: %q, Unit: %q}", label, value, unit))
	}

	draw := floatField(c, "mPowerConsumption")
	if draw == 0 {
		draw = floatField(c, "mEstimatedMaximumPowerConsumption")
	}
	production := floatField(c, "mPowerProduction")
	if draw > 0 {
		add("Power draw", fnum(draw), "MW")
	}
	if production > 0 {
		add("Power production", fnum(production), "MW")
	}
	if exp := floatField(c, "mPowerConsumptionExponent"); exp > 0 && (draw > 0 || production > 0) {
		add("Overclock power exponent", fnum(exp), "")
	}
	if strings.Contains(native, "Conveyor") {
		if speed := floatField(c, "mSpeed"); speed > 0 {
			add("Conveyor throughput", fnum(speed/2), "/min")
		}
	}
	if strings.Contains(native, "Pipeline") {
		if flow := floatField(c, "mFlowLimit"); flow > 0 {
			add("Pipe throughput", fnum(flow*60), "m³/min")
		}
	}
	if native == "FGBuildableStorage" {
		if x, y := intField(c, "mInventorySizeX"), intField(c, "mInventorySizeY"); x > 0 && y > 0 {
			add("Storage slots", strconv.Itoa(x*y), "")
		}
	}
	if capMWh := floatField(c, "mPowerStoreCapacity"); capMWh > 0 {
		add("Power storage capacity", fnum(capMWh), "MWh")
	}
	if ratio := floatField(c, "mSupplementalToPowerRatio"); ratio > 0 && production > 0 {
		// Supplemental (water) m³/min = production * ratio * 60 / 1000.
		add("Water consumption", fnum(production*ratio*60/1000), "m³/min")
	}

	if len(stats) == 0 {
		return "nil"
	}
	return "[]BuildingStat{" + strings.Join(stats, ", ") + "}"
}

// fnum formats a float as the shortest exact decimal (55 -> "55", 1.5 -> "1.5").
func fnum(v float64) string {
	return strconv.FormatFloat(v, 'g', -1, 64)
}
