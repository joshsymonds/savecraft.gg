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
}

// genResources walks the top-level init/resource/*.txt defs (skipping the role
// subdirs), derives each resource's roles from subdir membership, joins its
// text file, and writes reference/data/resources_gen.go. Returns the count.
func genResources(input, out string) (int, error) {
	resDir := filepath.Join(input, "init", "resource")
	entries, err := os.ReadDir(resDir)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", resDir, err)
	}

	// init/resource subdirs whose membership tags a resource with a role.
	roleDirs := []string{"edible", "drinkable", "growable", "minable", "supply", "work"}

	var resources []data.Resource
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".txt") {
			continue
		}
		id := strings.TrimSuffix(name, ".txt")

		initVal, perr := parseFile(filepath.Join(resDir, name))
		if perr != nil {
			return 0, fmt.Errorf("resource %s: %w", id, perr)
		}

		var roles []string
		for _, role := range roleDirs {
			if _, statErr := os.Stat(filepath.Join(resDir, role, name)); statErr == nil {
				roles = append(roles, role)
			}
		}

		var textVal *sosdata.Value
		textPath := filepath.Join(input, "text", "resource", name)
		if _, statErr := os.Stat(textPath); statErr == nil {
			textVal, perr = parseFile(textPath)
			if perr != nil {
				return 0, fmt.Errorf("resource text %s: %w", id, perr)
			}
		}
		resources = append(resources, decodeResource(initVal, textVal, id, roles))
	}

	src, err := generateResourcesSource(resources)
	if err != nil {
		return 0, err
	}
	if err = os.WriteFile(filepath.Join(out, "resources_gen.go"), src, 0o600); err != nil {
		return 0, fmt.Errorf("write resources_gen.go: %w", err)
	}
	return len(resources), nil
}

// genRooms walks init/room/*.txt, joins each with its sibling text/room file,
// and writes reference/data/rooms_gen.go. Returns the room count.
func genRooms(input, out string) (int, error) {
	initDir := filepath.Join(input, "init", "room")
	entries, err := os.ReadDir(initDir)
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", initDir, err)
	}

	var rooms []data.Room
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".txt") {
			continue
		}
		id := strings.TrimSuffix(name, ".txt")

		initVal, perr := parseFile(filepath.Join(initDir, name))
		if perr != nil {
			return 0, fmt.Errorf("room %s: %w", id, perr)
		}

		// The sibling text/room file (display name + description) is optional.
		var textVal *sosdata.Value
		textPath := filepath.Join(input, "text", "room", name)
		if _, statErr := os.Stat(textPath); statErr == nil {
			textVal, perr = parseFile(textPath)
			if perr != nil {
				return 0, fmt.Errorf("room text %s: %w", id, perr)
			}
		}
		rooms = append(rooms, decodeRoom(initVal, textVal, id))
	}

	src, err := generateRoomsSource(rooms)
	if err != nil {
		return 0, err
	}
	if err = os.WriteFile(filepath.Join(out, "rooms_gen.go"), src, 0o600); err != nil {
		return 0, fmt.Errorf("write rooms_gen.go: %w", err)
	}
	return len(rooms), nil
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
