package main

import (
	"math"
	"testing"
)

func TestCardAccumATAStddev(t *testing.T) {
	// Simulate a card picked at positions 3, 5, 7 (1-indexed).
	// Mean = 5.0, σ = sqrt((4+0+4)/3) = sqrt(8/3) ≈ 1.633
	a := &cardAccum{}
	for _, pos := range []float64{3, 5, 7} {
		a.totalTakenAt += pos
		a.takenAtSumSq += pos * pos
		a.takenCount++
	}

	s := a.stats()

	if s.ATA != 5.0 {
		t.Errorf("ATA = %g, want 5.0", s.ATA)
	}

	expectedStddev := math.Sqrt(8.0 / 3.0) // ≈ 1.633
	if diff := math.Abs(s.ATAStddev - expectedStddev); diff > 0.001 {
		t.Errorf("ATAStddev = %g, want ≈%g (diff=%g)", s.ATAStddev, expectedStddev, diff)
	}
}

func TestCardAccumATAStddev_SinglePick(t *testing.T) {
	// With only one pick, stddev should be 0.
	a := &cardAccum{
		totalTakenAt: 4,
		takenAtSumSq: 16,
		takenCount:   1,
	}

	s := a.stats()

	if s.ATA != 4.0 {
		t.Errorf("ATA = %g, want 4.0", s.ATA)
	}
	if s.ATAStddev != 0 {
		t.Errorf("ATAStddev = %g, want 0 (single pick)", s.ATAStddev)
	}
}

func TestCardAccumATAStddev_IdenticalPicks(t *testing.T) {
	// All picks at position 6 → stddev = 0.
	a := &cardAccum{}
	for range 100 {
		a.totalTakenAt += 6
		a.takenAtSumSq += 36
		a.takenCount++
	}

	s := a.stats()

	if s.ATA != 6.0 {
		t.Errorf("ATA = %g, want 6.0", s.ATA)
	}
	if s.ATAStddev > 0.001 {
		t.Errorf("ATAStddev = %g, want ≈0 (identical picks)", s.ATAStddev)
	}
}

func TestCardAccumATAStddev_NoPicks(t *testing.T) {
	a := &cardAccum{}
	s := a.stats()

	if s.ATA != 0 {
		t.Errorf("ATA = %g, want 0 (no picks)", s.ATA)
	}
	if s.ATAStddev != 0 {
		t.Errorf("ATAStddev = %g, want 0 (no picks)", s.ATAStddev)
	}
}
