// Package research implements the RimWorld research tree navigator.
//
// Computes prerequisite chains with total costs, applies tech level multipliers
// for tribal/medieval starts, and estimates research speed.
package research

// ResearchProject represents a research project from ResearchProjectDef.
type ResearchProject struct {
	DefName       string
	Label         string
	BaseCost      float64
	TechLevel     string
	Prerequisites []string
}

// techLevelOrder maps tech levels to numeric order for comparison.
var techLevelOrder = map[string]int{
	"Animal":     0,
	"Neolithic":  1,
	"Medieval":   2,
	"Industrial": 3,
	"Spacer":     4,
	"Ultra":      5,
	"Archotech":  6,
}

// TechLevelMultiplier returns the research cost multiplier when a colony
// at colonyTechLevel researches a project at projectTechLevel.
//
// From the game's CostFactor method on ResearchProjectDef:
//   - Only tribal (Neolithic) colonies get penalties
//   - Medieval projects: 1.5x for tribal
//   - Industrial+ projects: 2.0x for tribal
//   - Medieval and higher colony tech levels: no penalty
func TechLevelMultiplier(projectTechLevel, colonyTechLevel string) float64 {
	colOrder := techLevelOrder[colonyTechLevel]
	projOrder := techLevelOrder[projectTechLevel]

	// Only Neolithic (tribal) colonies get research penalties
	if colOrder > techLevelOrder["Neolithic"] {
		return 1.0
	}
	// Tribal colony researching above neolithic
	if projOrder <= colOrder {
		return 1.0
	}
	if projOrder == techLevelOrder["Medieval"] {
		return 1.5
	}
	if projOrder >= techLevelOrder["Industrial"] {
		return 2.0
	}
	return 1.0
}

// PrerequisiteChain returns the ordered list of research projects needed
// to unlock the target, including the target itself. Uses topological sort.
func PrerequisiteChain(projects map[string]ResearchProject, target string) []string {
	visited := make(map[string]bool)
	var chain []string

	var visit func(name string)
	visit = func(name string) {
		if visited[name] {
			return
		}
		visited[name] = true
		if p, ok := projects[name]; ok {
			for _, prereq := range p.Prerequisites {
				visit(prereq)
			}
		}
		chain = append(chain, name)
	}

	visit(target)
	return chain
}

// ChainCost computes the total research cost for a chain of projects,
// applying tech level multipliers based on the colony's starting tech level.
func ChainCost(projects map[string]ResearchProject, chain []string, colonyTechLevel string) float64 {
	var total float64
	for _, name := range chain {
		p, ok := projects[name]
		if !ok {
			continue
		}
		total += p.BaseCost * TechLevelMultiplier(p.TechLevel, colonyTechLevel)
	}
	return total
}

// ResearchSpeed returns the Intellectual skill-based speed factor for research.
// This is the skill component only -- the caller multiplies by the base rate
// (0.00825 per tick from ResearchManager.cs) and any bench/room/facility modifiers.
//
// Values from the ResearchSpeed StatDef's skillNeedFactors valuesPerLevel.
func ResearchSpeed(intellectualSkill int) float64 {
	// From ResearchSpeed StatDef, skillNeedFactors valuesPerLevel
	// Index 0 = skill level 0, index 20 = skill level 20
	values := [21]float64{
		0.10, 0.20, 0.30, 0.40, 0.50, // 0-4
		0.60, 0.70, 0.75, 0.80, 0.85, // 5-9
		0.90, 0.92, 0.94, 0.96, 0.98, // 10-14
		1.00, 1.02, 1.04, 1.06, 1.08, // 15-19
		1.10, // 20
	}
	if intellectualSkill < 0 {
		return values[0]
	}
	if intellectualSkill > 20 {
		return values[20]
	}
	return values[intellectualSkill]
}
