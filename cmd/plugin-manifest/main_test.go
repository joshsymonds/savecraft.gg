package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildManifest_ParserOnly(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "echo"
name = "Echo"
description = "Test plugin"
channel = "stable"
coverage = "full"
file_extensions = [".txt"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "fake wasm bytes")

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.GameID != "echo" {
		t.Errorf("game_id = %q, want echo", m.GameID)
	}
	if m.URL != "plugins/echo/parser.wasm" {
		t.Errorf("url = %q, want plugins/echo/parser.wasm", m.URL)
	}
	if m.SHA256 == "" {
		t.Error("sha256 is empty")
	}
	if m.Reference != nil {
		t.Error("reference should be nil for parser-only plugin")
	}
}

func TestBuildManifest_WithReference(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "d2r"
name = "Diablo II: Resurrected"
description = "Test plugin with reference"
channel = "beta"
coverage = "partial"
file_extensions = [".d2s"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"

[reference.modules.drop_calc]
name = "Drop Calculator"
description = "Compute drop probabilities."

[reference.modules.drop_calc.attribution]
author = "Test Author"
data_sources = [
  { name = "TreasureClassEx.txt", origin = "Game data" },
]
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "fake parser wasm")
	writeFile(t, filepath.Join(dir, "reference.wasm"), "fake reference wasm")

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.Reference == nil {
		t.Fatal("reference is nil, want populated")
	}
	if m.Reference.SHA256 == "" {
		t.Error("reference sha256 is empty")
	}
	if m.Reference.URL != "plugins/d2r/reference.wasm" {
		t.Errorf("reference url = %q, want plugins/d2r/reference.wasm", m.Reference.URL)
	}
	if len(m.Reference.Modules) != 1 {
		t.Fatalf("reference modules = %d, want 1", len(m.Reference.Modules))
	}

	mod := m.Reference.Modules["drop_calc"]
	if mod.Name != "Drop Calculator" {
		t.Errorf("module name = %q, want Drop Calculator", mod.Name)
	}
	if mod.Description != "Compute drop probabilities." {
		t.Errorf("module description = %q", mod.Description)
	}
	if mod.Attribution.Author != "Test Author" {
		t.Errorf("attribution author = %q, want Test Author", mod.Attribution.Author)
	}
	if len(mod.Attribution.DataSources) != 1 {
		t.Fatalf("data_sources = %d, want 1", len(mod.Attribution.DataSources))
	}
	if mod.Attribution.DataSources[0].Name != "TreasureClassEx.txt" {
		t.Errorf("data_source name = %q", mod.Attribution.DataSources[0].Name)
	}
}

func TestBuildManifest_ReferenceTomlButNoWasm(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "d2r"
name = "Diablo II: Resurrected"
description = "Has reference toml but no wasm"
channel = "beta"
coverage = "partial"
file_extensions = [".d2s"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"

[reference.modules.drop_calc]
name = "Drop Calculator"
description = "Not built yet."
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "fake parser wasm")
	// No reference.wasm — should still succeed, just omit reference from manifest.

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.Reference != nil {
		t.Error("reference should be nil when reference.wasm doesn't exist")
	}
}

func TestBuildManifest_JSONShape(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "d2r"
name = "D2R"
description = "Test"
channel = "beta"
coverage = "partial"
file_extensions = [".d2s"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"

[reference.modules.drop_calc]
name = "Drop Calculator"
description = "Drops."
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "parser")
	writeFile(t, filepath.Join(dir, "reference.wasm"), "reference")

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Verify JSON can be deserialized back and reference field is present.
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	ref, ok := raw["reference"].(map[string]any)
	if !ok {
		t.Fatal("reference field missing from JSON output")
	}
	if _, ok := ref["sha256"]; !ok {
		t.Error("reference.sha256 missing from JSON")
	}
	if _, ok := ref["url"]; !ok {
		t.Error("reference.url missing from JSON")
	}
	if _, ok := ref["modules"]; !ok {
		t.Error("reference.modules missing from JSON")
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
