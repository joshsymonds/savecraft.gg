package main

import (
	"strings"
)

// lookupNPC returns gift preference data for the given NPC name.
// Returns nil if the NPC is not found.
func lookupNPC(name string) map[string]any {
	prefs, ok := npcTastes[name]
	if !ok {
		// Try case-insensitive match
		for k, v := range npcTastes {
			if strings.EqualFold(k, name) {
				prefs = v
				ok = true
				name = k
				break
			}
		}
		if !ok {
			return nil
		}
	}

	result := map[string]any{
		"npc": name,
	}

	// Personal preferences (NPC-specific overrides)
	if items := resolveItems(prefs.Love.Items); len(items) > 0 {
		result["love"] = items
	}
	if items := resolveItems(prefs.Like.Items); len(items) > 0 {
		result["like"] = items
	}
	if items := resolveItems(prefs.Neutral.Items); len(items) > 0 {
		result["neutral"] = items
	}
	if items := resolveItems(prefs.Dislike.Items); len(items) > 0 {
		result["dislike"] = items
	}
	if items := resolveItems(prefs.Hate.Items); len(items) > 0 {
		result["hate"] = items
	}

	// Universal preferences (apply to all NPCs unless overridden)
	result["universalLove"] = resolveItems(universalTastes.Love.Items)
	result["universalLike"] = resolveItemsCompact(universalTastes.Like.Items)
	result["universalNeutral"] = resolveItemsCompact(universalTastes.Neutral.Items)
	result["universalDislike"] = resolveItemsCompact(universalTastes.Dislike.Items)
	result["universalHate"] = resolveItemsCompact(universalTastes.Hate.Items)

	return result
}

// lookupItem returns which NPCs love/like/dislike/hate the given item.
// Returns nil if the item is not found.
func lookupItem(name string) map[string]any {
	// Resolve item name to ID
	itemID := resolveItemName(name)
	if itemID == "" {
		return nil
	}

	itemCat := itemCategories[itemID]

	var npcResults []any

	for npcName, prefs := range npcTastes {
		taste := resolveItemTaste(itemID, itemCat, prefs)
		if taste != "" {
			npcResults = append(npcResults, map[string]any{
				"npc":    npcName,
				"taste":  taste,
				"source": "personal",
			})
		}
	}

	// Check universal taste for NPCs not in the personal results
	uTaste := resolveItemTasteFromPref(itemID, itemCat, universalTastes)

	// Add NPCs who get the universal taste (i.e., no personal override)
	personalNPCs := make(map[string]bool)
	for _, r := range npcResults {
		m := r.(map[string]any)
		personalNPCs[m["npc"].(string)] = true
	}

	for npcName := range npcTastes {
		if !personalNPCs[npcName] && uTaste != "" {
			npcResults = append(npcResults, map[string]any{
				"npc":    npcName,
				"taste":  uTaste,
				"source": "universal",
			})
		}
	}

	// Sort: love first, then like, neutral, dislike, hate
	sortByTaste(npcResults)

	resolvedName := itemNames[itemID]
	if resolvedName == "" {
		resolvedName = name
	}

	result := map[string]any{
		"item": resolvedName,
		"id":   itemID,
		"npcs": npcResults,
	}

	if uTaste != "" {
		result["universalTaste"] = uTaste
	}
	if itemCat != 0 {
		if cn := categoryName(itemCat); cn != "" {
			result["category"] = cn
		}
	}

	return result
}

// resolveItemTaste checks NPC-specific preferences for an item.
// Returns the taste level or "" if no personal preference.
func resolveItemTaste(itemID string, itemCat int, prefs npcGiftTaste) string {
	// Check in order: love, like, neutral, dislike, hate
	if matchesPref(itemID, itemCat, prefs.Love) {
		return "love"
	}
	if matchesPref(itemID, itemCat, prefs.Like) {
		return "like"
	}
	if matchesPref(itemID, itemCat, prefs.Neutral) {
		return "neutral"
	}
	if matchesPref(itemID, itemCat, prefs.Dislike) {
		return "dislike"
	}
	if matchesPref(itemID, itemCat, prefs.Hate) {
		return "hate"
	}
	return ""
}

// resolveItemTasteFromPref checks universal preferences.
func resolveItemTasteFromPref(itemID string, itemCat int, prefs npcGiftTaste) string {
	return resolveItemTaste(itemID, itemCat, prefs)
}

// matchesPref checks if an item matches a taste preference list.
func matchesPref(itemID string, itemCat int, pref tastePref) bool {
	for _, ref := range pref.Items {
		// Direct item ID match
		if ref == itemID {
			return true
		}
		// Category match (negative numbers)
		if len(ref) > 1 && ref[0] == '-' && itemCat != 0 {
			catStr := ref
			cat := parseCategoryID(catStr)
			if cat != 0 && cat == itemCat {
				return true
			}
		}
		// Context tag match (non-numeric strings)
		if !isNumericRef(ref) && matchesContextTag(itemID, itemCat, ref) {
			return true
		}
	}
	return false
}

