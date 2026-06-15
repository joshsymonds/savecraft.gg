package main

import (
	"fmt"
	"math"
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/satisfactory/reference/data"
)

// Project Assembly (Space Elevator) phase requirements. These are NOT in the
// shipped Docs.json (no EST_GamePhase schematic type) and the save only stores
// the current/target phase, not its cost — so this table is curated. The part
// quantities below were extracted directly from the cooked game assets
// GP_Project_Assembly_Phase_N (Satisfactory 1.2, build 481836) and match the
// official wiki. Phase display names and unlocked tiers are from the wiki
// (https://satisfactory.wiki.gg/wiki/Space_Elevator). Part item classes follow
// Desc_SpaceElevatorPart_N_C (1=Smart Plating … 12=AI Expansion Server); the
// part display names and recipes resolve from the generated data tables.

type phasePart struct {
	itemClass string
	amount    int
}

type elevatorPhase struct {
	number        int
	name          string
	tiersUnlocked []int
	parts         []phasePart
}

var spaceElevatorPhases = []elevatorPhase{
	{
		number: 1, name: "Distribution Platform", tiersUnlocked: []int{3, 4},
		parts: []phasePart{
			{"Desc_SpaceElevatorPart_1_C", 50}, // Smart Plating
		},
	},
	{
		number: 2, name: "Construction Dock", tiersUnlocked: []int{5, 6},
		parts: []phasePart{
			{"Desc_SpaceElevatorPart_1_C", 1000}, // Smart Plating
			{"Desc_SpaceElevatorPart_2_C", 1000}, // Versatile Framework
			{"Desc_SpaceElevatorPart_3_C", 100},  // Automated Wiring
		},
	},
	{
		number: 3, name: "Main Body", tiersUnlocked: []int{7, 8},
		parts: []phasePart{
			{"Desc_SpaceElevatorPart_2_C", 2500}, // Versatile Framework
			{"Desc_SpaceElevatorPart_4_C", 500},  // Modular Engine
			{"Desc_SpaceElevatorPart_5_C", 100},  // Adaptive Control Unit
		},
	},
	{
		number: 4, name: "Propulsion", tiersUnlocked: []int{9},
		parts: []phasePart{
			{"Desc_SpaceElevatorPart_7_C", 500}, // Assembly Director System
			{"Desc_SpaceElevatorPart_6_C", 500}, // Magnetic Field Generator
			{"Desc_SpaceElevatorPart_8_C", 250}, // Thermal Propulsion Rocket
			{"Desc_SpaceElevatorPart_9_C", 100}, // Nuclear Pasta
		},
	},
	{
		number: 5, name: "Assembly", tiersUnlocked: nil,
		parts: []phasePart{
			{"Desc_SpaceElevatorPart_9_C", 1000},  // Nuclear Pasta
			{"Desc_SpaceElevatorPart_10_C", 1000}, // Biochemical Sculptor
			{"Desc_SpaceElevatorPart_12_C", 256},  // AI Expansion Server
			{"Desc_SpaceElevatorPart_11_C", 200},  // Ballistic Warp Drive
		},
	},
}

// spaceElevator answers Project Assembly questions: what each phase needs (with
// the recipe to make every part), which tiers it unlocks, and — with save data
// — where the player is and what remains. The session's Space Parts Cost
// Multiplier (1.2 Game Mode) is applied to the amounts when present.
func spaceElevator(query map[string]any) (map[string]any, error) {
	mult := spacePartsMultiplier(query)
	current, hasCurrent := currentPhase(query)

	result := map[string]any{}
	if mult != 1 {
		result["spacePartsCostMultiplier"] = mult
		result["note"] = "amounts below are scaled by this session's Space Parts Cost Multiplier"
	}

	if phaseQ, ok := numberParam(query, "phase"); ok {
		n := int(phaseQ)
		ep := findPhase(n)
		if ep == nil {
			return nil, fmt.Errorf("phase %d does not exist (phases are 1-5)", n)
		}
		result["phase"] = describePhase(*ep, mult)
		return result, nil
	}

	phases := make([]map[string]any, 0, len(spaceElevatorPhases))
	for _, ep := range spaceElevatorPhases {
		phases = append(phases, describePhase(ep, mult))
	}
	result["phases"] = phases

	if hasCurrent {
		result["progress"] = describeProgress(current, query, mult)
	} else {
		result["note"] = appendNote(result["note"],
			"no save data — pass save_id to see the player's current phase and what remains")
	}
	return result, nil
}

