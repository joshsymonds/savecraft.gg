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