// matchesContextTag checks if an item matches a context tag.
func matchesContextTag(itemID string, itemCat int, tag string) bool {
	switch tag {
	case "book_item":
		return itemCat == -102
	case "edible_mushroom":
		// Common edible mushrooms: Common Mushroom (404), Morel (257),
		// Chanterelle (281), Red Mushroom (420), Purple Mushroom (422), Magma Cap (851)
		return itemID == "404" || itemID == "257" || itemID == "281" ||
			itemID == "420" || itemID == "422" || itemID == "851"
	case "forage_item_beach":
		// Beach forage: Nautilus Shell (392), Coral (393), Sea Urchin (397),
		// Rainbow Shell (394), Cockle (718), Mussel (719), Oyster (723)
		return itemID == "392" || itemID == "393" || itemID == "397" ||
			itemID == "394" || itemID == "718" || itemID == "719" || itemID == "723"
	case "doll_item":
		return itemID == "103" || itemID == "126" // Ancient Doll, Strange Doll (green)
	case "toy_item":
		return itemID == "103" || itemID == "126"
	case "ancient_item":
		// Ancient artifacts
		return itemID == "103" || itemID == "104" || itemID == "109" ||
			itemID == "114" || itemID == "115" || itemID == "116" || itemID == "117"
	case "category_trinket":
		return itemCat == -101
	}
	return false
}

// resolveItemName finds the item ID from a display name.
func resolveItemName(name string) string {
	// First try exact match by name
	for id, n := range itemNames {
		if strings.EqualFold(n, name) {
			return id
		}
	}
	// Try partial match
	nameLower := strings.ToLower(name)
	for id, n := range itemNames {
		if strings.Contains(strings.ToLower(n), nameLower) {
			return id
		}
	}
	return ""
}

// resolveItems converts item/category IDs to human-readable entries.
func resolveItems(ids []string) []any {
	if len(ids) == 0 {
		return nil
	}
	var result []any
	for _, id := range ids {
		result = append(result, resolveRef(id))
	}
	return result
}

// resolveItemsCompact returns a compact representation for universal lists.
func resolveItemsCompact(ids []string) []any {
	return resolveItems(ids)
}

// resolveRef resolves a single item/category/tag reference.
func resolveRef(ref string) map[string]any {
	// Category reference
	if len(ref) > 1 && ref[0] == '-' {
		cat := parseCategoryID(ref)
		if cat != 0 {
			name := categoryName(cat)
			if name == "" {
				name = "Category " + ref
			}
			return map[string]any{
				"type":     "category",
				"id":       ref,
				"name":     "All " + name,
				"category": cat,
			}
		}
	}

	// Context tag
	if tagName, ok := contextTagNames[ref]; ok {
		return map[string]any{
			"type": "tag",
			"id":   ref,
			"name": tagName,
		}
	}

	// Item ID
	name := itemNames[ref]
	if name == "" {
		name = "Item " + ref
	}
	entry := map[string]any{
		"type": "item",
		"id":   ref,
		"name": name,
	}
	return entry
}

// categoryName returns the human-readable name for a category ID.
func categoryName(cat int) string {
	return categoryNames[cat]
}

// parseCategoryID parses a string like "-75" into an int.
func parseCategoryID(s string) int {
	n := 0
	neg := false
	i := 0
	if i < len(s) && s[i] == '-' {
		neg = true
		i++
	}
	for ; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0
		}
		n = n*10 + int(s[i]-'0')
	}
	if neg {
		return -n
	}
	return n
}

// isNumericRef checks if a reference is numeric (possibly with leading '-').
func isNumericRef(ref string) bool {
	if len(ref) == 0 {
		return false
	}
	start := 0
	if ref[0] == '-' {
		start = 1
	}
	if start >= len(ref) {
		return false
	}
	for i := start; i < len(ref); i++ {
		if ref[i] < '0' || ref[i] > '9' {
			return false
		}
	}
	return true
}

// sortByTaste sorts NPC results by taste priority: love > like > neutral > dislike > hate.
func sortByTaste(results []any) {
	priority := map[string]int{
		"love":    0,
		"like":    1,
		"neutral": 2,
		"dislike": 3,
		"hate":    4,
	}

	// Simple insertion sort (small N)
	for i := 1; i < len(results); i++ {
		j := i
		for j > 0 {
			a := results[j-1].(map[string]any)
			b := results[j].(map[string]any)
			pa := priority[a["taste"].(string)]
			pb := priority[b["taste"].(string)]
			if pa <= pb {
				break
			}
			results[j-1], results[j] = results[j], results[j-1]
			j--
		}
	}
}
