package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// categoryListCap bounds a category listing — "structure" alone has ~150
// foundation/wall variants, so the list is compact and truncated.
const categoryListCap = 60

// buildingReference answers questions about a placeable building from the
// game's own data: its description, footprint, build cost, unlock tier, and
// key stats. Two modes: a fuzzy `building` lookup, or a `category` listing.
func buildingReference(query map[string]any) (map[string]any, error) {
	buildingQ := stringParam(query, "building")
	categoryQ := stringParam(query, "category")
	if buildingQ == "" && categoryQ == "" {
		return nil, fmt.Errorf("provide a building name/class or a category")
	}

	result := map[string]any{}
	if buildingQ != "" {
		result["buildings"] = lookupBuildingInfos(buildingQ)
	}
	if categoryQ != "" {
		result["category"] = listCategory(categoryQ)
	}
	return result, nil
}

func lookupBuildingInfos(q string) []map[string]any {
	var matches []scored[data.BuildingInfo]
	for _, b := range data.BuildingInfos {
		score := matchScore(q, b.ClassName, b.DisplayName)
		if score == 0 {
			continue
		}
		matches = append(matches, scored[data.BuildingInfo]{score, b.DisplayName, b})
	}
	ranked := rank(matches)
	out := make([]map[string]any, 0, len(ranked))
	for _, b := range ranked {
		out = append(out, describeBuildingInfo(b))
	}
	return out
}

func describeBuildingInfo(b data.BuildingInfo) map[string]any {
	out := map[string]any{
		"name":        b.DisplayName,
		"className":   b.ClassName,
		"category":    b.Category,
		"description": b.Description,
	}
	if b.Footprint != nil {
		dims := map[string]any{
			"widthM":  b.Footprint.WidthM,
			"depthM":  b.Footprint.DepthM,
			"heightM": b.Footprint.HeightM,
		}
		if b.Footprint.WidthFoundations > 0 && b.Footprint.DepthFoundations > 0 {
			dims["foundations"] = fmt.Sprintf("%dx%d", b.Footprint.WidthFoundations, b.Footprint.DepthFoundations)
		}
		out["dimensions"] = dims
	}
	if len(b.BuildCost) > 0 {
		cost := make([]map[string]any, 0, len(b.BuildCost))
		for _, ia := range b.BuildCost {
			cost = append(cost, amountFields(ia, 0))
		}
		out["buildCost"] = cost
	}
	if b.UnlockTier >= 0 {
		out["unlock"] = map[string]any{
			"schematic": b.UnlockSchematic,
			"tier":      b.UnlockTier,
		}
	}
	if len(b.Stats) > 0 {
		stats := make([]map[string]any, 0, len(b.Stats))
		for _, s := range b.Stats {
			stats = append(stats, map[string]any{"label": s.Label, "value": s.Value, "unit": s.Unit})
		}
		out["stats"] = stats
	}
	return out
}

func listCategory(category string) map[string]any {
	want := strings.ToLower(category)
	var infos []data.BuildingInfo
	for _, b := range data.BuildingInfos {
		if strings.ToLower(b.Category) == want {
			infos = append(infos, b)
		}
	}
	sort.Slice(infos, func(i, j int) bool { return infos[i].DisplayName < infos[j].DisplayName })

	count := len(infos)
	truncated := false
	if len(infos) > categoryListCap {
		infos = infos[:categoryListCap]
		truncated = true
	}
	buildings := make([]map[string]any, 0, len(infos))
	for _, b := range infos {
		entry := map[string]any{"name": b.DisplayName, "className": b.ClassName}
		if b.UnlockTier >= 0 {
			entry["unlockTier"] = b.UnlockTier
		}
		buildings = append(buildings, entry)
	}
	out := map[string]any{
		"name":      category,
		"count":     count,
		"buildings": buildings,
	}
	if truncated {
		out["truncated"] = true
	}
	return out
}
