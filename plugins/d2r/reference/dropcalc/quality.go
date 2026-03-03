package dropcalc

import (
	"fmt"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/data"
)

// QualityResult holds the probability of each quality tier for a specific item.
type QualityResult struct {
	Unique float64
	Set    float64
	Rare   float64
	Magic  float64
	White  float64
}

// ItemDrop represents a fully-resolved drop with base probability and quality breakdown.
type ItemDrop struct {
	Code     string
	Name     string
	BaseProb float64 // probability of the base item dropping (any quality)
	Quality  QualityResult
}

// qualityTier identifies a quality level for the sequential check.
type qualityTier int

const (
	tierUnique qualityTier = iota
	tierSet
	tierRare
	tierMagic
)

// mfFactors are the diminishing returns factors for each quality tier.
// Magic has no diminishing returns (factor=0 means linear).
var mfFactors = [4]int{250, 500, 600, 0}

// effectiveMF computes the effective magic find for a quality tier.
// Unique/Set/Rare have diminishing returns: effectiveMF = mf * factor / (mf + factor).
// Magic uses raw MF.
func effectiveMF(mf int, tier qualityTier) int {
	if mf <= 10 || tier == tierMagic {
		return mf
	}
	factor := mfFactors[tier]
	return mf * factor / (mf + factor)
}

// qualityChance computes the probability of rolling a single quality tier.
// This is the raw chance BEFORE considering that higher tiers are checked first.
//
// Formula: chance = (ratio - (mlvl - qlvl) / divisor) * 128
// With MF: chanceWithMF = (chance * 100) / (100 + effectiveMF)
// With TC bonus: final = chance - (chance * tcBonus / 1024)
// Result: probability = 128 / final (or 1.0 if final <= 0)
func qualityChance(mlvl, qlvl, mf int, mods data.QualityModifiers, tcBonus int, tier qualityTier) float64 {
	chance := mods.Ratio - (mlvl-qlvl)/mods.Divisor
	mulChance := chance * 128

	emf := effectiveMF(mf, tier)
	chanceWithMF := (mulChance * 100) / (100 + emf)

	if mods.Min > chanceWithMF {
		chanceWithMF = mods.Min
	}

	chanceAfterFactor := chanceWithMF - (chanceWithMF * tcBonus / 1024)
	if chanceAfterFactor <= 0 {
		return 1.0
	}
	return 128.0 / float64(chanceAfterFactor)
}

// ComputeQuality computes quality probabilities for a base item.
// mlvl is the monster level, mf is the player's magic find percentage,
// and tcQuality is the accumulated quality ratios from the TC tree.
func (c *Calculator) ComputeQuality(baseItemCode string, mlvl, mf int, tcQuality data.QualityRatios) QualityResult {
	bi := c.baseItemByCode[baseItemCode]
	if bi == nil {
		return QualityResult{White: 1.0}
	}
	it := c.itemTypeByCode[bi.Type]
	if it == nil {
		return QualityResult{White: 1.0}
	}

	// Items that can't be magic (Normal-only flag) are always white.
	if !it.CanBeMagic {
		return QualityResult{White: 1.0}
	}

	// Determine item version (normal/exceptional/elite) for ratio lookup.
	isUber := bi.NormCode != "" && bi.NormCode != bi.Code
	isClassSpecific := it.IsClassSpecific

	// Look up the appropriate item ratio entry.
	var ratioEntry *data.ItemRatioEntry
	for i := range data.ItemRatios {
		r := &data.ItemRatios[i]
		if r.IsUber == isUber && r.IsClassSpecific == isClassSpecific {
			ratioEntry = r
			break
		}
	}
	if ratioEntry == nil {
		return QualityResult{White: 1.0}
	}

	qlvl := bi.Level

	// Compute raw probabilities for each tier.
	pUnique := qualityChance(mlvl, qlvl, mf, ratioEntry.Unique, tcQuality.Unique, tierUnique)
	pSet := qualityChance(mlvl, qlvl, mf, ratioEntry.Set, tcQuality.Set, tierSet)
	pRare := qualityChance(mlvl, qlvl, mf, ratioEntry.Rare, tcQuality.Rare, tierRare)
	pMagic := qualityChance(mlvl, qlvl, mf, ratioEntry.Magic, tcQuality.Magic, tierMagic)

	// Items that can't be rare fall through to magic.
	if !it.CanBeRare {
		pRare = 0
	}

	// Sequential quality determination:
	// Check unique first. If not unique, check set (with P(not unique) factor).
	// If not set, check rare. If not rare, check magic. Remainder is white.
	unique := pUnique
	set := (1 - pUnique) * pSet
	rare := (1 - pUnique) * (1 - pSet) * pRare
	magic := (1 - pUnique) * (1 - pSet) * (1 - pRare) * pMagic
	white := 1 - unique - set - rare - magic

	// Clamp to avoid negative values from floating-point.
	if white < 0 {
		white = 0
	}

	return QualityResult{
		Unique: unique,
		Set:    set,
		Rare:   rare,
		Magic:  magic,
		White:  white,
	}
}

