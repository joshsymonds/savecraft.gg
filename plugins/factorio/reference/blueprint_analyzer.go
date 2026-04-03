package main

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"

	"github.com/joshsymonds/savecraft.gg/plugins/factorio/reference/data"
)

// --- Blueprint JSON types ---

// BlueprintWrapper is the top-level decoded JSON: either "blueprint" or "blueprint_book".
type BlueprintWrapper struct {
	Blueprint     *Blueprint     `json:"blueprint,omitempty"`
	BlueprintBook *BlueprintBook `json:"blueprint_book,omitempty"`
}

type Blueprint struct {
	Item     string   `json:"item"`
	Label    string   `json:"label,omitempty"`
	Version  int64    `json:"version"`
	Icons    []Icon   `json:"icons,omitempty"`
	Entities []Entity `json:"entities"`
}

type BlueprintBook struct {
	Item        string      `json:"item"`
	Label       string      `json:"label,omitempty"`
	Version     int64       `json:"version"`
	ActiveIndex int         `json:"active_index"`
	Blueprints  []BookEntry `json:"blueprints"`
}

type BookEntry struct {
	Index     int       `json:"index"`
	Blueprint Blueprint `json:"blueprint"`
}

type Icon struct {
	Index  int    `json:"index"`
	Signal Signal `json:"signal"`
}

type Signal struct {
	Type string `json:"type,omitempty"`
	Name string `json:"name"`
}

