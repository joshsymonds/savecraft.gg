package data

// Medicine represents a medicine item relevant to surgery calculations.
type Medicine struct {
	DefName        string
	Label          string
	MedicalPotency float64
}

// Bed represents a bed or sleeping spot relevant to surgery calculations.
type Bed struct {
	DefName                    string
	Label                      string
	SurgerySuccessChanceFactor float64
}

// Plant represents a cultivated plant with growth and harvest parameters.
type Plant struct {
	DefName              string
	Label                string
	GrowDays             float64
	HarvestYield         float64
	HarvestedItem        string
	FertilitySensitivity float64
	NutritionPerUnit     float64
	MarketValuePerUnit   float64
	SowTags              []string
}

// Soil represents a terrain type with a fertility value.
type Soil struct {
	DefName   string
	Label     string
	Fertility float64
}

// Gene represents a gene definition with build-relevant properties.
type Gene struct {
	DefName          string
	Label            string
	Description      string
	Complexity       int
	MetabolismOffset int
	ArchiteCost      int
	Category         string
	ExclusionTags    []string
}

// ResearchProject represents a research project with costs and prerequisites.
type ResearchProject struct {
	DefName       string
	Label         string
	BaseCost      float64
	TechLevel     string
	RequiredBench string
	Prerequisites []string
}

// Drug represents a drug item with economy and addiction data.
type Drug struct {
	DefName                 string
	Label                   string
	MarketValue             float64
	Category                string // Social, Hard, Medical
	WorkAmount              float64
	Ingredients             []string // "ItemDef:count" pairs
	Addictiveness           float64
	MinToleranceToAddict    float64
	ExistingAddictionOffset float64
	NeedLevelOffset         float64
	OverdoseSeverity        float64
	LargeOverdoseChance     float64
}

// Material represents a stuff/material with its stat factors.
type Material struct {
	DefName            string
	Label              string
	MarketValue        float64
	Categories         []string
	SharpArmorFactor   float64
	BluntArmorFactor   float64
	HeatArmorFactor    float64
	ColdInsulation     float64
	HeatInsulation     float64
	SharpDamageFactor  float64
	BluntDamageFactor  float64
	MaxHitPointsFactor float64
	BeautyFactor       float64
	BeautyOffset       float64
}

// RangedWeapon represents a ranged weapon with combat stats.
type RangedWeapon struct {
	DefName                string
	Label                  string
	DamagePerShot          float64
	ArmorPenetration       float64
	BurstShotCount         int
	WarmupTime             float64
	Cooldown               float64
	TicksBetweenBurstShots int
	Range                  float64
	AccuracyTouch          float64
	AccuracyShort          float64
	AccuracyMedium         float64
	AccuracyLong           float64
}

// MeleeWeapon represents a melee weapon with tool verbs.
type MeleeWeapon struct {
	DefName string
	Label   string
	Tools   []MeleeToolData
}

// MeleeToolData represents a single melee attack verb on a weapon.
type MeleeToolData struct {
	Label            string
	Power            float64
	Cooldown         float64
	ArmorPenetration float64
	Capacities       []string
}
