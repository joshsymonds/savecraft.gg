// Package genes implements the RimWorld gene metabolism and xenotype builder.
//
// Validates gene combinations against complexity and metabolism budgets,
// detects gene conflicts via exclusion tags, and tallies archite costs.
package genes

// GeneEntry represents a gene with its build-relevant properties.
type GeneEntry struct {
	DefName          string
	Label            string
	Complexity       int
	MetabolismOffset int
	ArchiteCost      int
	ExclusionTags    []string
	Category         string
}

// Conflict represents two genes that share an exclusion tag.
type Conflict struct {
	Gene1 string
	Gene2 string
	Tag   string
}

// BuildResult contains the validation outcome for a gene build.
type BuildResult struct {
	TotalComplexity  int
	TotalMetabolism  int
	TotalArchite     int
	ComplexityOK     bool
	MetabolismOK     bool
	Conflicts        []Conflict
}

// ValidateBuild checks whether a set of genes fits within the given
// complexity and metabolism budgets, and identifies any gene conflicts.
//
// maxComplexity is the gene assembler capacity (base 6 + 2 per processor, max 18).
// minMetabolism is the lower bound (negative values mean net cost, e.g., -3).
func ValidateBuild(genes []GeneEntry, maxComplexity int, minMetabolism int) BuildResult {
	var totalCpx, totalMet, totalArc int
	for _, g := range genes {
		totalCpx += g.Complexity
		totalMet += g.MetabolismOffset
		totalArc += g.ArchiteCost
	}

	// Detect conflicts: two genes sharing the same exclusion tag
	var conflicts []Conflict
	tagOwners := make(map[string]string) // tag → first gene defName
	for _, g := range genes {
		for _, tag := range g.ExclusionTags {
			if other, ok := tagOwners[tag]; ok {
				conflicts = append(conflicts, Conflict{
					Gene1: other,
					Gene2: g.DefName,
					Tag:   tag,
				})
			} else {
				tagOwners[tag] = g.DefName
			}
		}
	}

	return BuildResult{
		TotalComplexity: totalCpx,
		TotalMetabolism: totalMet,
		TotalArchite:    totalArc,
		ComplexityOK:    totalCpx <= maxComplexity,
		MetabolismOK:    totalMet >= minMetabolism,
		Conflicts:       conflicts,
	}
}
