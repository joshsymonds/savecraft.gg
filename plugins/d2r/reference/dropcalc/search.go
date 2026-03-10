package dropcalc

import (
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/d2r/reference/data"
)

// SearchResult represents an item matching a search query.
type SearchResult struct {
	Name     string
	BaseName string // base item display name
	BaseCode string
	IsSet    bool
	SetName  string
	QLevel   int
	LevelReq int
	Stats    []data.ItemStat
}

// searchableItem is an internal representation for indexing.
type searchableItem struct {
	name     string
	code     string
	isSet    bool
	setName  string
	qLevel   int
	levelReq int
	stats    []data.ItemStat
}

// propertyAliases maps human-readable search terms to property codes.
// Multiple aliases can map to the same property.
var propertyAliases = map[string][]string{
	// Resistances
	"resist all":       {"res-all"},
	"all resist":       {"res-all"},
	"all resistances":  {"res-all"},
	"cold resist":      {"res-cold"},
	"fire resist":      {"res-fire"},
	"lightning resist": {"res-ltng"},
	"poison resist":    {"res-pois"},
	"cold resistance":  {"res-cold"},
	"fire resistance":  {"res-fire"},
	"light resistance": {"res-ltng"},
	"resist cold":      {"res-cold"},
	"resist fire":      {"res-fire"},
	"resist lightning": {"res-ltng"},
	"resist poison":    {"res-pois"},

	// Cannot Be Frozen
	"cannot be frozen": {"nofreeze"},
	"cbf":              {"nofreeze"},
	"freeze":           {"nofreeze"},

	// Absorb
	"cold absorb":      {"abs-cold%", "abs-cold"},
	"fire absorb":      {"abs-fire%", "abs-fire"},
	"lightning absorb": {"abs-ltng%", "abs-ltng"},

	// Life/Mana
	"life":       {"hp"},
	"health":     {"hp"},
	"mana":       {"mana"},
	"life steal": {"lifesteal"},
	"life leech": {"lifesteal"},
	"mana steal": {"manasteal"},
	"mana leech": {"manasteal"},

	// Attributes
	"strength":  {"str"},
	"dexterity": {"dex"},
	"vitality":  {"vit"},
	"energy":    {"enr"},

	// Damage
	"enhanced damage":  {"dmg%"},
	"damage":           {"dmg%", "dmg-norm"},
	"fire damage":      {"dmg-fire"},
	"cold damage":      {"dmg-cold"},
	"lightning damage": {"dmg-ltng"},
	"poison damage":    {"dmg-pois"},
	"magic damage":     {"dmg-mag"},

	// Defense
	"enhanced defense": {"ac%"},
	"defense":          {"ac%", "ac"},

	// Skills
	"all skills": {"allskills"},
	"skills":     {"allskills", "skill", "skilltab"},

	// Speed
	"faster cast rate":       {"cast2"},
	"fcr":                    {"cast2"},
	"faster hit recovery":    {"balance2"},
	"fhr":                    {"balance2"},
	"faster run walk":        {"move2"},
	"frw":                    {"move2"},
	"increased attack speed": {"swing2"},
	"ias":                    {"swing2"},
	"attack speed":           {"swing2"},

	// Other
	"attack rating": {"att", "att%"},
	"magic find":    {"mag%"},
	"mf":            {"mag%"},
	"gold find":     {"gold%"},
	"crushing blow": {"crush"},
	"deadly strike": {"deadly"},
	"open wounds":   {"openwounds"},
	"knockback":     {"knock"},
	"slow":          {"slow"},
	"block":         {"block"},
	"thorns":        {"thorns"},
}

// itemTypeAliases maps human-readable type names to item type codes.
var itemTypeAliases = map[string]string{
	"ring":     "ring",
	"rings":    "ring",
	"amulet":   "amul",
	"amulets":  "amul",
	"helm":     "helm",
	"helmet":   "helm",
	"helmets":  "helm",
	"armor":    "tors",
	"armors":   "tors",
	"body":     "tors",
	"shield":   "shie",
	"shields":  "shie",
	"gloves":   "glov",
	"glove":    "glov",
	"boots":    "boot",
	"boot":     "boot",
	"belt":     "belt",
	"belts":    "belt",
	"weapon":   "weap",
	"weapons":  "weap",
	"sword":    "swor",
	"swords":   "swor",
	"axe":      "axe",
	"axes":     "axe",
	"mace":     "mace",
	"maces":    "mace",
	"polearm":  "pole",
	"polearms": "pole",
	"spear":    "spea",
	"spears":   "spea",
	"bow":      "bow",
	"bows":     "bow",
	"crossbow": "xbow",
	"staff":    "staf",
	"staves":   "staf",
	"wand":     "wand",
	"wands":    "wand",
	"scepter":  "scep",
	"scepters": "scep",
	"dagger":   "knif",
	"daggers":  "knif",
	"knife":    "knif",
	"javelin":  "jave",
	"javelins": "jave",
	"circlet":  "circ",
	"circlets": "circ",
	"charm":    "char",
	"charms":   "char",
}

