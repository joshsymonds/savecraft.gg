// Command plugin-manifest generates manifest.json for a plugin from its plugin.toml.
//
// Usage:
//
//	plugin-manifest <plugin-dir>            # writes <plugin-dir>/manifest.json
//	plugin-manifest --aggregate <out-file>  # writes aggregate manifest for all plugins
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

//nolint:tagliatelle // manifest JSON uses snake_case to match plugin.toml field names
type pluginTOML struct {
	GameID         string   `toml:"game_id"         json:"game_id"`
	Name           string   `toml:"name"            json:"name"`
	Description    string   `toml:"description"     json:"description"`
	Version        string   `toml:"version"         json:"version"`
	Channel        string   `toml:"channel"         json:"channel"`
	Coverage       string   `toml:"coverage"        json:"coverage"`
	FileExtensions []string `toml:"file_extensions" json:"file_extensions"`
	Homepage       string   `toml:"homepage"        json:"homepage"`
	Limitations    []string `toml:"limitations"     json:"limitations"`

	Author       authorInfo   `toml:"author"        json:"author"`
	DefaultPaths defaultPaths `toml:"default_paths" json:"default_paths"`
}

type authorInfo struct {
	Name   string `toml:"name"   json:"name"`
	GitHub string `toml:"github" json:"github"`
}

type defaultPaths struct {
	Windows string `toml:"windows" json:"windows"`
	Linux   string `toml:"linux"   json:"linux"`
	Darwin  string `toml:"darwin"  json:"darwin"`
}

type pluginManifest struct {
	pluginTOML
	SHA256 string `json:"sha256"`
	URL    string `json:"url"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: plugin-manifest <plugin-dir>")
		fmt.Fprintln(os.Stderr, "       plugin-manifest --aggregate <out-file>")
		os.Exit(1)
	}

	if os.Args[1] == "--aggregate" {
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "usage: plugin-manifest --aggregate <out-file>")
			os.Exit(1)
		}
		if err := runAggregate(os.Args[2]); err != nil {
			fmt.Fprintf(os.Stderr, "error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	if err := runSingle(os.Args[1]); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func runSingle(pluginDir string) error {
	manifest, err := buildManifest(pluginDir)
	if err != nil {
		return err
	}

	outPath := filepath.Join(pluginDir, "manifest.json")
	return writeJSON(outPath, manifest)
}

func runAggregate(outFile string) error {
	matches, err := filepath.Glob("plugins/*/plugin.toml")
	if err != nil {
		return fmt.Errorf("glob plugins: %w", err)
	}

	aggregate := map[string]pluginManifest{}
	for _, tomlPath := range matches {
		pluginDir := filepath.Dir(tomlPath)
		manifest, err := buildManifest(pluginDir)
		if err != nil {
			return fmt.Errorf("plugin %s: %w", pluginDir, err)
		}
		aggregate[manifest.GameID] = manifest
	}

	return writeJSON(outFile, aggregate)
}

func buildManifest(pluginDir string) (pluginManifest, error) {
	tomlPath := filepath.Join(pluginDir, "plugin.toml")
	var cfg pluginTOML
	if _, err := toml.DecodeFile(tomlPath, &cfg); err != nil {
		return pluginManifest{}, fmt.Errorf("decode %s: %w", tomlPath, err)
	}

	// Find .wasm file — convention: <game_id>.wasm
	wasmPath := filepath.Join(pluginDir, cfg.GameID+".wasm")
	hash, err := fileSHA256(wasmPath)
	if err != nil {
		return pluginManifest{}, fmt.Errorf("hash %s: %w", wasmPath, err)
	}

	return pluginManifest{
		pluginTOML: cfg,
		SHA256:     hash,
		URL:        fmt.Sprintf("plugins/%s/parser.wasm", cfg.GameID),
	}, nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open: %w", err)
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("read: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	if !strings.HasSuffix(string(data), "\n") {
		data = append(data, '\n')
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}
