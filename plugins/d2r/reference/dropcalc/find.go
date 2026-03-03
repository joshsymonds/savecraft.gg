package dropcalc

import (
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/data"
)

// ItemSource represents a monster-area combination that can drop a specific item.
type ItemSource struct {
	MonsterID   string
	MonsterName string
	IsBoss      bool
	TCType      int // 0=regular, 1=champion, 2=unique, 3=quest
	Difficulty  int
	Area        string // "" for bosses (area doesn't affect their level)
	MLVL        int
	BaseProb    float64
	Quality     QualityResult
}

// FindOptions controls filtering for FindItemSources.
type FindOptions struct {
	Difficulty int    // 0=normal, 1=nm, 2=hell; -1 for all
	TCType     int    // 0=regular, 1=champion, 2=unique, 3=quest; -1 for all
	BossOnly   bool   // only include boss monsters
	Area       string // filter to specific area; "" for all
	Players    int    // default 1
	PartySize  int    // default 1
	MF         int
}

// monsterEntry is a precomputed monster-area-TC combination in the reverse index.
type monsterEntry struct {
	monsterID   string
	monsterName string
	isBoss      bool
	difficulty  int
	tcType      int
	area        string
	mlvl        int
	upgradedTC  string
	tcQuality   data.QualityRatios
}

// buildReverseIndex constructs the reverse TC tree and monster-TC index.
func (c *Calculator) buildReverseIndex() {
	// 1. Reverse TC parents: for each TC item reference, record the parent TC.
	c.reverseTCParents = make(map[string][]string, len(data.TreasureClasses))
	for i := range data.TreasureClasses {
		tc := &data.TreasureClasses[i]
		for _, item := range tc.Items {
			c.reverseTCParents[item.Name] = append(c.reverseTCParents[item.Name], tc.Name)
		}
	}

	// 2. Item → virtual TCs: which virtual TCs contain each base item.
	c.itemVirtualTCs = make(map[string][]string)
	for name, vtc := range c.virtualTCs {
		for _, item := range vtc.Items {
			c.itemVirtualTCs[item.Code] = append(c.itemVirtualTCs[item.Code], name)
		}
	}

	// 3. Monster → areas (reverse of Area.Monsters).
	type areaByDiff struct {
		area *data.Area
		diff int
	}
	monsterAreas := make(map[string][]areaByDiff)
	for i := range data.Areas {
		a := &data.Areas[i]
		for diff := 0; diff < 3; diff++ {
			for _, monID := range a.Monsters[diff] {
				monsterAreas[monID] = append(monsterAreas[monID], areaByDiff{a, diff})
			}
		}
	}

	// 4. Build entries indexed by upgraded TC name.
	c.tcToEntries = make(map[string][]*monsterEntry)
	for i := range data.Monsters {
		mon := &data.Monsters[i]
		for diff := 0; diff < 3; diff++ {
			for tcType := 0; tcType < 4; tcType++ {
				tcName := mon.TCs[diff][tcType]
				if tcName == "" {
					continue
				}

				if mon.IsBoss {
					e := c.newEntry(mon, diff, tcType, "", mon.Levels[diff], tcName)
					c.tcToEntries[e.upgradedTC] = append(c.tcToEntries[e.upgradedTC], e)
				} else {
					// Expand per area where this monster spawns.
					expanded := false
					for _, ma := range monsterAreas[mon.ID] {
						if ma.diff != diff {
							continue
						}
						mlvl := ma.area.Levels[diff]
						if mlvl == 0 {
							mlvl = mon.Levels[diff]
						}
						e := c.newEntry(mon, diff, tcType, ma.area.Name, mlvl, tcName)
						c.tcToEntries[e.upgradedTC] = append(c.tcToEntries[e.upgradedTC], e)
						expanded = true
					}
					if !expanded {
						// No area data — fall back to base monster level.
						e := c.newEntry(mon, diff, tcType, "", mon.Levels[diff], tcName)
						c.tcToEntries[e.upgradedTC] = append(c.tcToEntries[e.upgradedTC], e)
					}
				}
			}
		}
	}
}

