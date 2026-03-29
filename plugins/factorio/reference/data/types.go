package data

// Ingredient is a recipe input (item or fluid).
type Ingredient struct {
	Type   string // "item" or "fluid"
	Name   string
	Amount float64
}

// Product is a recipe output, optionally probabilistic.
type Product struct {
	Type        string // "item" or "fluid"
	Name        string
	Amount      float64
	Probability float64 // 1.0 if not specified
}

// Recipe is a Factorio crafting recipe.
type Recipe struct {
	Name           string
	Category       string  // e.g. "crafting", "smelting", "oil-processing", "electronics"
	EnergyRequired float64 // craft time in seconds (default 0.5)
	Ingredients    []Ingredient
	Results        []Product
	Enabled        bool // true if available without research
}

// Technology is a researchable technology.
type Technology struct {
	Name          string
	Prerequisites []string
	UnitCount     float64      // number of research units (0 for infinite)
	UnitTime      float64      // seconds per unit
	Ingredients   []Ingredient // science packs needed per unit
	Effects       []string     // recipe names unlocked
	MaxLevel      float64      // math.Inf for infinite research, 0 for normal
}

// CraftingMachine is an assembler, furnace, chemical plant, refinery, or rocket silo.
type CraftingMachine struct {
	Name               string
	CraftingSpeed      float64
	EnergyUsage        string // e.g. "375kW"
	ModuleSlots        int
	CraftingCategories []string
	AllowedEffects     []string // "speed", "productivity", "consumption", "pollution", "quality"
}

// Module is a speed, productivity, efficiency, or quality module.
type Module struct {
	Name     string
	Category string // "speed", "productivity", "efficiency", "quality"
	Tier     int
	Effects  ModuleEffects
}

// ModuleEffects holds the numeric effect values for a module.
type ModuleEffects struct {
	Speed        float64
	Consumption  float64
	Productivity float64
	Pollution    float64
	Quality      float64
}

// Belt is a transport belt with throughput data.
type Belt struct {
	Name        string
	Speed       float64 // tiles per tick
	ItemsPerSec float64 // computed: speed * 480 (60 ticks/sec * 8 items/tile)
}

// Inserter is an inserter entity.
type Inserter struct {
	Name           string
	RotationSpeed  float64
	StackSizeBonus int
}

// Beacon holds beacon parameters.
type Beacon struct {
	Name                    string
	DistributionEffectivity float64
	ModuleSlots             int
	SupplyAreaDistance      float64
	EnergyUsage             string
}

// Fluid is a fluid prototype.
type Fluid struct {
	Name string
}
