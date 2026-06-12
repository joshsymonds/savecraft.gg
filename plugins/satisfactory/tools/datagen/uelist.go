package main

import (
	"regexp"
	"strconv"
	"strings"
)

// The Docs.json values for ingredient/product lists and class lists are
// UE-stringified, e.g.:
//
//	((ItemClass="/Script/Engine.BlueprintGeneratedClass'/Game/.../Desc_X.Desc_X_C'",Amount=3),(...))
//	("/Game/.../Build_Y.Build_Y_C","/Game/.../Build_Z.Build_Z_C")
//
// Only the short class name and the amount matter downstream.

type pair struct {
	class  string
	amount int
}

var itemAmountPattern = regexp.MustCompile(`ItemClass="([^"]+)",Amount=(\d+)`)

func parseItemAmounts(s string) []pair {
	matches := itemAmountPattern.FindAllStringSubmatch(s, -1)
	pairs := make([]pair, 0, len(matches))
	for _, m := range matches {
		amount, err := strconv.Atoi(m[2])
		if err != nil {
			continue
		}
		pairs = append(pairs, pair{class: shortClassName(m[1]), amount: amount})
	}
	return pairs
}

var quotedPattern = regexp.MustCompile(`"([^"]+)"`)

func parseClassList(s string) []string {
	matches := quotedPattern.FindAllStringSubmatch(s, -1)
	classes := make([]string, 0, len(matches))
	for _, m := range matches {
		if c := shortClassName(m[1]); c != "" {
			classes = append(classes, c)
		}
	}
	return classes
}

// shortClassName extracts the final class name from a UE object path,
// stripping any BlueprintGeneratedClass'...' wrapper and quotes.
func shortClassName(path string) string {
	path = strings.TrimSuffix(path, "'")
	if i := strings.LastIndex(path, "."); i >= 0 {
		path = path[i+1:]
	}
	return strings.Trim(path, "'\"")
}
