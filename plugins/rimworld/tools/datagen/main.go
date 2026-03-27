// Command datagen reads RimWorld XML Def files and generates Go source files
// for the reference module's data package.
//
// The input XML files are extracted from RimWorld's Data/ directory
// (Core + DLC expansions). To regenerate:
//
//	go run ./plugins/rimworld/tools/datagen
//
// Usage:
//
//	go run ./plugins/rimworld/tools/datagen -input .reference/RimWorldDefs -output plugins/rimworld/reference/data
package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	inputDir := ".reference/RimWorldDefs"
	outputDir := "plugins/rimworld/reference/data"

	for i := 1; i < len(os.Args); i++ {
		switch os.Args[i] {
		case "-input":
			i++
			inputDir = os.Args[i]
		case "-output":
			i++
			outputDir = os.Args[i]
		}
	}

	// Load all XML Defs across Core + DLC directories
	r := NewResolver()
	sources := []string{"Core", "Royalty", "Ideology", "Biotech", "Anomaly", "Odyssey"}
	for _, src := range sources {
		dir := filepath.Join(inputDir, src)
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			fmt.Printf("Skipping %s (not found)\n", src)
			continue
		}
		fmt.Printf("Loading %s...\n", src)
		if err := r.LoadDir(dir); err != nil {
			fmt.Fprintf(os.Stderr, "Error loading %s: %v\n", src, err)
			os.Exit(1)
		}
	}

	generators := []struct {
		name string
		fn   func(*Resolver, string) error
	}{
		{"medical", genMedical},
		{"crops", genCrops},
		{"combat", genCombat},
		{"materials", genMaterials},
		{"drugs", genDrugs},
		{"genes", genGenes},
		{"research", genResearch},
	}

	for _, g := range generators {
		fmt.Printf("Generating %s...\n", g.name)
		if err := g.fn(r, outputDir); err != nil {
			fmt.Fprintf(os.Stderr, "Error generating %s: %v\n", g.name, err)
			os.Exit(1)
		}
	}
	fmt.Println("Done.")
}
