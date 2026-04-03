package data

import (
	"math"
	"testing"
)

func TestInserterOffsets(t *testing.T) {
	tests := []struct {
		name          string
		wantPickup    [2]float64
		wantInsert    [2]float64
		insertEpsilon float64
	}{
		{"inserter", [2]float64{0, -1}, [2]float64{0, 1.2}, 0.01},
		{"fast-inserter", [2]float64{0, -1}, [2]float64{0, 1.2}, 0.01},
		{"long-handed-inserter", [2]float64{0, -2}, [2]float64{0, 2.2}, 0.01},
		{"bulk-inserter", [2]float64{0, -1}, [2]float64{0, 1.2}, 0.01},
		{"stack-inserter", [2]float64{0, -1}, [2]float64{0, 1.2}, 0.01},
		{"burner-inserter", [2]float64{0, -1}, [2]float64{0, 1.2}, 0.01},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ins, ok := Inserters[tt.name]
			if !ok {
				t.Fatalf("Inserters[%q] not found", tt.name)
			}
			if ins.PickupOffset != tt.wantPickup {
				t.Errorf("PickupOffset = %v, want %v", ins.PickupOffset, tt.wantPickup)
			}
			if math.Abs(ins.InsertOffset[0]-tt.wantInsert[0]) > tt.insertEpsilon ||
				math.Abs(ins.InsertOffset[1]-tt.wantInsert[1]) > tt.insertEpsilon {
				t.Errorf("InsertOffset = %v, want %v (±%v)", ins.InsertOffset, tt.wantInsert, tt.insertEpsilon)
			}
		})
	}
}

func TestAllInsertersHaveOffsets(t *testing.T) {
	for name, ins := range Inserters {
		if ins.InsertOffset == [2]float64{0, 0} {
			t.Errorf("Inserters[%q] has zero InsertOffset", name)
		}
	}
}