// describePhase renders one phase: its parts (with per-part recipe), the total
// (multiplier-scaled) amount needed, and the tiers it unlocks.
func describePhase(ep elevatorPhase, mult float64) map[string]any {
	parts := make([]map[string]any, 0, len(ep.parts))
	for _, p := range ep.parts {
		entry := map[string]any{
			"part":      itemName(p.itemClass),
			"className": p.itemClass,
			"amount":    scaleAmount(p.amount, mult),
		}
		if r := partRecipe(p.itemClass); r != nil {
			entry["madeBy"] = recipeSummary(*r)
		}
		parts = append(parts, entry)
	}
	out := map[string]any{
		"phase": ep.number,
		"name":  ep.name,
		"parts": parts,
	}
	if len(ep.tiersUnlocked) > 0 {
		out["tiersUnlocked"] = ep.tiersUnlocked
	} else {
		out["completes"] = "Project Assembly — launches the elevator and finishes the game"
	}
	return out
}

// describeProgress summarizes where the player is: the current phase and the
// requirements still ahead (the current phase plus every later one).
func describeProgress(current int, query map[string]any, mult float64) map[string]any {
	built := false
	if prog, ok := query["progression"].(map[string]any); ok {
		if b, ok := prog["spaceElevatorBuilt"].(bool); ok {
			built = b
		}
	}
	if overview, ok := query["game_overview"].(map[string]any); ok {
		if b, ok := overview["spaceElevatorBuilt"].(bool); ok {
			built = built || b
		}
	}

	remaining := make([]map[string]any, 0)
	cumulative := map[string]int{}
	for _, ep := range spaceElevatorPhases {
		if ep.number < current {
			continue
		}
		remaining = append(remaining, describePhase(ep, mult))
		for _, p := range ep.parts {
			cumulative[p.itemClass] += scaleAmount(p.amount, mult)
		}
	}

	out := map[string]any{
		"currentPhase":       current,
		"spaceElevatorBuilt": built,
		"remainingPhases":    remaining,
		"cumulativeParts":    cumulativeParts(cumulative),
		"note": "currentPhase is the phase the player is working on now; earlier phases " +
			"are already delivered. cumulativeParts sums the current and all later phases.",
	}
	return out
}

func cumulativeParts(cumulative map[string]int) []map[string]any {
	classes := make([]string, 0, len(cumulative))
	for c := range cumulative {
		classes = append(classes, c)
	}
	sort.Slice(classes, func(i, j int) bool { return cumulative[classes[i]] > cumulative[classes[j]] })
	out := make([]map[string]any, 0, len(classes))
	for _, c := range classes {
		out = append(out, map[string]any{
			"part": itemName(c), "className": c, "amount": cumulative[c],
		})
	}
	return out
}

// partRecipe returns the standard (non-alternate) recipe that produces a Space
// Elevator part, so the planner-style ingredient list travels with the phase.
func partRecipe(itemClass string) *data.Recipe {
	for _, r := range allRecipes {
		if r.Alternate {
			continue
		}
		for _, p := range r.Products {
			if p.ItemClass == itemClass {
				rr := r
				return &rr
			}
		}
	}
	return nil
}

func findPhase(n int) *elevatorPhase {
	for i := range spaceElevatorPhases {
		if spaceElevatorPhases[i].number == n {
			return &spaceElevatorPhases[i]
		}
	}
	return nil
}

// currentPhase reads the injected progression section's spaceElevatorPhase.
func currentPhase(query map[string]any) (int, bool) {
	prog, ok := query["progression"].(map[string]any)
	if !ok {
		return 0, false
	}
	switch v := prog["spaceElevatorPhase"].(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	}
	return 0, false
}

// spacePartsMultiplier reads the 1.2 Game Mode Space Parts Cost Multiplier from
// the injected game_overview; absent or non-positive means vanilla (1.0).
func spacePartsMultiplier(query map[string]any) float64 {
	overview, ok := query["game_overview"].(map[string]any)
	if !ok {
		return 1
	}
	gm, ok := overview["gameMode"].(map[string]any)
	if !ok {
		return 1
	}
	if v, ok := gm["spacePartsCostMultiplier"].(float64); ok && v > 0 {
		return v
	}
	return 1
}

// scaleAmount applies the Space Parts Cost Multiplier the way the game does:
// rounded half-up per part total.
func scaleAmount(amount int, mult float64) int {
	if mult == 1 {
		return amount
	}
	return int(math.Round(float64(amount) * mult))
}

func appendNote(existing any, add string) string {
	if s, ok := existing.(string); ok && s != "" {
		return s + "; " + add
	}
	return add
}
