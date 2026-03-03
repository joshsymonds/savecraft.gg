// Command plugin-manifest generates manifest.json for a plugin from its plugin.toml.
//
// Usage:
//
//	plugin-manifest [--version <version>] <plugin-dir>  # writes <plugin-dir>/manifest.json
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
	Channel        string   `toml:"channel"         json:"channel"`
	Coverage       string   `toml:"coverage"        json:"coverage"`
	FileExtensions []string `toml:"file_extensions" json:"file_extensions"`
	Homepage       string   `toml:"homepage"        json:"homepage"`
	Limitations    []string `toml:"limitations"     json:"limitations"`

	Author       authorInfo    `toml:"author"        json:"author"`
	DefaultPaths defaultPaths  `toml:"default_paths" json:"default_paths"`
	Reference    referenceTOML `toml:"reference"     json:"-"`
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

type referenceModule struct {
	Name        string               `toml:"name"        json:"name"`
	Description string               `toml:"description" json:"description"`
	Attribution referenceAttribution `toml:"attribution" json:"attribution,omitempty"`
}

type referenceAttribution struct {
	Author      string            `toml:"author"       json:"author,omitempty"`
	DataSources []referenceSource `toml:"data_sources" json:"dataSources,omitempty"`
}

type referenceSource struct {
	Name   string `toml:"name"   json:"name"`
	Origin string `toml:"origin" json:"origin"`
}

type referenceTOML struct {
	Modules map[string]referenceModule `toml:"modules" json:"-"`
}

type referenceManifest struct {
	SHA256  string                     `json:"sha256"`
	URL     string                     `json:"url"`
	Modules map[string]referenceModule `json:"modules"`
}

type pluginManifest struct {
	pluginTOML
	Version   string             `json:"version"`
	SHA256    string             `json:"sha256"`
	URL       string             `json:"url"`
	Reference *referenceManifest `json:"reference,omitempty"`
}

func main() {
	args := os.Args[1:]

	// Parse --version flag (must appear before positional args).
	var versionOverride string
	for i, arg := range args {
		if arg == "--version" && i+1 < len(args) {
			versionOverride = args[i+1]
			args = append(args[:i], args[i+2:]...)
			break
		}
	}

	if len(args) < 1 {
		fmt.Fprintln(os.Stderr, "usage: plugin-manifest [--version <version>] <plugin-dir>")
		os.Exit(1)
	}

	if err := runSingle(args[0], versionOverride); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func runSingle(pluginDir string, versionOverride string) error {
	manifest, err := buildManifest(pluginDir)
	if err != nil {
		return err
	}

	if versionOverride != "" {
		manifest.Version = versionOverride
	}

	outPath := filepath.Join(pluginDir, "manifest.json")
	return writeJSON(outPath, manifest)
}

func buildManifest(pluginDir string) (pluginManifest, error) {
	tomlPath := filepath.Join(pluginDir, "plugin.toml")
	var cfg pluginTOML
	if _, err := toml.DecodeFile(tomlPath, &cfg); err != nil {
		return pluginManifest{}, fmt.Errorf("decode %s: %w", tomlPath, err)
	}

	// Find parser .wasm file — convention: parser.wasm in plugin directory.
	wasmPath := filepath.Join(pluginDir, "parser.wasm")
	hash, err := fileSHA256(wasmPath)
	if err != nil {
		return pluginManifest{}, fmt.Errorf("hash %s: %w", wasmPath, err)
	}

	manifest := pluginManifest{
		pluginTOML: cfg,
		SHA256:     hash,
		URL:        fmt.Sprintf("plugins/%s/parser.wasm", cfg.GameID),
	}

	// If reference.wasm exists and plugin.toml declares reference modules, include reference metadata.
	refWasmPath := filepath.Join(pluginDir, "reference.wasm")
	if _, statErr := os.Stat(refWasmPath); statErr == nil && len(cfg.Reference.Modules) > 0 {
		refHash, hashErr := fileSHA256(refWasmPath)
		if hashErr != nil {
			return pluginManifest{}, fmt.Errorf("hash %s: %w", refWasmPath, hashErr)
		}
		manifest.Reference = &referenceManifest{
			SHA256:  refHash,
			URL:     fmt.Sprintf("plugins/%s/reference.wasm", cfg.GameID),
			Modules: cfg.Reference.Modules,
		}
	}

	return manifest, nil
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