func (c *Calculator) newEntry(mon *data.MonsterEntry, diff, tcType int, area string, mlvl int, tcName string) *monsterEntry {
	tc := c.tcByName[tcName]
	var tcQuality data.QualityRatios
	if tc != nil {
		tcQuality = tc.Quality
	}

	upgradedTC := tcName
	if diff > 0 && mlvl > 0 {
		upgradedTC = c.upgradeTCByLevel(tcName, mlvl)
		if upgraded := c.tcByName[upgradedTC]; upgraded != nil {
			tcQuality = mergeQuality(tcQuality, upgraded.Quality)
		}
	}

	return &monsterEntry{
		monsterID:   mon.ID,
		monsterName: mon.Name,
		isBoss:      mon.IsBoss,
		difficulty:  diff,
		tcType:      tcType,
		area:        area,
		mlvl:        mlvl,
		upgradedTC:  upgradedTC,
		tcQuality:   tcQuality,
	}
}

// findAncestorTCs returns all TC names that have a path to the given item code.
func (c *Calculator) findAncestorTCs(itemCode string) map[string]bool {
	ancestors := make(map[string]bool)
	queue := make([]string, 0, 64)

	// Seed from virtual TCs containing this item.
	for _, vtcName := range c.itemVirtualTCs[itemCode] {
		if !ancestors[vtcName] {
			ancestors[vtcName] = true
			queue = append(queue, vtcName)
		}
	}

	// Seed from direct TC references (runes, rings, amulets, gems, charms).
	for _, parent := range c.reverseTCParents[itemCode] {
		if !ancestors[parent] {
			ancestors[parent] = true
			queue = append(queue, parent)
		}
	}

	// BFS upward through the reverse TC tree.
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, parent := range c.reverseTCParents[current] {
			if !ancestors[parent] {
				ancestors[parent] = true
				queue = append(queue, parent)
			}
		}
	}

	return ancestors
}

// FindItemSources finds all monster-area combinations that can drop a given item,
// using the precomputed reverse TC index for fast lookup.
// Results are sorted by unique probability descending.
func (c *Calculator) FindItemSources(itemCode string, opts FindOptions) []ItemSource {
	ancestors := c.findAncestorTCs(itemCode)

	players := opts.Players
	if players <= 0 {
		players = 1
	}
	partySize := opts.PartySize
	if partySize <= 0 {
		partySize = 1
	}

	// Collect matching entries from the reverse index.
	tcCache := make(map[string]map[string]float64)
	var sources []ItemSource

	for tcName := range ancestors {
		entries := c.tcToEntries[tcName]
		if len(entries) == 0 {
			continue
		}

		// Resolve this TC once (memoized across all entries sharing it).
		baseProbs, ok := tcCache[tcName]
		if !ok {
			baseProbs = c.Resolve(tcName, players, partySize)
			tcCache[tcName] = baseProbs
		}
		prob := baseProbs[itemCode]
		if prob <= 0 {
			continue
		}

		for _, e := range entries {
			if opts.Difficulty >= 0 && e.difficulty != opts.Difficulty {
				continue
			}
			if opts.TCType >= 0 && e.tcType != opts.TCType {
				continue
			}
			if opts.BossOnly && !e.isBoss {
				continue
			}
			if opts.Area != "" && e.area != opts.Area {
				continue
			}

			quality := c.ComputeQuality(itemCode, e.mlvl, opts.MF, e.tcQuality)
			sources = append(sources, ItemSource{
				MonsterID:   e.monsterID,
				MonsterName: e.monsterName,
				IsBoss:      e.isBoss,
				TCType:      e.tcType,
				Difficulty:  e.difficulty,
				Area:        e.area,
				MLVL:        e.mlvl,
				BaseProb:    prob,
				Quality: QualityResult{
					Unique: prob * quality.Unique,
					Set:    prob * quality.Set,
					Rare:   prob * quality.Rare,
					Magic:  prob * quality.Magic,
					White:  prob * quality.White,
				},
			})
		}
	}

	sort.Slice(sources, func(i, j int) bool {
		return sources[i].Quality.Unique > sources[j].Quality.Unique
	})

	return sources
}
