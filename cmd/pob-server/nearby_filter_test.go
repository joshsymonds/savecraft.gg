package main

import (
	"reflect"
	"testing"
)

func intPtr(i int) *int {
	return &i
}

func makeCandidate() *nearbyCandidate {
	return &nearbyCandidate{
		Alloc:    false,
		PathDist: intPtr(1),
		Path:     []string{"x"},
		Type:     "Normal",
		ModKey:   "some_mod",
	}
}

func TestNearbyShouldEvaluate(t *testing.T) {
	cases := []struct {
		name   string
		modify func(*nearbyCandidate)
		radius int
		want   bool
	}{
		{"happy_path_normal", func(*nearbyCandidate) {}, 5, true},
		{"happy_path_notable", func(c *nearbyCandidate) { c.Type = "Notable" }, 5, true},
		{"happy_path_keystone", func(c *nearbyCandidate) { c.Type = "Keystone" }, 5, true},
		{"rejects_allocated", func(c *nearbyCandidate) { c.Alloc = true }, 5, false},
		{"rejects_path_dist_over_radius", func(c *nearbyCandidate) { c.PathDist = intPtr(6) }, 5, false},
		{"accepts_path_dist_at_boundary", func(c *nearbyCandidate) { c.PathDist = intPtr(5) }, 5, true},
		{"rejects_nil_path_dist", func(c *nearbyCandidate) { c.PathDist = nil }, 5, false},
		{"rejects_nil_path", func(c *nearbyCandidate) { c.Path = nil }, 5, false},
		{"rejects_mastery", func(c *nearbyCandidate) { c.Type = "Mastery" }, 5, false},
		{"rejects_socket", func(c *nearbyCandidate) { c.Type = "Socket" }, 5, false},
		{"rejects_class_start", func(c *nearbyCandidate) { c.Type = "ClassStart" }, 5, false},
		{"rejects_ascend_class_start", func(c *nearbyCandidate) { c.Type = "AscendClassStart" }, 5, false},
		{"rejects_empty_mod_key", func(c *nearbyCandidate) { c.ModKey = "" }, 5, false},
		{"rejects_ascendancy_node", func(c *nearbyCandidate) { c.AscendancyName = "Necromancer" }, 5, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := makeCandidate()
			tc.modify(c)
			if got := nearbyShouldEvaluate(c, tc.radius); got != tc.want {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestCollectStatKeys(t *testing.T) {
	cases := []struct {
		name       string
		metrics    []string
		deltaStats []string
		want       []string
	}{
		{
			name: "empty_inputs",
			want: []string{},
		},
		{
			name:    "only_metrics",
			metrics: []string{"Life", "CombinedDPS"},
			want:    []string{"Life", "CombinedDPS"},
		},
		{
			name:       "only_delta_stats",
			deltaStats: []string{"Armour", "EnergyShield"},
			want:       []string{"Armour", "EnergyShield"},
		},
		{
			name:       "metrics_then_novel_delta_stats",
			metrics:    []string{"Life"},
			deltaStats: []string{"CombinedDPS", "Armour"},
			want:       []string{"Life", "CombinedDPS", "Armour"},
		},
		{
			name:       "dedupes_overlap",
			metrics:    []string{"Life", "CombinedDPS"},
			deltaStats: []string{"Life", "Armour"},
			want:       []string{"Life", "CombinedDPS", "Armour"},
		},
		{
			name:    "preserves_metrics_order",
			metrics: []string{"C", "A", "B"},
			want:    []string{"C", "A", "B"},
		},
		{
			name: "handles_nil_inputs",
			want: []string{},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := collectStatKeys(tc.metrics, tc.deltaStats)
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}
