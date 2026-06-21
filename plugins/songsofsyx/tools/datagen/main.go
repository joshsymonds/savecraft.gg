// Command datagen generates Go reference tables for the Songs of Syx plugin
// from the game-shipped data files (data.zip → data/assets/**).
//
// Usage:
//
//	go run ./plugins/songsofsyx/tools/datagen [-input <data/assets dir>] [-out <dir>]
//
// Acquire the input from a game install (kept gitignored under .reference/):
//
//	ssh gnomon 'unzip "…/Songs of Syx/base/data.zip" "data/assets/*"' && rsync …
//
// Only generated *_gen.go tables are committed; raw game data stays in
// .reference/ and is never checked in.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

func main() {
	input := flag.String("input", ".reference/songsofsyx/data/assets", "game data/assets directory")
	out := flag.String("out", "plugins/songsofsyx/reference/data", "output directory for generated tables")
	flag.Parse()

	n, err := genGuide(*input, *out)
	if err != nil {
		log.Fatalf("datagen: guide: %v", err)
	}
	fmt.Fprintf(os.Stdout, "datagen: guide — wrote %d articles to %s/guide_gen.go\n", n, *out)

	nr, err := genRooms(*input, *out)
	if err != nil {
		log.Fatalf("datagen: rooms: %v", err)
	}
	fmt.Fprintf(os.Stdout, "datagen: rooms — wrote %d rooms to %s/rooms_gen.go\n", nr, *out)

	nres, err := genResources(*input, *out)
	if err != nil {
		log.Fatalf("datagen: resources: %v", err)
	}
	fmt.Fprintf(os.Stdout, "datagen: resources — wrote %d resources to %s/resources_gen.go\n", nres, *out)

	nrace, err := genRaces(*input, *out)
	if err != nil {
		log.Fatalf("datagen: races: %v", err)
	}
	fmt.Fprintf(os.Stdout, "datagen: races — wrote %d races to %s/races_gen.go\n", nrace, *out)

	ntech, err := genTech(*input, *out)
	if err != nil {
		log.Fatalf("datagen: tech: %v", err)
	}
	fmt.Fprintf(os.Stdout, "datagen: tech — wrote %d techs to %s/techs_gen.go\n", ntech, *out)
}

// genTech walks init/tech/<CAT>.txt (each a category of many TECHS nodes),
// joins the per-tech and category names from text/tech/<CAT>.txt, and writes
// reference/data/techs_gen.go. Returns the node count.
func genTech(input, out string) (int, error) {
	techDir := filepath.Join(input, "init", "tech")
	entries, err := os.ReadDir(techDir)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", techDir, err)
	}

	var techs []data.Tech
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".txt") {
			continue
		}
		category := strings.TrimSuffix(name, ".txt")

		initVal, perr := parseFile(filepath.Join(techDir, name))
		if perr != nil {
			return 0, fmt.Errorf("tech %s: %w", category, perr)
		}

		var textVal *sosdata.Value
		textPath := filepath.Join(input, "text", "tech", name)
		if _, statErr := os.Stat(textPath); statErr == nil {
			if textVal, perr = parseFile(textPath); perr != nil {
				return 0, fmt.Errorf("tech text %s: %w", category, perr)
			}
		}
		techs = append(techs, techsFromFile(initVal, textVal, category)...)
	}
	return emitGen(out, "techs_gen.go", techs, generateTechSource)
}

// techsFromFile extracts every TECHS node from one category file (joined with
// its optional text file). The category display name comes from the text NAME;
// each tech ID is namespaced by the file stem, since keys (e.g. COAL01) repeat
// across categories.
func techsFromFile(initVal, textVal *sosdata.Value, category string) []data.Tech {
	categoryName := category
	var textTechs *sosdata.Value
	if textVal != nil {
		if n := scalar(textVal, "NAME"); n != "" {
			categoryName = n
		}
		textTechs, _ = textVal.Get("TECHS")
	}

	nodes, ok := initVal.Get("TECHS")
	if !ok {
		return nil
	}
	out := make([]data.Tech, 0, nodes.Len())
	for _, node := range nodes.Members {
		var textNode *sosdata.Value
		if textTechs != nil {
			textNode, _ = textTechs.Get(node.Key)
		}
		out = append(out, decodeTech(node.Value, textNode, category+"/"+node.Key, categoryName))
	}
	return out
}

