// Command spritesheet packs individual Factorio icon PNGs into a single sprite sheet
// with a JSON manifest mapping icon names to {x, y, w, h, label} coordinates.
//
// Usage:
//
//	go run ./plugins/factorio/tools/spritesheet/
package main

import (
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const (
	iconSize = 64 // pixels per icon
	columns  = 32 // icons per row (32 * 64 = 2048px wide)
)

type spriteEntry struct {
	X     int    `json:"x"`
	Y     int    `json:"y"`
	W     int    `json:"w"`
	H     int    `json:"h"`
	Label string `json:"label"`
}

func main() {
	tasks := []struct {
		iconDir    string
		localeFile string
		outPNG     string
		outJSON    string
	}{
		{
			".reference/factorio-sprites/item",
			".reference/factorio-locale/item-locale.json",
			"plugins/factorio/sprites/items.png",
			"plugins/factorio/sprites/items.json",
		},
		{
			".reference/factorio-sprites/fluid",
			".reference/factorio-locale/fluid-locale.json",
			"plugins/factorio/sprites/fluids.png",
			"plugins/factorio/sprites/fluids.json",
		},
	}

	for _, t := range tasks {
		fmt.Printf("Processing %s...\n", t.iconDir)
		if err := buildSpriteSheet(t.iconDir, t.localeFile, t.outPNG, t.outJSON); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
	fmt.Println("Done.")
}

func buildSpriteSheet(iconDir, localeFile, outPNG, outJSON string) error {
	// Load locale names
	names, err := loadLocaleNames(localeFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not load locale %s: %v\n", localeFile, err)
		names = make(map[string]string)
	}

	// Find all PNG files
	entries, err := os.ReadDir(iconDir)
	if err != nil {
		return fmt.Errorf("read dir %s: %w", iconDir, err)
	}

	var iconNames []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".png") {
			name := strings.TrimSuffix(e.Name(), ".png")
			iconNames = append(iconNames, name)
		}
	}
	sort.Strings(iconNames)

	if len(iconNames) == 0 {
		return fmt.Errorf("no PNG files found in %s", iconDir)
	}

	// Calculate grid dimensions
	rows := (len(iconNames) + columns - 1) / columns
	width := columns * iconSize
	height := rows * iconSize

	fmt.Printf("  %d icons → %dx%d sprite sheet (%d×%d grid)\n", len(iconNames), width, height, columns, rows)

	// Create the sprite sheet image
	sheet := image.NewRGBA(image.Rect(0, 0, width, height))
	manifest := make(map[string]spriteEntry, len(iconNames))

	for i, name := range iconNames {
		col := i % columns
		row := i / columns
		x := col * iconSize
		y := row * iconSize

		// Load the individual icon
		iconPath := filepath.Join(iconDir, name+".png")
		icon, err := loadPNG(iconPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "  Warning: skipping %s: %v\n", name, err)
			continue
		}

		// Draw onto the sheet
		destRect := image.Rect(x, y, x+iconSize, y+iconSize)
		draw.Draw(sheet, destRect, icon, icon.Bounds().Min, draw.Over)

		// Add to manifest
		label := names[name]
		if label == "" {
			// Fallback: convert kebab-case to Title Case
			label = kebabToTitle(name)
		}
		manifest[name] = spriteEntry{X: x, Y: y, W: iconSize, H: iconSize, Label: label}
	}

	// Write sprite sheet PNG
	if err := writePNG(outPNG, sheet); err != nil {
		return fmt.Errorf("write sprite sheet: %w", err)
	}

	// Write manifest JSON
	if err := writeJSON(outJSON, manifest); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}

	fmt.Printf("  → %s (%d icons)\n", outPNG, len(manifest))
	fmt.Printf("  → %s\n", outJSON)
	return nil
}

func loadLocaleNames(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var locale map[string]map[string]string
	if err := json.Unmarshal(data, &locale); err != nil {
		return nil, err
	}

	return locale["names"], nil
}

func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}

func writePNG(path string, img image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	enc := &png.Encoder{CompressionLevel: png.BestCompression}
	return enc.Encode(f, img)
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func kebabToTitle(s string) string {
	words := strings.Split(s, "-")
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}