// ResolveWithQuality resolves a monster's drops and applies quality determination.
// Returns a list of ItemDrops with per-quality probabilities.
// If area is non-empty, the area's monster level overrides the monster's base level.
func (c *Calculator) ResolveWithQuality(monsterID string, difficulty, tcType, nPlayers, partySize, mf int, area ...string) ([]ItemDrop, error) {
	mon := c.monsterByID[monsterID]
	if mon == nil {
		return nil, fmt.Errorf("unknown monster: %s", monsterID)
	}
	if difficulty < 0 || difficulty > 2 {
		return nil, fmt.Errorf("invalid difficulty: %d", difficulty)
	}
	if tcType < 0 || tcType > 3 {
		return nil, fmt.Errorf("invalid TC type: %d", tcType)
	}

	tcName := mon.TCs[difficulty][tcType]
	if tcName == "" {
		return nil, fmt.Errorf("monster %s has no TC for difficulty %d type %d", monsterID, difficulty, tcType)
	}

	// Get TC quality ratios from the top-level TC.
	tc := c.tcByName[tcName]
	var tcQuality data.QualityRatios
	if tc != nil {
		tcQuality = tc.Quality
	}

	// Monster level: use area level if specified, else base monster level.
	mlvl := mon.Levels[difficulty]
	if len(area) > 0 && area[0] != "" {
		if a := c.areaByName[area[0]]; a != nil {
			mlvl = a.Levels[difficulty]
		}
	}

	if difficulty > 0 && mlvl > 0 {
		tcName = c.upgradeTCByLevel(tcName, mlvl)
		// Re-check quality ratios after upgrade — take max.
		if upgraded := c.tcByName[tcName]; upgraded != nil {
			tcQuality = mergeQuality(tcQuality, upgraded.Quality)
		}
	}

	// Resolve base item probabilities.
	baseProbs := c.Resolve(tcName, nPlayers, partySize)

	// Apply quality determination to each base item.
	var drops []ItemDrop
	for code, prob := range baseProbs {
		if !c.IsBaseItem(code) {
			continue
		}
		quality := c.ComputeQuality(code, mlvl, mf, tcQuality)
		drops = append(drops, ItemDrop{
			Code:     code,
			Name:     c.ItemName(code),
			BaseProb: prob,
			Quality: QualityResult{
				Unique: prob * quality.Unique,
				Set:    prob * quality.Set,
				Rare:   prob * quality.Rare,
				Magic:  prob * quality.Magic,
				White:  prob * quality.White,
			},
		})
	}

	return drops, nil
}

// AreaLevel returns the monster level for an area at a given difficulty, or 0 if not found.
func (c *Calculator) AreaLevel(areaName string, difficulty int) int {
	if a := c.areaByName[areaName]; a != nil && difficulty >= 0 && difficulty <= 2 {
		return a.Levels[difficulty]
	}
	return 0
}

func mergeQuality(a, b data.QualityRatios) data.QualityRatios {
	return data.QualityRatios{
		Unique: maxInt(a.Unique, b.Unique),
		Set:    maxInt(a.Set, b.Set),
		Rare:   maxInt(a.Rare, b.Rare),
		Magic:  maxInt(a.Magic, b.Magic),
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
