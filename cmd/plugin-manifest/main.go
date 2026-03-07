// Command plugin-manifest generates manifest.json for a plugin from its plugin.toml.
//
// Usage:
//
//	plugin-manifest [--version <version>] <plugin-dir>  # writes <plugin-dir>/manifest.json
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
	"github.com/tetratelabs/wazero/sys"
)

//nolint:tagliatelle // manifest JSON uses snake_case to match plugin.toml field names
type pluginTOML struct {
	GameID         string   `toml:"game_id"         json:"game_id"`
	Source         string   `toml:"source"          json:"source"`
	Icon           string   `toml:"icon"            json:"icon"`
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
	AdapterTOML  adapterTOML   `toml:"adapter"       json:"-"`
}

type adapterTOML struct {
	AuthProvider string   `toml:"auth_provider"`
	AuthFlow     string   `toml:"auth_flow"`
	Scopes       []string `toml:"scopes"`
	Regions      []string `toml:"regions"`
}

type adapterManifest struct {
	AuthProvider string   `json:"auth_provider"`
	AuthFlow     string   `json:"auth_flow"`
	Scopes       []string `json:"scopes"`
	Regions      []string `json:"regions"`
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
	Parameters  map[string]any       `toml:"-"           json:"parameters,omitempty"`
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
	SHA256    string             `json:"sha256,omitempty"`
	URL       string             `json:"url,omitempty"`
	Reference *referenceManifest `json:"reference,omitempty"`
	Adapter   *adapterManifest   `json:"adapter,omitempty"`
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

	manifest := pluginManifest{
		pluginTOML: cfg,
	}

	// API plugins have no WASM — include adapter config instead.
	if cfg.Source == "api" {
		manifest.Adapter = &adapterManifest{
			AuthProvider: cfg.AdapterTOML.AuthProvider,
			AuthFlow:     cfg.AdapterTOML.AuthFlow,
			Scopes:       cfg.AdapterTOML.Scopes,
			Regions:      cfg.AdapterTOML.Regions,
		}
		return manifest, nil
	}

	// WASM plugin: hash parser.wasm and optionally include reference metadata.
	wasmPath := filepath.Join(pluginDir, "parser.wasm")
	hash, err := fileSHA256(wasmPath)
	if err != nil {
		return pluginManifest{}, fmt.Errorf("hash %s: %w", wasmPath, err)
	}

	manifest.SHA256 = hash
	manifest.URL = fmt.Sprintf("plugins/%s/parser.wasm", cfg.GameID)

	// If reference.wasm exists and plugin.toml declares reference modules, include reference metadata.
	refWasmPath := filepath.Join(pluginDir, "reference.wasm")
	if _, statErr := os.Stat(refWasmPath); statErr == nil && len(cfg.Reference.Modules) > 0 {
		ref, refErr := buildReferenceManifest(refWasmPath, cfg.GameID, cfg.Reference.Modules)
		if refErr != nil {
			return pluginManifest{}, refErr
		}
		manifest.Reference = ref
	}

	return manifest, nil
}

func buildReferenceManifest(wasmPath, gameID string, modules map[string]referenceModule) (*referenceManifest, error) {
	refHash, err := fileSHA256(wasmPath)
	if err != nil {
		return nil, fmt.Errorf("hash %s: %w", wasmPath, err)
	}

	// Execute the WASM to extract parameter schemas (single source of truth).
	schemas, schemaErr := extractReferenceSchema(wasmPath)
	if schemaErr != nil {
		fmt.Fprintf(os.Stderr, "warning: could not extract reference schema: %v\n", schemaErr)
	} else {
		for id, mod := range modules {
			if params, ok := schemas[id]; ok {
				mod.Parameters = params
				modules[id] = mod
			}
		}
	}

	return &referenceManifest{
		SHA256:  refHash,
		URL:     fmt.Sprintf("plugins/%s/reference.wasm", gameID),
		Modules: modules,
	}, nil
}

// extractReferenceSchema executes a reference WASM module with empty JSON input
// and extracts the parameter schemas from its self-describing response.
// Returns a map of module_id → parameters map.
func extractReferenceSchema(wasmPath string) (map[string]map[string]any, error) {
	wasmBytes, err := os.ReadFile(wasmPath)
	if err != nil {
		return nil, fmt.Errorf("read wasm: %w", err)
	}

	ctx := context.Background()
	rt := wazero.NewRuntime(ctx)
	defer rt.Close(ctx)

	if _, err := wasi_snapshot_preview1.Instantiate(ctx, rt); err != nil {
		return nil, fmt.Errorf("instantiate wasi: %w", err)
	}

	compiled, err := rt.CompileModule(ctx, wasmBytes)
	if err != nil {
		return nil, fmt.Errorf("compile wasm: %w", err)
	}

	var stdout bytes.Buffer
	config := wazero.NewModuleConfig().
		WithName("schema-extract").
		WithStdin(bytes.NewReader([]byte("{}"))).
		WithStdout(&stdout).
		WithStderr(io.Discard)

	_, instantiateErr := rt.InstantiateModule(ctx, compiled, config)
	if instantiateErr != nil {
		var exitErr *sys.ExitError
		if errors.As(instantiateErr, &exitErr) && exitErr.ExitCode() == 0 {
			instantiateErr = nil
		}
		if instantiateErr != nil {
			return nil, fmt.Errorf("execute wasm: %w", instantiateErr)
		}
	}

	// Parse ndjson output — expect a single {"type":"result","data":{...}} line.
	var line struct {
		Type string `json:"type"`
		Data struct {
			Modules []struct {
				ID         string         `json:"id"`
				Parameters map[string]any `json:"parameters"`
			} `json:"modules"`
		} `json:"data"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &line); err != nil {
		return nil, fmt.Errorf("parse schema output: %w", err)
	}
	if line.Type != "result" {
		return nil, fmt.Errorf("unexpected response type: %q", line.Type)
	}

	schemas := make(map[string]map[string]any, len(line.Data.Modules))
	for _, mod := range line.Data.Modules {
		if mod.ID != "" && mod.Parameters != nil {
			schemas[mod.ID] = mod.Parameters
		}
	}
	return schemas, nil
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
