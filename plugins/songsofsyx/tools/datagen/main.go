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
