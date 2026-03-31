package data

import (
	"math"
	"testing"
)

func TestEntitySizesContainsKeyEntities(t *testing.T) {
	// Verify critical entities exist with expected sizes.
	tests := []struct {
		name          string
		wantWidth     float64
		wantHeight    float64
		widthEpsilon  float64
		heightEpsilon float64
	}{
		// 3×3 machines: collision_box [[-1.2, -1.2], [1.2, 1.2]] → 2.4×2.4
		{"assembling-machine-3", 2.4, 2.4, 0.1, 0.1},
		{"electric-furnace", 2.4, 2.4, 0.1, 0.1},
		// 5×5 machine: collision_box [[-2.4, -2.4], [2.4, 2.4]] → 4.8×4.8
		{"oil-refinery", 4.8, 4.8, 0.1, 0.1},
		// Beacon: 3×3, collision_box [[-1.2, -1.2], [1.2, 1.2]] → 2.4×2.4
		{"beacon", 2.4, 2.4, 0.1, 0.1},
		// Inserter: tiny collision box [[-0.15, -0.15], [0.15, 0.15]] → 0.3×0.3
		{"inserter", 0.3, 0.3, 0.05, 0.05},
		// Transport belt: [[-0.4, -0.4], [0.4, 0.4]] → 0.8×0.8
		{"transport-belt", 0.8, 0.8, 0.05, 0.05},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			size, ok := EntitySizes[tt.name]
			if !ok {
				t.Fatalf("EntitySizes[%q] not found", tt.name)
			}
			if math.Abs(size.Width-tt.wantWidth) > tt.widthEpsilon {
				t.Errorf("Width = %v, want %v (±%v)", size.Width, tt.wantWidth, tt.widthEpsilon)
			}
			if math.Abs(size.Height-tt.wantHeight) > tt.heightEpsilon {
				t.Errorf("Height = %v, want %v (±%v)", size.Height, tt.wantHeight, tt.heightEpsilon)
			}
		})
	}
}

func TestEntitySizesHasReasonableCount(t *testing.T) {
	// Should have hundreds of entries from the full dump.
	if len(EntitySizes) < 100 {
		t.Errorf("EntitySizes has %d entries, expected at least 100", len(EntitySizes))
	}
}

func TestEntitySizesAllPositive(t *testing.T) {
	for name, size := range EntitySizes {
		if size.Width <= 0 || size.Height <= 0 {
			t.Errorf("EntitySizes[%q] has non-positive dimensions: %v×%v", name, size.Width, size.Height)
		}
	}
}