// SearchItems finds unique and set items matching the query.
// The query is parsed for: item type keywords, property aliases, set names,
// and name substrings. All conditions must match (AND across aliases, OR within each alias).
func (c *Calculator) SearchItems(query string) []SearchResult {
	typeFilter, propGroups, nameTerms, setFilter := c.parseSearchQuery(query)

	var results []SearchResult
	for i := range c.searchIndex {
		si := &c.searchIndex[i]
		if !c.matchesSearch(si, typeFilter, propGroups, nameTerms, setFilter) {
			continue
		}
		r := SearchResult{
			Name:     si.name,
			BaseName: c.ItemName(si.code),
			BaseCode: si.code,
			IsSet:    si.isSet,
			SetName:  si.setName,
			QLevel:   si.qLevel,
			LevelReq: si.levelReq,
			Stats:    si.stats,
		}
		results = append(results, r)
	}
	return results
}

// sortedAliases is propertyAliases sorted by word count descending (longer matches first).
// Pre-computed once at init to avoid re-sorting on every query.
var sortedAliases []aliasEntry

type aliasEntry struct {
	alias string
	codes []string
	words []string
}

func init() {
	sortedAliases = make([]aliasEntry, 0, len(propertyAliases))
	for alias, codes := range propertyAliases {
		sortedAliases = append(sortedAliases, aliasEntry{alias, codes, strings.Fields(alias)})
	}
	sort.Slice(sortedAliases, func(i, j int) bool {
		return len(sortedAliases[i].words) > len(sortedAliases[j].words)
	})
}

// parseSearchQuery breaks a query into type filters, property filter groups,
// remaining name terms, and set name filter.
// Each property group is a set of alternative property codes from one alias (OR within group, AND across groups).
func (c *Calculator) parseSearchQuery(query string) (typeCode string, propGroups [][]string, nameTerms []string, setName string) {
	lower := strings.ToLower(query)
	words := strings.Fields(lower)

	// Track which words are consumed by multi-word matches.
	consumed := make([]bool, len(words))

	for _, ae := range sortedAliases {
		if !strings.Contains(lower, ae.alias) {
			continue
		}
		// Check that the alias words haven't already been consumed by a longer match.
		matched := false
		for i := 0; i <= len(words)-len(ae.words); i++ {
			allMatch := true
			anyConsumed := false
			for j, aw := range ae.words {
				if words[i+j] != aw {
					allMatch = false
					break
				}
				if consumed[i+j] {
					anyConsumed = true
				}
			}
			if allMatch && !anyConsumed {
				for j := range ae.words {
					consumed[i+j] = true
				}
				matched = true
				break
			}
		}
		if matched {
			propGroups = append(propGroups, ae.codes)
		}
	}

	// Try single-word type aliases on unconsumed words.
	for i, w := range words {
		if consumed[i] {
			continue
		}
		if code, ok := itemTypeAliases[w]; ok {
			typeCode = code
			consumed[i] = true
		}
	}

	// Check for set name matches in unconsumed words.
	for name := range c.setNames {
		if strings.Contains(lower, strings.ToLower(name)) {
			setName = name
			// Mark words consumed by set name.
			setWords := strings.Fields(strings.ToLower(name))
			for i := 0; i <= len(words)-len(setWords); i++ {
				match := true
				for j, sw := range setWords {
					if words[i+j] != sw {
						match = false
						break
					}
				}
				if match {
					for j := range setWords {
						consumed[i+j] = true
					}
				}
			}
		}
	}

	// Remaining unconsumed words are name substring terms.
	for i, w := range words {
		if !consumed[i] {
			nameTerms = append(nameTerms, w)
		}
	}

	return
}

// matchesSearch checks if a searchable item matches all filters.
func (c *Calculator) matchesSearch(si *searchableItem, typeCode string, propGroups [][]string, nameTerms []string, setName string) bool {
	// Type filter: check if the item's base type matches or is a child of the filter type.
	if typeCode != "" {
		bi := c.baseItemByCode[si.code]
		if bi == nil {
			return false
		}
		typeCodes := c.allTypeCodes[bi.Type]
		if typeCodes == nil || !typeCodes[typeCode] {
			return false
		}
	}

	// Property filter: for each alias group, at least one code must match (OR within group, AND across groups).
	for _, group := range propGroups {
		found := false
		for _, code := range group {
			for _, stat := range si.stats {
				if stat.Property == code {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if !found {
			return false
		}
	}

	// Name filter: all terms must appear in the item name (case-insensitive).
	if len(nameTerms) > 0 {
		nameLower := strings.ToLower(si.name)
		for _, term := range nameTerms {
			if !strings.Contains(nameLower, term) {
				return false
			}
		}
	}

	// Set filter.
	if setName != "" {
		if !si.isSet || !strings.EqualFold(si.setName, setName) {
			return false
		}
	}

	return true
}
