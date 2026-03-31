package main

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/json"
	"io"
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
	Item        string          `json:"item"`
	Label       string          `json:"label,omitempty"`
	Version     int64           `json:"version"`
	ActiveIndex int             `json:"active_index"`
	Blueprints  []BookEntry     `json:"blueprints"`
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

	jsonBytes, err := io.ReadAll(r)
	if err != nil {
		return nil, &decodeError{"zlib decompress failed: " + err.Error()}
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
	"splitter":                     true,
	"fast-splitter":                true,
	"express-splitter":             true,
	"underground-belt":             true,
	"fast-underground-belt":        true,
	"express-underground-belt":     true,
	"turbo-underground-belt":       true,
	"turbo-splitter":               true,
	"loader":                       true,
	"fast-loader":                  true,
	"express-loader":               true,
	"turbo-loader":                 true,
	"roboport":                     true,
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
	"heat-pipe":       true,
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

func handleSingleBlueprint(enc *json.Encoder, bp *Blueprint) {
	breakdown := classifyEntities(bp.Entities)
	recipeSummary := extractRecipeSummary(bp.Entities)
	moduleSummary := extractModuleSummary(bp.Entities)

	result := map[string]any{
		"type":             "blueprint",
		"label":            bp.Label,
		"entity_count":     len(bp.Entities),
		"entities":         bp.Entities,
		"entity_breakdown": breakdown,
		"recipe_summary":   recipeSummary,
		"module_summary":   moduleSummary,
	}

	writeResult(enc, result)
}

func handleBlueprintBook(enc *json.Encoder, book *BlueprintBook) {
	blueprints := make([]map[string]any, 0, len(book.Blueprints))
	for _, entry := range book.Blueprints {
		bp := entry.Blueprint
		breakdown := classifyEntities(bp.Entities)
		recipeSummary := extractRecipeSummary(bp.Entities)
		moduleSummary := extractModuleSummary(bp.Entities)
		blueprints = append(blueprints, map[string]any{
			"label":            bp.Label,
			"entity_count":     len(bp.Entities),
			"entities":         bp.Entities,
			"entity_breakdown": breakdown,
			"recipe_summary":   recipeSummary,
			"module_summary":   moduleSummary,
		})
	}

	result := map[string]any{
		"type":       "blueprint_book",
		"label":      book.Label,
		"blueprints": blueprints,
	}

	writeResult(enc, result)
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
