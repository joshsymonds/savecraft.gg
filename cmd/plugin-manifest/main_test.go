package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

// buildTestWASM compiles a minimal Go program to WASI WASM that outputs a
// known schema on empty JSON input. Returns the path to the compiled WASM.
func buildTestWASM(t *testing.T) string {
	t.Helper()

	if runtime.GOOS == "windows" {
		t.Skip("WASM cross-compilation test not supported on Windows")
	}

	dir := t.TempDir()
	src := filepath.Join(dir, "main.go")
	writeFile(t, src, `package main

import (
	"encoding/json"
	"os"
)

func main() {
	enc := json.NewEncoder(os.Stdout)
	_ = enc.Encode(map[string]any{
		"type": "result",
		"data": map[string]any{
			"modules": map[string]any{
				"test_mod": map[string]any{
					"name":        "Test Module",
					"description": "A test module",
					"parameters": map[string]any{
						"query": map[string]any{
							"type":        "string",
							"description": "Test query parameter",
						},
						"limit": map[string]any{
							"type":    "integer",
							"default": float64(10),
						},
					},
				},
			},
		},
	})
}
`)
	writeFile(t, filepath.Join(dir, "go.mod"), "module testschema\ngo 1.26\n")

	wasmPath := filepath.Join(dir, "reference.wasm")
	cmd := exec.Command("go", "build", "-o", wasmPath, ".")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GOOS=wasip1", "GOARCH=wasm")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("compile test WASM: %v\n%s", err, out)
	}
	return wasmPath
}

func TestExtractReferenceSchema(t *testing.T) {
	wasmPath := buildTestWASM(t)

	schemas, err := extractReferenceSchema(wasmPath)
	if err != nil {
		t.Fatalf("extractReferenceSchema: %v", err)
	}

	if len(schemas) != 1 {
		t.Fatalf("got %d modules, want 1", len(schemas))
	}

	mod, ok := schemas["test_mod"]
	if !ok {
		t.Fatalf("module 'test_mod' not found in schemas: %v", schemas)
	}

	query, ok := mod["query"].(map[string]any)
	if !ok {
		t.Fatal("parameter 'query' not found or wrong type")
	}
	if query["type"] != "string" {
		t.Errorf("query.type = %v, want string", query["type"])
	}
	if query["description"] != "Test query parameter" {
		t.Errorf("query.description = %v", query["description"])
	}

	limit, ok := mod["limit"].(map[string]any)
	if !ok {
		t.Fatal("parameter 'limit' not found or wrong type")
	}
	if limit["type"] != "integer" {
		t.Errorf("limit.type = %v, want integer", limit["type"])
	}
}

func TestBuildManifest_WithReferenceSchema(t *testing.T) {
	wasmPath := buildTestWASM(t)

	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "test"
name = "Test Game"
description = "Test with schema extraction"
channel = "beta"
coverage = "partial"
file_extensions = [".sav"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"

[reference.modules.test_mod]
name = "Test Module"
description = "A test module"
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "fake parser wasm")

	// Copy the real WASM binary into the plugin directory.
	wasmBytes, err := os.ReadFile(wasmPath)
	if err != nil {
		t.Fatalf("read test wasm: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "reference.wasm"), wasmBytes, 0o644); err != nil {
		t.Fatalf("write reference.wasm: %v", err)
	}

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.Reference == nil {
		t.Fatal("reference is nil")
	}

	mod := m.Reference.Modules["test_mod"]
	if mod.Parameters == nil {
		t.Fatal("module parameters is nil — schema extraction didn't work")
	}

	query, ok := mod.Parameters["query"].(map[string]any)
	if !ok {
		t.Fatal("parameter 'query' not in manifest")
	}
	if query["type"] != "string" {
		t.Errorf("query.type = %v, want string", query["type"])
	}

	// Verify JSON serialization includes parameters.
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	ref, ok := raw["reference"].(map[string]any)
	if !ok {
		t.Fatal("reference field missing or wrong type in JSON")
	}
	modules, ok := ref["modules"].(map[string]any)
	if !ok {
		t.Fatal("modules field missing or wrong type in JSON")
	}
	testMod, ok := modules["test_mod"].(map[string]any)
	if !ok {
		t.Fatal("test_mod missing or wrong type in JSON")
	}
	params, ok := testMod["parameters"].(map[string]any)
	if !ok {
		t.Fatal("parameters not present in JSON output")
	}
	if _, ok := params["query"]; !ok {
		t.Error("query parameter missing from JSON")
	}
}

func TestExtractReferenceSchema_InvalidWASM(t *testing.T) {
	dir := t.TempDir()
	badWasm := filepath.Join(dir, "bad.wasm")
	writeFile(t, badWasm, "not a valid wasm binary")

	schemas, err := extractReferenceSchema(badWasm)
	if err == nil {
		t.Fatal("expected error for invalid WASM, got nil")
	}
	if schemas != nil {
		t.Error("expected nil schemas for invalid WASM")
	}
}

func TestBuildManifest_ModPluginWithReference(t *testing.T) {
	wasmPath := buildTestWASM(t)

	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "rimworld"
source = "mod"
name = "RimWorld"
description = "Mod plugin with reference modules"
channel = "alpha"
coverage = "full"
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]

[reference.modules.test_mod]
name = "Test Module"
description = "A test module"
`)
	// No parser.wasm — mod plugins have no parser.
	// But reference.wasm exists with schema.
	wasmBytes, err := os.ReadFile(wasmPath)
	if err != nil {
		t.Fatalf("read test wasm: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "reference.wasm"), wasmBytes, 0o644); err != nil {
		t.Fatalf("write reference.wasm: %v", err)
	}

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	// Mod plugin should have no parser WASM fields.
	if m.SHA256 != "" {
		t.Errorf("sha256 should be empty for mod plugin, got %q", m.SHA256)
	}
	if m.URL != "" {
		t.Errorf("url should be empty for mod plugin, got %q", m.URL)
	}

	// But reference modules MUST be present.
	if m.Reference == nil {
		t.Fatal("reference is nil — mod plugin with reference.wasm should include reference modules")
	}
	if m.Reference.SHA256 == "" {
		t.Error("reference sha256 is empty")
	}
	if m.Reference.URL != "plugins/rimworld/reference.wasm" {
		t.Errorf("reference url = %q, want plugins/rimworld/reference.wasm", m.Reference.URL)
	}
	if len(m.Reference.Modules) != 1 {
		t.Fatalf("reference modules = %d, want 1", len(m.Reference.Modules))
	}

	mod := m.Reference.Modules["test_mod"]
	if mod.Name != "Test Module" {
		t.Errorf("module name = %q, want Test Module", mod.Name)
	}
	if mod.Parameters == nil {
		t.Fatal("module parameters is nil — schema extraction didn't work for mod plugin")
	}

	query, ok := mod.Parameters["query"].(map[string]any)
	if !ok {
		t.Fatal("parameter 'query' not in manifest")
	}
	if query["type"] != "string" {
		t.Errorf("query.type = %v, want string", query["type"])
	}
}

func TestBuildManifest_ModPluginWithoutReference(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "rimworld"
source = "mod"
name = "RimWorld"
description = "Mod plugin without reference modules"
channel = "alpha"
coverage = "full"
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
`)
	// No parser.wasm, no reference.wasm — pure metadata.

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.SHA256 != "" {
		t.Errorf("sha256 should be empty for mod plugin, got %q", m.SHA256)
	}
	if m.Reference != nil {
		t.Error("reference should be nil for mod plugin without reference.wasm")
	}
}

