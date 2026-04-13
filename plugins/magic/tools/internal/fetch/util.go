package fetch

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"math"
	"os"
	"sort"
	"strings"
)

// FileHash computes the SHA-256 hash of a file on disk.
func FileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Round4 rounds a float to 4 decimal places.
func Round4(f float64) float64 {
	return math.Round(f*10000) / 10000
}

// IndexOf returns the index of val in slice, or -1.
func IndexOf(slice []string, val string) int {
	for i, s := range slice {
		if s == val {
			return i
		}
	}
	return -1
}

// NormalizedColorCache provides O(1) lookup for 1-2 char color strings.
var NormalizedColorCache = func() map[string]string {
	order := "WUBRGC"
	m := make(map[string]string)
	for i := 0; i < len(order); i++ {
		m[string(order[i])] = string(order[i])
		for j := 0; j < len(order); j++ {
			a, b := order[i], order[j]
			if strings.Index(order, string(a)) > strings.Index(order, string(b)) {
				a, b = b, a
			}
			m[string(order[i])+string(order[j])] = string(a) + string(b)
		}
	}
	return m
}()

// NormalizeColors converts "WU", "UW", etc. to canonical WUBRG order.
func NormalizeColors(s string) string {
	if cached, ok := NormalizedColorCache[s]; ok {
		return cached
	}
	order := "WUBRGC"
	colors := strings.Split(s, "")
	sort.Slice(colors, func(i, j int) bool {
		return strings.Index(order, colors[i]) < strings.Index(order, colors[j])
	})
	return strings.Join(colors, "")
}
