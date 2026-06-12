// Package data holds Satisfactory game data generated from the game-shipped
// CommunityResources/Docs/en-US.json by plugins/satisfactory/tools/datagen.
// All keys are short class names (e.g. "Recipe_IronPlate_C").
package data

// ItemAmount pairs an item class with a quantity. Fluid and gas amounts are
// in the Docs' native units (1000 = 1 m³); divide by 1000 for display.
type ItemAmount struct {
	ItemClass string
	Amount    int
}

// Recipe is an FGRecipe: what goes in, what comes out, how long it takes,
// and which buildings can run it.
type Recipe struct {
	ClassName   string
	DisplayName string
	Ingredients []ItemAmount
	Products    []ItemAmount
	DurationSec float64
	ProducedIn  []string // building class names; includes hand-craft benches
	Alternate   bool     // unlocked via an EST_Alternate schematic
}

// Item is any descriptor (parts, resources, equipment, biomass, ammo, ...).
type Item struct {
	ClassName   string
	DisplayName string
	Form        string // RF_SOLID, RF_LIQUID, RF_GAS
	StackSize   string // SS_ONE/SMALL/MEDIUM/BIG/HUGE/FLUID
	EnergyMJ    float64
	SinkPoints  int
	// Raw marks world-extracted resources (FGResourceDescriptor): ores,
	// water, oil, gases. Production planning stops at these.
	Raw bool
}

// Building covers production machines, extractors, and generators.
type Building struct {
	ClassName   string
	DisplayName string
	// Kind: manufacturer, manufacturerVariablePower, extractor, generator.
	Kind string
	// PowerMW is consumption at 100% clock (manufacturers, extractors). For
	// variable-power manufacturers it is the estimated maximum.
	PowerMW float64
	// PowerProductionMW is generation at 100% clock (generators).
	PowerProductionMW float64
	// FuelClasses lists burnable fuel item classes (generators).
	FuelClasses []string
	// Extractors: items per cycle and cycle seconds; rate/min at 100% clock
	// = ItemsPerCycle * 60 / ExtractCycleSec.
	ItemsPerCycle   int
	ExtractCycleSec float64
}

// Schematic is an FGSchematic: milestones, MAM research, alternates, shop.
type Schematic struct {
	ClassName     string
	DisplayName   string
	Type          string // EST_Milestone, EST_MAM, EST_Alternate, EST_ResourceSink, ...
	Tier          int
	Cost          []ItemAmount
	UnlockRecipes []string // recipe class names
}
