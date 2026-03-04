// Package dropcalc implements D2R treasure class resolution and drop probability
// computation from authoritative game data tables.
package dropcalc

import (
	"fmt"
	"math"
	"sort"
	"strconv"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/data"
)

// virtualTC represents a dynamically-generated treasure class for item
// categories like "armo3" or "weap6".
type virtualTC struct {
	Items       []virtualTCItem
	TotalWeight int
}

type virtualTCItem struct {
	Code   string
	Weight int
}

// Calculator holds indexed game data and performs drop probability computation.
type Calculator struct {
	tcByName       map[string]*data.TreasureClass
	tcsByGroup     map[int][]*data.TreasureClass // group → sorted by level
	baseItemByCode map[string]*data.BaseItem
	itemNameToCode map[string]string // display name → code (case-sensitive)
	itemTypeByCode map[string]*data.ItemType
	monsterByID    map[string]*data.MonsterEntry
	areaByName     map[string]*data.Area      // keyed by display name (e.g. "Drifter Cavern")
	allTypeCodes   map[string]map[string]bool // code → set of (self + all ancestor codes)
	virtualTCs     map[string]*virtualTC

	// Reverse index for item → source lookups.
	reverseTCParents map[string][]string        // child TC/item → parent TC names
	itemVirtualTCs   map[string][]string        // item code → virtual TC names containing it
	tcToEntries      map[string][]*monsterEntry // upgraded TC name → monster-area entries
}

// NewCalculator builds indexes from embedded data tables.
func NewCalculator() *Calculator {
	c := &Calculator{
		tcByName:       make(map[string]*data.TreasureClass, len(data.TreasureClasses)),
		tcsByGroup:     make(map[int][]*data.TreasureClass),
		baseItemByCode: make(map[string]*data.BaseItem, len(data.BaseItems)),
		itemNameToCode: make(map[string]string, len(data.BaseItems)),
		itemTypeByCode: make(map[string]*data.ItemType, len(data.ItemTypes)),
		monsterByID:    make(map[string]*data.MonsterEntry, len(data.Monsters)),
		areaByName:     make(map[string]*data.Area, len(data.Areas)),
	}

	for i := range data.TreasureClasses {
		tc := &data.TreasureClasses[i]
		c.tcByName[tc.Name] = tc
		if tc.Group != 0 {
			c.tcsByGroup[tc.Group] = append(c.tcsByGroup[tc.Group], tc)
		}
	}
	// Enforce ascending level order within each group — upgradeTCByLevel
	// depends on this for correct TC promotion in NM/Hell.
	for _, group := range c.tcsByGroup {
		sort.Slice(group, func(i, j int) bool {
			return group[i].Level < group[j].Level
		})
	}
	for i := range data.BaseItems {
		bi := &data.BaseItems[i]
		c.baseItemByCode[bi.Code] = bi
		c.itemNameToCode[bi.Name] = bi.Code
	}
	for i := range data.ItemTypes {
		c.itemTypeByCode[data.ItemTypes[i].Code] = &data.ItemTypes[i]
	}
	for i := range data.Monsters {
		c.monsterByID[data.Monsters[i].ID] = &data.Monsters[i]
	}
	for i := range data.Areas {
		a := &data.Areas[i]
		c.areaByName[a.Name] = a
		c.areaByName[a.ID] = a // also index by internal ID
	}

	c.buildTypeCodeHierarchy()
	c.buildVirtualTCs()
	c.buildReverseIndex()

	return c
}

// buildTypeCodeHierarchy resolves the full parent chain for each item type
// using Equiv1/Equiv2 columns (DFS through the type hierarchy).
func (c *Calculator) buildTypeCodeHierarchy() {
	c.allTypeCodes = make(map[string]map[string]bool, len(data.ItemTypes))
	for i := range data.ItemTypes {
		it := &data.ItemTypes[i]
		codes := make(map[string]bool)
		codes[it.Code] = true
		c.dfsParentCodes(it.Code, codes)
		c.allTypeCodes[it.Code] = codes
	}
}

func (c *Calculator) dfsParentCodes(code string, result map[string]bool) {
	it := c.itemTypeByCode[code]
	if it == nil {
		return
	}
	for _, parent := range []string{it.Equiv1, it.Equiv2} {
		if parent != "" && !result[parent] {
			result[parent] = true
			c.dfsParentCodes(parent, result)
		}
	}
}

// buildVirtualTCs generates virtual treasure classes (armo3, weap6, etc.)
// by assigning each base item to TCs based on its type hierarchy and level.
func (c *Calculator) buildVirtualTCs() {
	c.virtualTCs = make(map[string]*virtualTC)

	for i := range data.BaseItems {
		bi := &data.BaseItems[i]
		it := c.itemTypeByCode[bi.Type]
		if it == nil {
			continue
		}
		rarity := it.Rarity
		if rarity <= 0 {
			continue
		}

		// Round level up to nearest multiple of 3.
		tcLevel := bi.Level + (3-bi.Level%3)%3

		// Assign to virtual TCs for self and all parent type codes.
		codes := c.allTypeCodes[bi.Type]
		for code := range codes {
			name := code + strconv.Itoa(tcLevel)
			vtc := c.virtualTCs[name]
			if vtc == nil {
				vtc = &virtualTC{}
				c.virtualTCs[name] = vtc
			}
			vtc.Items = append(vtc.Items, virtualTCItem{Code: bi.Code, Weight: rarity})
			vtc.TotalWeight += rarity
		}
	}
}

