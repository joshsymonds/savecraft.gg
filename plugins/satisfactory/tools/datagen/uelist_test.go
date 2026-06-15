package main

import (
	"reflect"
	"testing"
)

func TestParseItemAmounts(t *testing.T) {
	in := `((ItemClass="/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/Parts/IronIngot/Desc_IronIngot.Desc_IronIngot_C'",Amount=3),` +
		`(ItemClass="/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Resource/RawResources/Coal/Desc_Coal.Desc_Coal_C'",Amount=2000))`
	got := parseItemAmounts(in)
	want := []pair{{"Desc_IronIngot_C", 3}, {"Desc_Coal_C", 2000}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseItemAmounts = %v, want %v", got, want)
	}
}

func TestParseItemAmountsEmpty(t *testing.T) {
	for _, in := range []string{"", "()"} {
		if got := parseItemAmounts(in); len(got) != 0 {
			t.Errorf("parseItemAmounts(%q) = %v, want empty", in, got)
		}
	}
}

func TestParseClassList(t *testing.T) {
	in := `("/Game/FactoryGame/Buildable/Factory/ConstructorMk1/Build_ConstructorMk1.Build_ConstructorMk1_C",` +
		`"/Game/FactoryGame/Buildable/-Shared/WorkBench/BP_WorkBenchComponent.BP_WorkBenchComponent_C")`
	got := parseClassList(in)
	want := []string{"Build_ConstructorMk1_C", "BP_WorkBenchComponent_C"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseClassList = %v, want %v", got, want)
	}
}

func TestParseClassListWithBlueprintWrapper(t *testing.T) {
	in := `("/Script/Engine.BlueprintGeneratedClass'/Game/FactoryGame/Recipes/OilRefinery/Recipe_ResidualPlastic.Recipe_ResidualPlastic_C'")`
	got := parseClassList(in)
	if !reflect.DeepEqual(got, []string{"Recipe_ResidualPlastic_C"}) {
		t.Errorf("parseClassList = %v", got)
	}
}

func TestShortClassName(t *testing.T) {
	cases := map[string]string{
		"/Script/Engine.BlueprintGeneratedClass'/Game/X/Desc_Coal.Desc_Coal_C'": "Desc_Coal_C",
		"/Game/X/Build_ConstructorMk1.Build_ConstructorMk1_C":                   "Build_ConstructorMk1_C",
		"Desc_Leaves_C": "Desc_Leaves_C",
		"":              "",
	}
	for in, want := range cases {
		if got := shortClassName(in); got != want {
			t.Errorf("shortClassName(%q) = %q, want %q", in, got, want)
		}
	}
}
