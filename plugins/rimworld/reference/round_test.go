package main

import (
	"math"
	"testing"
)

func TestRoundN(t *testing.T) {
	tests := []struct {
		name string
		v    float64
		n    int
		want float64
	}{
		{"zero decimals", 26.28497, 0, 26},
		{"one decimal", 70.548, 1, 70.5},
		{"two decimals", 0.8765, 2, 0.88},
		{"three decimals", 0.12345, 3, 0.123},
		{"four decimals", 0.56789, 4, 0.5679},
		{"rounds up at midpoint", 0.55, 1, 0.6},
		{"rounds down below midpoint", 0.54, 1, 0.5},
		{"negative value", -3.456, 1, -3.5},
		{"zero", 0, 2, 0},
		{"already rounded", 1.5, 1, 1.5},
		{"large value", 50000.123, 0, 50000},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := roundN(tt.v, tt.n)
			if math.Abs(got-tt.want) > 1e-10 {
				t.Errorf("roundN(%v, %d) = %v, want %v", tt.v, tt.n, got, tt.want)
			}
		})
	}
}