// upgradeTCByLevel finds the highest TC in the same group whose level ≤ mlvl.
func (c *Calculator) upgradeTCByLevel(tcName string, mlvl int) string {
	tc := c.tcByName[tcName]
	if tc == nil || tc.Group == 0 {
		return tcName
	}
	group := c.tcsByGroup[tc.Group]
	if len(group) == 0 {
		return tcName
	}

	// Find the base TC's position, then walk forward.
	best := tcName
	found := false
	for _, candidate := range group {
		if candidate.Name == tcName {
			found = true
			best = candidate.Name
			continue
		}
		if found && candidate.Level <= mlvl {
			best = candidate.Name
		} else if found && candidate.Level > mlvl {
			break
		}
	}
	return best
}

// calcNoDrop computes the effective NoDrop weight with player/party scaling.
// sumProbs is the sum of all item outcome probabilities in the TC.
func calcNoDrop(noDrop, sumProbs, nPlayers, partySize int) int {
	if noDrop <= 0 {
		return 0
	}
	if nPlayers <= 1 {
		return noDrop
	}

	exponent := math.Floor(1 + float64(nPlayers-1)/2.0 + float64(partySize-1)/2.0)
	baseRate := float64(noDrop) / float64(noDrop+sumProbs)
	newRate := math.Pow(baseRate, exponent)
	newNum := (newRate / (1 - newRate)) * float64(sumProbs)
	return int(math.Floor(newNum))
}

// Resolve computes drop probabilities for a treasure class, returning a map
// of base item code → probability of that item dropping per kill.
func (c *Calculator) Resolve(tcName string, nPlayers, partySize int) map[string]float64 {
	result := make(map[string]float64)
	c.resolve(tcName, 1.0, nPlayers, partySize, 1, result)
	return result
}

// resolve recursively traverses the TC tree, accumulating probabilities.
// picks is the absolute number of picks at this level (already resolved).
func (c *Calculator) resolve(tcName string, probAccum float64, nPlayers, partySize, picks int, result map[string]float64) {
	// Check if it's a defined TC.
	tc := c.tcByName[tcName]
	if tc != nil {
		c.resolveTC(tc, probAccum, nPlayers, partySize, picks, result)
		return
	}

	// Check if it's a virtual TC.
	vtc := c.virtualTCs[tcName]
	if vtc != nil {
		c.resolveVirtualTC(vtc, probAccum, picks, result)
		return
	}

	// Check if it's a direct base item code (e.g., "gld", "r01").
	if _, ok := c.baseItemByCode[tcName]; ok {
		applyPicks(tcName, probAccum, picks, result)
		return
	}

	// Unknown reference — could be gold ("gld") or other special tokens.
	// Silently skip; these don't contribute to item drop probabilities.
}

func (c *Calculator) resolveTC(tc *data.TreasureClass, probAccum float64, nPlayers, partySize, picks int, result map[string]float64) {
	if len(tc.Items) == 0 {
		return
	}

	// Sum of all item probabilities.
	sumProbs := 0
	for _, item := range tc.Items {
		sumProbs += item.Probability
	}

	// Effective NoDrop.
	effectiveNoDrop := calcNoDrop(tc.NoDrop, sumProbs, nPlayers, partySize)
	denominator := sumProbs + effectiveNoDrop

	if denominator <= 0 {
		return
	}

	tcPicks := tc.Picks
	if tcPicks == 0 {
		tcPicks = 1
	}

	if tcPicks < 0 {
		// Negative picks: each item in the list is an independent, guaranteed
		// drop event. A champion TC with Picks=-2 and items [Citem, Cpot]
		// means the monster drops BOTH an item AND a potion independently.
		for _, item := range tc.Items {
			c.resolveOutcome(item.Name, probAccum, nPlayers, partySize, picks, result)
		}
	} else {
		// Positive picks: 1 - (1-p)^picks for each outcome.
		for _, item := range tc.Items {
			childProb := float64(item.Probability) / float64(denominator)
			c.resolveOutcome(item.Name, childProb*probAccum, nPlayers, partySize, tcPicks*picks, result)
		}
	}
}

func (c *Calculator) resolveOutcome(name string, prob float64, nPlayers, partySize, picks int, result map[string]float64) {
	// Is it a defined TC?
	if tc := c.tcByName[name]; tc != nil {
		c.resolveTC(tc, prob, nPlayers, partySize, picks, result)
		return
	}
	// Is it a virtual TC?
	if vtc := c.virtualTCs[name]; vtc != nil {
		c.resolveVirtualTC(vtc, prob, picks, result)
		return
	}
	// Is it a base item code?
	if _, ok := c.baseItemByCode[name]; ok {
		applyPicks(name, prob, picks, result)
		return
	}
	// Special tokens (gld, etc.) — skip.
}

