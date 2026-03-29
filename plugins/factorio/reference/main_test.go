package main

import (
	"bytes"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
)

func runReference(t *testing.T, input string) (map[string]any, int) {
	t.Helper()

	tmpBin := t.TempDir() + "/reference"
	build := exec.Command("go", "build", "-o", tmpBin, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, out)
	}

	cmd := exec.Command(tmpBin)
	cmd.Stdin = strings.NewReader(input)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &bytes.Buffer{}

	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			t.Fatalf("run failed: %v", err)
		}
	}

	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	lastLine := lines[len(lines)-1]

	var result map[string]any
	if err := json.Unmarshal([]byte(lastLine), &result); err != nil {
		t.Fatalf("parse output: %v\nraw: %s", err, stdout.String())
	}
	return result, exitCode
}

func TestEmptyQueryReturnsSchema(t *testing.T) {
	result, code := runReference(t, "{}")
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	if result["type"] != "result" {
		t.Fatalf("expected type=result, got %v", result["type"])
	}
	data := result["data"].(map[string]any)
	modules := data["modules"].(map[string]any)
	if _, ok := modules["recipe_lookup"]; !ok {
		t.Error("schema missing recipe_lookup module")
	}
}

func TestRecipeLookupByName(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","name":"electronic-circuit"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	recipe := data["recipe"].(map[string]any)

	if recipe["name"] != "electronic-circuit" {
		t.Errorf("name = %v, want electronic-circuit", recipe["name"])
	}
	if recipe["category"] != "electronics" {
		t.Errorf("category = %v, want electronics", recipe["category"])
	}
	if recipe["energy_required"] != 0.5 {
		t.Errorf("energy_required = %v, want 0.5", recipe["energy_required"])
	}

	ingredients := recipe["ingredients"].([]any)
	if len(ingredients) != 2 {
		t.Fatalf("expected 2 ingredients, got %d", len(ingredients))
	}

	// Should also return craftable_in machines
	craftableIn := data["craftable_in"].([]any)
	if len(craftableIn) == 0 {
		t.Error("expected at least one machine that can craft electronics")
	}
}

func TestRecipeLookupUsage(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","usage":"copper-cable"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	usedIn := data["used_in"].([]any)
	count := data["recipe_count"].(float64)

	if count < 1 {
		t.Error("copper-cable should be used in at least 1 recipe")
	}

	// electronic-circuit uses copper-cable
	found := false
	for _, r := range usedIn {
		recipe := r.(map[string]any)
		if recipe["name"] == "electronic-circuit" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected electronic-circuit in usage results for copper-cable")
	}
}

func TestRecipeLookupProduct(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","product":"plastic-bar"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	producedBy := data["produced_by"].([]any)
	count := data["recipe_count"].(float64)

	if count < 1 {
		t.Error("plastic-bar should be produced by at least 1 recipe")
	}
	if len(producedBy) < 1 {
		t.Error("expected at least one recipe producing plastic-bar")
	}
}

func TestRecipeLookupMachine(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","machine":"assembling-machine-3"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	machine := data["machine"].(map[string]any)

	if machine["crafting_speed"] != 1.25 {
		t.Errorf("crafting_speed = %v, want 1.25", machine["crafting_speed"])
	}
	if machine["module_slots"] != 4.0 {
		t.Errorf("module_slots = %v, want 4", machine["module_slots"])
	}
	if machine["energy_usage"] != "375kW" {
		t.Errorf("energy_usage = %v, want 375kW", machine["energy_usage"])
	}
}

func TestRecipeLookupTech(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","tech":"advanced-oil-processing"}`)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d", code)
	}
	data := result["data"].(map[string]any)
	tech := data["technology"].(map[string]any)

	if tech["name"] != "advanced-oil-processing" {
		t.Errorf("name = %v, want advanced-oil-processing", tech["name"])
	}

	prereqs := tech["prerequisites"].([]any)
	if len(prereqs) < 1 {
		t.Error("expected at least one prerequisite")
	}

	unlocked := tech["unlocked_recipes"].([]any)
	if len(unlocked) < 1 {
		t.Error("expected at least one unlocked recipe")
	}

	// Should unlock the advanced-oil-processing recipe
	found := false
	for _, r := range unlocked {
		recipe := r.(map[string]any)
		if recipe["name"] == "advanced-oil-processing" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected advanced-oil-processing recipe in unlocked recipes")
	}
}

func TestRecipeLookupNotFound(t *testing.T) {
	result, code := runReference(t, `{"module":"recipe_lookup","name":"nonexistent-recipe"}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for not found, got %d", code)
	}
	if result["type"] != "error" {
		t.Errorf("expected type=error, got %v", result["type"])
	}
}

func TestUnknownModule(t *testing.T) {
	_, code := runReference(t, `{"module":"nonexistent"}`)
	if code != 1 {
		t.Fatalf("expected exit 1 for unknown module, got %d", code)
	}
}