// walkCategory iterates the .txt definitions in initDir, parsing each and its
// optional sibling under textDir, and calls visit(id, initVal, textVal). The
// shared join used by every per-category generator.
func walkCategory(initDir, textDir string, visit func(id string, initVal, textVal *sosdata.Value) error) error {
	entries, err := os.ReadDir(initDir)
	if err != nil {
		return fmt.Errorf("read %s: %w", initDir, err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".txt") {
			continue
		}
		id := strings.TrimSuffix(name, ".txt")

		initVal, perr := parseFile(filepath.Join(initDir, name))
		if perr != nil {
			return fmt.Errorf("%s: %w", id, perr)
		}

		var textVal *sosdata.Value
		textPath := filepath.Join(textDir, name)
		if _, statErr := os.Stat(textPath); statErr == nil {
			if textVal, perr = parseFile(textPath); perr != nil {
				return fmt.Errorf("%s text: %w", id, perr)
			}
		}
		if verr := visit(id, initVal, textVal); verr != nil {
			return verr
		}
	}
	return nil
}

// emitGen renders items via gen and writes them to out/file, returning the
// item count.
func emitGen[T any](out, file string, items []T, gen func([]T) ([]byte, error)) (int, error) {
	src, err := gen(items)
	if err != nil {
		return 0, err
	}
	if err = os.WriteFile(filepath.Join(out, file), src, 0o600); err != nil {
		return 0, fmt.Errorf("write %s: %w", file, err)
	}
	return len(items), nil
}

// genRaces writes reference/data/races_gen.go from init/race + text/race.
func genRaces(input, out string) (int, error) {
	var races []data.Race
	err := walkCategory(filepath.Join(input, "init", "race"), filepath.Join(input, "text", "race"),
		func(id string, initVal, textVal *sosdata.Value) error {
			races = append(races, decodeRace(initVal, textVal, id))
			return nil
		})
	if err != nil {
		return 0, err
	}
	return emitGen(out, "races_gen.go", races, generateRacesSource)
}

// genResources writes reference/data/resources_gen.go from the top-level
// init/resource defs + text/resource, deriving each resource's roles from
// init/resource/<role>/ subdir membership.
func genResources(input, out string) (int, error) {
	resDir := filepath.Join(input, "init", "resource")
	roleDirs := []string{"edible", "drinkable", "growable", "minable", "supply", "work"}

	var resources []data.Resource
	err := walkCategory(resDir, filepath.Join(input, "text", "resource"),
		func(id string, initVal, textVal *sosdata.Value) error {
			var roles []string
			for _, role := range roleDirs {
				if _, statErr := os.Stat(filepath.Join(resDir, role, id+".txt")); statErr == nil {
					roles = append(roles, role)
				}
			}
			resources = append(resources, decodeResource(initVal, textVal, id, roles))
			return nil
		})
	if err != nil {
		return 0, err
	}
	return emitGen(out, "resources_gen.go", resources, generateResourcesSource)
}

// genRooms writes reference/data/rooms_gen.go from init/room + text/room.
func genRooms(input, out string) (int, error) {
	var rooms []data.Room
	err := walkCategory(filepath.Join(input, "init", "room"), filepath.Join(input, "text", "room"),
		func(id string, initVal, textVal *sosdata.Value) error {
			rooms = append(rooms, decodeRoom(initVal, textVal, id))
			return nil
		})
	if err != nil {
		return 0, err
	}
	return emitGen(out, "rooms_gen.go", rooms, generateRoomsSource)
}

// parseFile reads and parses a data file into an AST.
func parseFile(path string) (*sosdata.Value, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	val, err := sosdata.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return val, nil
}

// genGuide reads GUIDE.txt and ROOMS.txt, decodes their articles, and writes
// reference/data/guide_gen.go. Returns the article count.
func genGuide(input, out string) (int, error) {
	var all []data.GuideArticle
	for _, name := range []string{"text/wiki/GUIDE.txt", "text/wiki/ROOMS.txt"} {
		path := filepath.Join(input, name)
		raw, err := os.ReadFile(path)
		if err != nil {
			return 0, fmt.Errorf("read %s: %w", path, err)
		}
		root, err := sosdata.Parse(raw)
		if err != nil {
			return 0, fmt.Errorf("parse %s: %w", path, err)
		}
		arts, err := decodeGuideArticles(root)
		if err != nil {
			return 0, fmt.Errorf("decode %s: %w", path, err)
		}
		all = append(all, arts...)
	}

	src, err := generateGuideSource(all)
	if err != nil {
		return 0, err
	}
	if err = os.MkdirAll(out, 0o750); err != nil {
		return 0, fmt.Errorf("mkdir %s: %w", out, err)
	}
	dst := filepath.Join(out, "guide_gen.go")
	if err = os.WriteFile(dst, src, 0o600); err != nil {
		return 0, fmt.Errorf("write %s: %w", dst, err)
	}
	return len(all), nil
}