func (c *Calculator) resolveVirtualTC(vtc *virtualTC, probAccum float64, picks int, result map[string]float64) {
	if vtc.TotalWeight <= 0 {
		return
	}
	for _, item := range vtc.Items {
		itemProb := probAccum * float64(item.Weight) / float64(vtc.TotalWeight)
		applyPicks(item.Code, itemProb, picks, result)
	}
}

// applyPicks applies the "at least one from N picks" formula and accumulates
// the result. For picks=1 this is just the probability itself.
func applyPicks(code string, prob float64, picks int, result map[string]float64) {
	if picks <= 1 {
		result[code] += prob
		return
	}
	// P(at least 1) = 1 - (1-p)^picks.
	// D2R caps effective picks at 6 to prevent probability overflow in
	// deeply nested TC trees (e.g., Act bosses with high pick counts).
	effectivePicks := picks
	if effectivePicks > 6 {
		effectivePicks = 6
	}
	result[code] += 1 - math.Pow(1-prob, float64(effectivePicks))
}

// ResolveToTCs computes drop probabilities but stops at virtual TC level
// (armo3, weap6, etc.) instead of expanding to individual base items.
// Used for cross-validation against known-good drop calculator output.
func (c *Calculator) ResolveToTCs(tcName string, nPlayers, partySize int) map[string]float64 {
	result := make(map[string]float64)
	c.resolveToTCs(tcName, 1.0, nPlayers, partySize, 1, result)
	return result
}

func (c *Calculator) resolveToTCs(tcName string, probAccum float64, nPlayers, partySize, picks int, result map[string]float64) {
	tc := c.tcByName[tcName]
	if tc != nil {
		c.resolveTCToTCs(tc, probAccum, nPlayers, partySize, picks, result)
		return
	}
	// If it's a virtual TC or base item code, it's a leaf.
	if _, ok := c.virtualTCs[tcName]; ok {
		applyPicks(tcName, probAccum, picks, result)
		return
	}
	if _, ok := c.baseItemByCode[tcName]; ok {
		applyPicks(tcName, probAccum, picks, result)
		return
	}
	// Unknown (gld, etc.) — accumulate as-is.
	applyPicks(tcName, probAccum, picks, result)
}

func (c *Calculator) resolveTCToTCs(tc *data.TreasureClass, probAccum float64, nPlayers, partySize, picks int, result map[string]float64) {
	if len(tc.Items) == 0 {
		return
	}
	sumProbs := 0
	for _, item := range tc.Items {
		sumProbs += item.Probability
	}
	effectiveNoDrop := calcNoDrop(tc.NoDrop, sumProbs, nPlayers, partySize)
	denominator := sumProbs + effectiveNoDrop
	if denominator <= 0 {
		return
	}
	tcPicks := tc.Picks
	if tcPicks == 0 {
		tcPicks = 1
	}
	if tcPicks < 0 {
		for _, item := range tc.Items {
			c.resolveToTCs(item.Name, probAccum, nPlayers, partySize, picks, result)
		}
	} else {
		for _, item := range tc.Items {
			childProb := float64(item.Probability) / float64(denominator)
			c.resolveToTCs(item.Name, childProb*probAccum, nPlayers, partySize, tcPicks*picks, result)
		}
	}
}

// ResolveMonster computes drop probabilities for a specific monster in a
// specific difficulty (0=Normal, 1=Nightmare, 2=Hell), using the monster's
// treasure class for the given type (0=regular, 1=champion, 2=unique, 3=quest).
func (c *Calculator) ResolveMonster(monsterID string, difficulty, tcType, nPlayers, partySize int) (map[string]float64, error) {
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

	// Upgrade TC based on monster level for nightmare/hell.
	mlvl := mon.Levels[difficulty]
	if difficulty > 0 && mlvl > 0 {
		tcName = c.upgradeTCByLevel(tcName, mlvl)
	}

	return c.Resolve(tcName, nPlayers, partySize), nil
}

// ItemName returns the display name for a base item code.
func (c *Calculator) ItemName(code string) string {
	if bi := c.baseItemByCode[code]; bi != nil {
		return bi.Name
	}
	return code
}

// ItemCode resolves an item name or code to a code. Returns "" if not found.
func (c *Calculator) ItemCode(nameOrCode string) string {
	if _, ok := c.baseItemByCode[nameOrCode]; ok {
		return nameOrCode
	}
	if code, ok := c.itemNameToCode[nameOrCode]; ok {
		return code
	}
	return ""
}

// IsBaseItem reports whether the given code is a known base item.
func (c *Calculator) IsBaseItem(code string) bool {
	_, ok := c.baseItemByCode[code]
	return ok
}

