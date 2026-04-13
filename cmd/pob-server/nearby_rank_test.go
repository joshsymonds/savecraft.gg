package main

import (
	"testing"
)

func cand(name string, pathCost int, lifeDelta, dpsDelta float64) nearbyRankInput {
	return nearbyRankInput{
		Name:     name,
		Type:     "notable",
		PathCost: pathCost,
		Stats:    []string{name + " stat"},
		Path:     []string{"x", name},
		Deltas:   map[string]float64{"Life": lifeDelta, "CombinedDPS": dpsDelta},
	}
}

func TestNearbyRank_EmptyInput(t *testing.T) {
	r := nearbyRank(nil, "Life", "desc", 10)
	if len(r) != 0 {
		t.Fatalf("got %d, want 0", len(r))
	}
}

func TestNearbyRank_SingleCandidateEfficiency(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", 4, 1200, 0)}, "Life", "desc", 10)
	if len(r) != 1 {
		t.Fatalf("got %d, want 1", len(r))
	}
	if r[0].Efficiency != 300 {
		t.Errorf("efficiency = %v, want 300", r[0].Efficiency)
	}
}

func TestNearbyRank_DescSortHighestFirst(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{
		cand("A", 4, 800, 0),  // 200
		cand("B", 4, 1600, 0), // 400
		cand("C", 4, 400, 0),  // 100
	}, "Life", "desc", 10)
	want := []string{"B", "A", "C"}
	for i, n := range r {
		if n.Name != want[i] {
			t.Errorf("[%d] = %q, want %q", i, n.Name, want[i])
		}
	}
}

func TestNearbyRank_AscSortLowestFirst(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{
		cand("A", 4, 800, 0),  // 200
		cand("B", 4, 1600, 0), // 400
		cand("C", 4, 400, 0),  // 100
	}, "Life", "asc", 10)
	want := []string{"C", "A", "B"}
	for i, n := range r {
		if n.Name != want[i] {
			t.Errorf("[%d] = %q, want %q", i, n.Name, want[i])
		}
	}
}

func TestNearbyRank_EfficiencyTiePathCostAscWins(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{
		cand("A", 2, 200, 0), // eff 100
		cand("B", 4, 400, 0), // eff 100
	}, "Life", "desc", 10)
	if r[0].Name != "A" || r[1].Name != "B" {
		t.Errorf("order = %q,%q, want A,B", r[0].Name, r[1].Name)
	}
}

func TestNearbyRank_FullTieNameAscWins(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{
		cand("Zeb", 4, 400, 0),
		cand("Aaron", 4, 400, 0),
	}, "Life", "desc", 10)
	if r[0].Name != "Aaron" || r[1].Name != "Zeb" {
		t.Errorf("order = %q,%q, want Aaron,Zeb", r[0].Name, r[1].Name)
	}
}

func TestNearbyRank_LimitTruncates(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{
		cand("A", 1, 100, 0),
		cand("B", 1, 200, 0),
		cand("C", 1, 300, 0),
		cand("D", 1, 400, 0),
	}, "Life", "desc", 2)
	if len(r) != 2 {
		t.Fatalf("got %d, want 2", len(r))
	}
	if r[0].Name != "D" || r[1].Name != "C" {
		t.Errorf("order = %q,%q, want D,C", r[0].Name, r[1].Name)
	}
}

func TestNearbyRank_LimitLargerReturnsAll(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", 1, 100, 0)}, "Life", "desc", 99)
	if len(r) != 1 {
		t.Fatalf("got %d, want 1", len(r))
	}
}

func TestNearbyRank_PathCostZeroNoCrashEfficiencyZero(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", 0, 1000, 0)}, "Life", "desc", 10)
	if r[0].Efficiency != 0 {
		t.Errorf("efficiency = %v, want 0", r[0].Efficiency)
	}
}

func TestNearbyRank_PathCostNegativeTreatedAsZero(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", -1, 1000, 0)}, "Life", "desc", 10)
	if r[0].Efficiency != 0 {
		t.Errorf("efficiency = %v, want 0", r[0].Efficiency)
	}
}

func TestNearbyRank_MissingMetricInDeltasTreatedAsZero(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", 4, 800, 0)}, "Armour", "desc", 10)
	if r[0].Efficiency != 0 {
		t.Errorf("efficiency = %v, want 0", r[0].Efficiency)
	}
}

func TestNearbyRank_PreservesPassthroughFields(t *testing.T) {
	r := nearbyRank([]nearbyRankInput{cand("A", 4, 800, 100)}, "Life", "desc", 10)
	if r[0].Type != "notable" {
		t.Errorf("type = %q, want notable", r[0].Type)
	}
	if len(r[0].Stats) == 0 || r[0].Stats[0] != "A stat" {
		t.Errorf("stats = %v, want [A stat]", r[0].Stats)
	}
	if len(r[0].Path) == 0 || r[0].Path[0] != "x" {
		t.Errorf("path = %v, want [x A]", r[0].Path)
	}
	if r[0].Deltas["CombinedDPS"] != 100 {
		t.Errorf("deltas.CombinedDPS = %v, want 100", r[0].Deltas["CombinedDPS"])
	}
}

func TestNearbyRank_NilDeltasTreatedAsZero(t *testing.T) {
	in := []nearbyRankInput{
		{Name: "A", PathCost: 4, Deltas: nil},
	}
	r := nearbyRank(in, "Life", "desc", 10)
	if r[0].Efficiency != 0 {
		t.Errorf("efficiency = %v, want 0", r[0].Efficiency)
	}
}