func TestBuildManifest_APIPlugin(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "wow"
source = "api"
name = "World of Warcraft"
description = "Character profiles via Battle.net API"
channel = "beta"
coverage = "partial"
file_extensions = []
homepage = "https://savecraft.gg/plugins/wow"

[author]
name = "Test"
github = "test"

[default_paths]

[adapter]
auth_provider = "battlenet"
auth_flow = "oauth2_code"
scopes = ["wow.profile", "openid"]
regions = ["us", "eu", "kr", "tw"]
`)
	// No parser.wasm — API plugins have no WASM.

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.GameID != "wow" {
		t.Errorf("game_id = %q, want wow", m.GameID)
	}
	if m.Source != "api" {
		t.Errorf("source = %q, want api", m.Source)
	}
	// API plugins should have no WASM-related fields.
	if m.SHA256 != "" {
		t.Errorf("sha256 should be empty for API plugin, got %q", m.SHA256)
	}
	if m.URL != "" {
		t.Errorf("url should be empty for API plugin, got %q", m.URL)
	}
	if m.Reference != nil {
		t.Error("reference should be nil for API plugin")
	}
	// Adapter config should be populated.
	if m.Adapter == nil {
		t.Fatal("adapter is nil, want populated")
	}
	if m.Adapter.AuthProvider != "battlenet" {
		t.Errorf("adapter.auth_provider = %q, want battlenet", m.Adapter.AuthProvider)
	}
	if m.Adapter.AuthFlow != "oauth2_code" {
		t.Errorf("adapter.auth_flow = %q, want oauth2_code", m.Adapter.AuthFlow)
	}
	if len(m.Adapter.Scopes) != 2 {
		t.Fatalf("adapter.scopes = %d, want 2", len(m.Adapter.Scopes))
	}
	if len(m.Adapter.Regions) != 4 {
		t.Fatalf("adapter.regions = %d, want 4", len(m.Adapter.Regions))
	}

	// Verify JSON shape: no sha256/url at top level, adapter field present.
	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := raw["sha256"]; ok {
		t.Error("sha256 should be omitted from JSON for API plugin")
	}
	if _, ok := raw["url"]; ok {
		t.Error("url should be omitted from JSON for API plugin")
	}
	adapter, ok := raw["adapter"].(map[string]any)
	if !ok {
		t.Fatal("adapter field missing from JSON output")
	}
	if _, ok := adapter["authProvider"]; !ok {
		t.Error("adapter.authProvider missing from JSON")
	}
}

func TestBuildManifest_IconField(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "plugin.toml"), `
game_id = "d2r"
name = "Diablo II: Resurrected"
description = "Test plugin with icon"
channel = "beta"
coverage = "partial"
icon = "icon.png"
file_extensions = [".d2s"]
homepage = "https://example.com"
[author]
name = "Test"
github = "test"
[default_paths]
windows = "C:/test"
linux = "/test"
darwin = "/test"
`)
	writeFile(t, filepath.Join(dir, "parser.wasm"), "fake parser wasm")

	m, err := buildManifest(dir)
	if err != nil {
		t.Fatalf("buildManifest: %v", err)
	}

	if m.Icon != "icon.png" {
		t.Errorf("icon = %q, want icon.png", m.Icon)
	}

	// Verify icon appears in JSON output.
	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if raw["icon"] != "icon.png" {
		t.Errorf("JSON icon = %v, want icon.png", raw["icon"])
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