type Entity struct {
	EntityNumber int            `json:"entity_number"`
	Name         string         `json:"name"`
	Position     Position       `json:"position"`
	Direction    int            `json:"direction,omitempty"`
	Recipe       string         `json:"recipe,omitempty"`
	Items        map[string]int `json:"items,omitempty"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// --- Decoder ---

func decodeBlueprintString(s string) (*BlueprintWrapper, error) {
	if len(s) < 2 {
		return nil, &decodeError{"blueprint string too short"}
	}

	// Strip version byte (first character, always "0")
	encoded := s[1:]

	compressed, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, &decodeError{"base64 decode failed: " + err.Error()}
	}

	r, err := zlib.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, &decodeError{"zlib reader failed: " + err.Error()}
	}
	defer r.Close()

	// Limit decompressed size to 50 MB to defend against zip bombs.
	const maxDecompressedSize = 50 << 20
	jsonBytes, err := io.ReadAll(io.LimitReader(r, maxDecompressedSize))
	if err != nil {
		return nil, &decodeError{"zlib decompress failed: " + err.Error()}
	}
	if len(jsonBytes) >= maxDecompressedSize {
		return nil, &decodeError{"blueprint too large (exceeds 50 MB decompressed)"}
	}

	var wrapper BlueprintWrapper
	if err := json.Unmarshal(jsonBytes, &wrapper); err != nil {
		return nil, &decodeError{"JSON unmarshal failed: " + err.Error()}
	}

	if wrapper.Blueprint == nil && wrapper.BlueprintBook == nil {
		return nil, &decodeError{"decoded JSON has neither 'blueprint' nor 'blueprint_book' key"}
	}

	return &wrapper, nil
}

type decodeError struct {
	msg string
}

func (e *decodeError) Error() string {
	return e.msg
}

// --- Entity classification ---

// EntityCategory groups entities by function.
type EntityCategory struct {
	Count    int      `json:"count"`
	Entities []string `json:"entities"` // unique entity names
}

// classifyEntities groups blueprint entities into production, logistics, power, defense, other.
func classifyEntities(entities []Entity) map[string]*EntityCategory {
	categories := map[string]*EntityCategory{
		"production": {Entities: []string{}},
		"logistics":  {Entities: []string{}},
		"power":      {Entities: []string{}},
		"defense":    {Entities: []string{}},
		"other":      {Entities: []string{}},
	}
	seen := map[string]map[string]bool{
		"production": {},
		"logistics":  {},
		"power":      {},
		"defense":    {},
		"other":      {},
	}

	for _, e := range entities {
		cat := classifyEntity(e.Name)
		categories[cat].Count++
		if !seen[cat][e.Name] {
			seen[cat][e.Name] = true
			categories[cat].Entities = append(categories[cat].Entities, e.Name)
		}
	}

	return categories
}

func classifyEntity(name string) string {
	// Production: crafting machines (check baked-in data first)
	if _, ok := data.Machines[name]; ok {
		return "production"
	}

	// Logistics: belts, inserters, splitters, underground belts, roboports, chests, pipes, pumps, tanks
	if _, ok := data.Belts[name]; ok {
		return "logistics"
	}
	if _, ok := data.Inserters[name]; ok {
		return "logistics"
	}
	if logisticsEntities[name] {
		return "logistics"
	}

	// Power: generators, reactors, solar panels, accumulators, boilers, turbines, heat pipes, offshore pumps
	if _, ok := data.PowerEntities[name]; ok {
		return "power"
	}
	if powerEntities[name] {
		return "power"
	}

	// Defense: turrets, walls, gates, radar, artillery
	if defenseEntities[name] {
		return "defense"
	}

	return "other"
}

// Hardcoded entity name sets for categories not covered by baked-in data maps.
var logisticsEntities = map[string]bool{
	"splitter":                        true,
	"fast-splitter":                   true,
	"express-splitter":                true,
	"underground-belt":                true,
	"fast-underground-belt":           true,
	"express-underground-belt":        true,
	"turbo-underground-belt":          true,
	"turbo-splitter":                  true,
	"loader":                          true,
	"fast-loader":                     true,
	"express-loader":                  true,
	"turbo-loader":                    true,
	"roboport":                        true,
	"logistic-chest-passive-provider": true,
	"logistic-chest-active-provider":  true,
	"logistic-chest-requester":        true,
	"logistic-chest-storage":          true,
	"logistic-chest-buffer":           true,
	"iron-chest":                      true,
	"steel-chest":                     true,
	"wooden-chest":                    true,
	"pipe":                            true,
	"pipe-to-ground":                  true,
	"pump":                            true,
	"storage-tank":                    true,
	"rail":                            true,
	"rail-signal":                     true,
	"rail-chain-signal":               true,
	"train-stop":                      true,
	"locomotive":                      true,
	"cargo-wagon":                     true,
	"fluid-wagon":                     true,
	"artillery-wagon":                 true,
	"car":                             true,
	"tank":                            true,
	"spidertron":                      true,
	"constant-combinator":             true,
	"arithmetic-combinator":           true,
	"decider-combinator":              true,
	"power-switch":                    true,
	"programmable-speaker":            true,
	"red-wire":                        true,
	"green-wire":                      true,
	"landfill":                        true,
}

var powerEntities = map[string]bool{
	"heat-pipe":            true,
	"small-electric-pole":  true,
	"medium-electric-pole": true,
	"big-electric-pole":    true,
	"substation":           true,
}

var defenseEntities = map[string]bool{
	"gun-turret":          true,
	"laser-turret":        true,
	"flamethrower-turret": true,
	"artillery-turret":    true,
	"stone-wall":          true,
	"gate":                true,
	"radar":               true,
	"land-mine":           true,
}

// --- Handler ---

func handleBlueprintAnalyzer(enc *json.Encoder, query map[string]any) {
	bpString := stringParam(query, "blueprint_string")
	if bpString == "" {
		writeError(enc, "missing_parameter", "blueprint_string is required")
		os.Exit(1)
	}

	wrapper, err := decodeBlueprintString(bpString)
	if err != nil {
		writeError(enc, "decode_error", err.Error())
		os.Exit(1)
	}

	if wrapper.BlueprintBook != nil {
		handleBlueprintBook(enc, wrapper.BlueprintBook)
		return
	}

	handleSingleBlueprint(enc, wrapper.Blueprint)
}

// analyzeBlueprint runs the full analysis pipeline on a single blueprint's entities.
func analyzeBlueprint(bp *Blueprint) map[string]any {
	beacons := findBeacons(bp.Entities)
	breakdown := classifyEntities(bp.Entities)
	recipeSummary := extractRecipeSummary(bp.Entities)
	moduleSummary := extractModuleSummary(bp.Entities)
	recipeAnalysis, unknownRecipes := analyzeRecipes(bp.Entities, beacons)
	moduleAudit := auditModules(bp.Entities)
	recommendations := generateRecommendations(moduleAudit, beacons)
	inserterIssues := validateInserters(bp.Entities)

	return map[string]any{
		"label":            bp.Label,
		"entity_count":     len(bp.Entities),
		"entity_breakdown": breakdown,
		"recipe_summary":   recipeSummary,
		"module_summary":   moduleSummary,
		"recipe_analysis":  recipeAnalysis,
		"unknown_recipes":  unknownRecipes,
		"module_audit":     moduleAudit,
		"recommendations":  recommendations,
		"inserter_issues":  inserterIssues,
	}
}

func handleSingleBlueprint(enc *json.Encoder, bp *Blueprint) {
	result := analyzeBlueprint(bp)
	result["type"] = "blueprint"
	writeResult(enc, result)
}

func handleBlueprintBook(enc *json.Encoder, book *BlueprintBook) {
	blueprints := make([]map[string]any, 0, len(book.Blueprints))
	for _, entry := range book.Blueprints {
		bp := entry.Blueprint
		blueprints = append(blueprints, analyzeBlueprint(&bp))
	}

	writeResult(enc, map[string]any{
		"type":       "blueprint_book",
		"label":      book.Label,
		"blueprints": blueprints,
	})
}

// --- Beacon association ---

// beaconInfo holds a beacon's position and module list for spatial association.
type beaconInfo struct {
	position Position
	modules  []string
}

// findBeacons extracts beacon entities with their positions and modules.
func findBeacons(entities []Entity) []beaconInfo {
	var beacons []beaconInfo
	for _, e := range entities {
		if e.Name != "beacon" {
			continue
		}
		var modules []string
		for name, count := range e.Items {
			if _, isModule := data.Modules[name]; isModule {
				for range count {
					modules = append(modules, name)
				}
			}
		}
		beacons = append(beacons, beaconInfo{position: e.Position, modules: modules})
	}
	return beacons
}

// beaconRangeFor returns the center-to-center distance within which a beacon affects a machine.
// Formula: supply_area_distance + beacon_half_size + machine_half_size
// Uses real collision box dimensions from data.EntitySizes.
func beaconRangeFor(machineName string) float64 {
	dist := 3.0 // default supply area distance
	for _, b := range data.Beacons {
		dist = b.SupplyAreaDistance
		break
	}
	beaconHalf := 1.5 // fallback for 3×3
	if size, ok := data.EntitySizes["beacon"]; ok {
		beaconHalf = max(size.Width, size.Height) / 2
	}
	machineHalf := 1.5 // fallback for 3×3
	if size, ok := data.EntitySizes[machineName]; ok {
		machineHalf = max(size.Width, size.Height) / 2
	}
	return dist + beaconHalf + machineHalf
}

// beaconsInRange returns the beacons within range of a given position.
func beaconsInRange(pos Position, beacons []beaconInfo, maxRange float64) []beaconInfo {
	var result []beaconInfo
	for _, b := range beacons {
		dx := pos.X - b.position.X
		dy := pos.Y - b.position.Y
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist <= maxRange {
			result = append(result, b)
		}
	}
	return result
}

// --- Recipe analysis ---

// recipeGroup collects entities sharing the same recipe for analysis.
type recipeGroup struct {
	recipe      string
	machineType string
	count       int
	modules     []string   // flattened module list from all entities in the group
	positions   []Position // positions for beacon association
}

// analyzeRecipes computes production rates for each recipe in the blueprint,
// applying beacon speed bonuses to machines within range.
func analyzeRecipes(entities []Entity, beacons []beaconInfo) ([]map[string]any, []string) {
	// Group entities by recipe
	groups := map[string]*recipeGroup{}
	var groupOrder []string
	for _, e := range entities {
		if e.Recipe == "" {
			continue
		}
		g, ok := groups[e.Recipe]
		if !ok {
			g = &recipeGroup{recipe: e.Recipe, machineType: e.Name}
			groups[e.Recipe] = g
			groupOrder = append(groupOrder, e.Recipe)
		}
		g.count++
		g.positions = append(g.positions, e.Position)
		// Expand module items into repeated names for resolveModuleEffects
		for name, count := range e.Items {
			if _, isModule := data.Modules[name]; isModule {
				for range count {
					g.modules = append(g.modules, name)
				}
			}
		}
	}

	var results []map[string]any
	var unknownRecipes []string

	for _, recipeName := range groupOrder {
		g := groups[recipeName]

		recipe, recipeOK := data.Recipes[recipeName]
		machine, machineOK := data.Machines[g.machineType]

		if !recipeOK {
			unknownRecipes = append(unknownRecipes, recipeName)
			continue
		}

		// Compute module effects per machine
		perMachineModules := modulesPerMachine(g.modules, g.count)
		speedBonus, prodBonus, _ := resolveModuleEffects(perMachineModules)

		// Compute beacon effects per machine by averaging across all machines in the group.
		// Each machine may have a different number of beacons in range.
		machineRange := beaconRangeFor(g.machineType)
		totalBeaconSpeed := 0.0
		totalBeaconCount := 0
		for _, pos := range g.positions {
			nearby := beaconsInRange(pos, beacons, machineRange)
			if len(nearby) > 0 {
				// Use the first beacon's modules as representative (common pattern: all beacons identical)
				beaconSpeed := resolveBeaconEffects(nearby[0].modules, len(nearby))
				totalBeaconSpeed += beaconSpeed
				totalBeaconCount += len(nearby)
			}
		}
		avgBeaconSpeed := totalBeaconSpeed / float64(g.count)
		avgBeaconCount := float64(totalBeaconCount) / float64(g.count)

		var effSpeed float64
		if machineOK {
			effSpeed = effectiveSpeed(&machine, speedBonus, avgBeaconSpeed)
		} else {
			effSpeed = 1.0 * (1 + speedBonus + avgBeaconSpeed)
		}

		// Crafts per second
		craftsPerSec := effSpeed / recipe.EnergyRequired

		// Primary output amount
		outputAmount := 0.0
		outputName := ""
		for _, r := range recipe.Results {
			if outputName == "" || r.Name == recipeName {
				outputAmount = r.Amount * r.Probability
				outputName = r.Name
			}
		}

		// Items per minute per machine (with productivity bonus)
		itemsPerMinPerMachine := craftsPerSec * outputAmount * (1 + prodBonus) * 60
		totalItemsPerMin := itemsPerMinPerMachine * float64(g.count)

		entry := map[string]any{
			"recipe":             recipeName,
			"machine_type":       g.machineType,
			"machine_count":      g.count,
			"items_per_min":      roundTo(totalItemsPerMin, 2),
			"per_machine":        roundTo(itemsPerMinPerMachine, 2),
			"output_item":        outputName,
			"productivity_bonus": roundTo(prodBonus, 2),
			"effective_speed":    roundTo(effSpeed, 4),
			"beacon_count":       roundTo(avgBeaconCount, 1),
		}

		if machineOK {
			entry["module_slots"] = machine.ModuleSlots
		}

		results = append(results, entry)
	}

	if results == nil {
		results = []map[string]any{}
	}
	if unknownRecipes == nil {
		unknownRecipes = []string{}
	}

	return results, unknownRecipes
}

// modulesPerMachine splits a flattened module list into per-machine modules.
// If all machines share the same config (common), this returns one machine's worth.
func modulesPerMachine(allModules []string, machineCount int) []string {
	if machineCount <= 0 || len(allModules) == 0 {
		return nil
	}
	perMachine := len(allModules) / machineCount
	if perMachine <= 0 {
		return nil
	}
	return allModules[:perMachine]
}

// --- Module audit ---

// auditModules checks module slot utilization across all production entities.
func auditModules(entities []Entity) map[string]any {
	totalSlots := 0
	filledSlots := 0
	var issues []map[string]any

	for _, e := range entities {
		machine, ok := data.Machines[e.Name]
		if !ok || machine.ModuleSlots == 0 {
			continue
		}

		// Count modules in this entity
		moduleCount := 0
		for name, count := range e.Items {
			if _, isModule := data.Modules[name]; isModule {
				moduleCount += count
			}
		}

		totalSlots += machine.ModuleSlots
		filledSlots += moduleCount
		empty := machine.ModuleSlots - moduleCount
		if empty > 0 {
			issues = append(issues, map[string]any{
				"entity":      e.Name,
				"recipe":      e.Recipe,
				"empty_slots": empty,
				"total_slots": machine.ModuleSlots,
			})
		}
	}

	utilization := 0.0
	if totalSlots > 0 {
		utilization = roundTo(float64(filledSlots)/float64(totalSlots)*100, 1)
	}

	if issues == nil {
		issues = []map[string]any{}
	}

	return map[string]any{
		"total_slots":       totalSlots,
		"filled_slots":      filledSlots,
		"total_empty_slots": totalSlots - filledSlots,
		"utilization_pct":   utilization,
		"issues":            issues,
	}
}

// --- Recommendations ---

// generateRecommendations produces actionable suggestions based on the analysis.
func generateRecommendations(moduleAudit map[string]any, beacons []beaconInfo) []string {
	var recs []string

	// Recommend filling empty module slots
	emptySlots := moduleAudit["total_empty_slots"]
	if es, ok := emptySlots.(int); ok && es > 0 {
		// Group by machine type for cleaner recommendations
		emptyByMachine := map[string]int{}
		issues := moduleAudit["issues"].([]map[string]any)
		for _, issue := range issues {
			name := issue["entity"].(string)
			empty := issue["empty_slots"].(int)
			emptyByMachine[name] += empty
		}
		for machine, empty := range emptyByMachine {
			recs = append(recs, fmt.Sprintf("Add modules to %d empty slot(s) in %s", empty, machine))
		}
	}

	// Check for production machines with no beacons
	if len(beacons) == 0 && moduleAudit["total_slots"].(int) > 0 {
		recs = append(recs, "Consider adding beacons with speed modules to boost production")
	}

	if recs == nil {
		recs = []string{}
	}
	return recs
}

// extractRecipeSummary counts machines per recipe.
func extractRecipeSummary(entities []Entity) map[string]int {
	recipes := map[string]int{}
	for _, e := range entities {
		if e.Recipe != "" {
			recipes[e.Recipe]++
		}
	}
	return recipes
}

// extractModuleSummary counts total modules across all entities.
func extractModuleSummary(entities []Entity) map[string]int {
	modules := map[string]int{}
	for _, e := range entities {
		for name, count := range e.Items {
			// Only count items that are actually modules
			if _, ok := data.Modules[name]; ok {
				modules[name] += count
			}
		}
	}
	return modules
}

// --- Inserter wiring validation ---

// InserterIssue describes a wiring problem with an inserter in the blueprint.
type InserterIssue struct {
	EntityNumber int      `json:"entity_number"`
	Position     Position `json:"position"`
	Severity     string   `json:"severity"` // "error" or "warning"
	Message      string   `json:"message"`
	PickupEntity string   `json:"pickup_entity"`
	DropEntity   string   `json:"drop_entity"`
}

// rotateOffset applies a Factorio direction rotation to an [x,y] offset.
// Factorio directions: 0=N, 2=E, 4=S, 6=W. Each step of 2 = 90° clockwise.
// In Factorio's coordinate system, +Y = south (down), +X = east (right).
func rotateOffset(offset [2]float64, direction int) (float64, float64) {
	x, y := offset[0], offset[1]
	steps := (direction / 2) % 4
	for range steps {
		x, y = -y, x
	}
	return x, y
}

// entityAtPoint finds the entity whose collision box contains the given world point.
// Returns the entity name or "" if no entity covers that point.
func entityAtPoint(px, py float64, entities []Entity) string {
	for _, e := range entities {
		size, ok := data.EntitySizes[e.Name]
		if !ok {
			continue
		}
		hw, hh := size.Width/2, size.Height/2
		if px >= e.Position.X-hw && px <= e.Position.X+hw &&
			py >= e.Position.Y-hh && py <= e.Position.Y+hh {
			return e.Name
		}
	}
	return ""
}

// blueprintBounds returns the axis-aligned bounding box of all entities,
// expanded by each entity's collision box half-size.
func blueprintBounds(entities []Entity) (minX, minY, maxX, maxY float64) {
	if len(entities) == 0 {
		return 0, 0, 0, 0
	}
	minX, minY = math.Inf(1), math.Inf(1)
	maxX, maxY = math.Inf(-1), math.Inf(-1)
	for _, e := range entities {
		hw, hh := 0.5, 0.5 // default 1×1
		if size, ok := data.EntitySizes[e.Name]; ok {
			hw, hh = size.Width/2, size.Height/2
		}
		if e.Position.X-hw < minX {
			minX = e.Position.X - hw
		}
		if e.Position.Y-hh < minY {
			minY = e.Position.Y - hh
		}
		if e.Position.X+hw > maxX {
			maxX = e.Position.X + hw
		}
		if e.Position.Y+hh > maxY {
			maxY = e.Position.Y + hh
		}
	}
	return
}

// validateInserters checks each inserter's pickup and drop positions for wiring issues.
func validateInserters(entities []Entity) []InserterIssue {
	minX, minY, maxX, maxY := blueprintBounds(entities)
	var issues []InserterIssue

	for _, e := range entities {
		ins, ok := data.Inserters[e.Name]
		if !ok {
			continue
		}

		// Only handle cardinal directions (0, 2, 4, 6)
		if e.Direction%2 != 0 || e.Direction > 6 {
			continue
		}

		// Compute rotated pickup and drop positions
		pickupDX, pickupDY := rotateOffset(ins.PickupOffset, e.Direction)
		insertDX, insertDY := rotateOffset(ins.InsertOffset, e.Direction)

		pickupX := e.Position.X + pickupDX
		pickupY := e.Position.Y + pickupDY
		insertX := e.Position.X + insertDX
		insertY := e.Position.Y + insertDY

		// Skip if either position is outside blueprint bounds
		pickupInBounds := pickupX >= minX && pickupX <= maxX && pickupY >= minY && pickupY <= maxY
		insertInBounds := insertX >= minX && insertX <= maxX && insertY >= minY && insertY <= maxY
		if !pickupInBounds || !insertInBounds {
			continue
		}

		// Look up entities at pickup and drop positions
		pickupEntity := entityAtPoint(pickupX, pickupY, entities)
		dropEntity := entityAtPoint(insertX, insertY, entities)

		// Don't count the inserter itself
		if pickupEntity == e.Name {
			pickupEntity = ""
		}
		if dropEntity == e.Name {
			dropEntity = ""
		}

		pickupEmpty := pickupEntity == ""
		dropEmpty := dropEntity == ""

		if pickupEmpty && dropEmpty {
			issues = append(issues, InserterIssue{
				EntityNumber: e.EntityNumber,
				Position:     e.Position,
				Severity:     "error",
				Message:      fmt.Sprintf("%s at (%.1f, %.1f) has no entity at pickup or drop position", e.Name, e.Position.X, e.Position.Y),
				PickupEntity: "",
				DropEntity:   "",
			})
		} else if pickupEmpty || dropEmpty {
			side := "pickup"
			if dropEmpty {
				side = "drop"
			}
			issues = append(issues, InserterIssue{
				EntityNumber: e.EntityNumber,
				Position:     e.Position,
				Severity:     "warning",
				Message:      fmt.Sprintf("%s at (%.1f, %.1f) has no entity at %s position", e.Name, e.Position.X, e.Position.Y, side),
				PickupEntity: pickupEntity,
				DropEntity:   dropEntity,
			})
		}
	}

	if issues == nil {
		issues = []InserterIssue{}
	}
	return issues
}
