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

// EvolutionSettings holds base evolution rates per tick.
type EvolutionSettings struct {
	TimeFactor      float64 // evolution per tick from passage of time
	DestroyFactor   float64 // evolution gained per spawner destroyed
	PollutionFactor float64 // evolution per unit of pollution absorbed
}

// DifficultyPreset holds evolution rate overrides for a difficulty preset.
// Only overridden fields are non-zero; zero means "use base EvolutionSettings value".
type DifficultyPreset struct {
	Name            string
	TimeFactor      float64 // 0 = use base
	DestroyFactor   float64 // 0 = use base
	PollutionFactor float64 // 0 = use base
}

// SpawnWeight is a point on an evolution-weight curve: at Evolution, the unit
// has this Weight in the spawner's probability distribution.
type SpawnWeight struct {
	Evolution float64
	Weight    float64
}

// SpawnerUnit is a unit type spawned by a spawner with evolution-gated weights.
type SpawnerUnit struct {
	Name    string
	Weights []SpawnWeight // piecewise-linear curve
}

// Spawner is an enemy spawner with an evolution-gated unit roster.
type Spawner struct {
	Name  string
	Units []SpawnerUnit
}

// EnemyTier is an evolution threshold at which a new enemy type appears.
type EnemyTier struct {
	Name      string  // e.g. "medium-worm-turret"
	Threshold float64 // build_base_evolution_requirement
}

// PowerEntity is a power generation or storage entity (not a crafting machine).
type PowerEntity struct {
	Name          string
	Type          string  // "boiler", "generator", "reactor", "solar-panel", "accumulator", "offshore-pump"
	PowerOutputKW float64 // electrical output (generators) or thermal output (reactors, boilers)
	EnergyUsage   string  // power consumption (e.g. offshore pumps)
	FluidPerSec   float64 // water/steam throughput rate
}

// ReactorLayout is a common nuclear reactor arrangement with precomputed adjacency.
type ReactorLayout struct {
	Name         string
	Reactors     int
	Adjacencies  []int   // neighbor count per reactor position
	AvgNeighbors float64 // precomputed average
}

// FuelItem is a burnable fuel with its energy value.
type FuelItem struct {
	Name    string
	EnergyMJ float64 // total energy in megajoules
}
