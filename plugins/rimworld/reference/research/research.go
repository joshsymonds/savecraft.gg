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
//   - Medieval projects: 1.5× for tribal
//   - Industrial+ projects: 2.0× for tribal
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

// ResearchSpeed returns a relative research speed factor for a given
// Intellectual skill level. This is a simplified estimate — the actual
// speed depends on bench type, room conditions, and facilities.
//
// Base research per tick: 0.00825 (from ResearchManager.cs)
// Skill factor uses the Research Speed stat curve from XML.
func ResearchSpeed(intellectualSkill int) float64 {
	// Simplified: skill-based factor from ResearchSpeed stat
	// valuesPerLevel for Research Speed (similar pattern to other skill stats)
	if intellectualSkill < 0 {
		intellectualSkill = 0
	}
	if intellectualSkill > 20 {
		intellectualSkill = 20
	}
	// Approximate: base speed scales roughly linearly with skill
	return 0.00825 * (0.5 + float64(intellectualSkill)*0.05)
}
