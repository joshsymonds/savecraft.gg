package main

import (
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// PassiveNode holds a parsed passive tree node.
type PassiveNode struct {
	SkillID        int
	Name           string
	IsNotable      bool
	IsKeystone     bool
	IsMastery      bool
	AscendancyName string
	Stats          []string
	Group          int
	Orbit          int
	OrbitIndex     int
}

var versionRe = regexp.MustCompile(`^\d+_\d+$`)

// detectNewestTreeVersion scans TreeData/ subdirs and returns the highest
// non-alternate, non-ruthless version directory name (e.g., "3_28").
func detectNewestTreeVersion(treeDir string) (string, error) {
	entries, err := os.ReadDir(treeDir)
	if err != nil {
		return "", fmt.Errorf("reading TreeData: %w", err)
	}

	var versions []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		// Skip alternate, ruthless, and non-versioned directories
		if strings.Contains(name, "alternate") || strings.Contains(name, "ruthless") || name == "legion" {
			continue
		}
		// Must match N_N pattern
		if !versionRe.MatchString(name) {
			continue
		}
		versions = append(versions, name)
	}

	if len(versions) == 0 {
		return "", fmt.Errorf("no tree versions found in %s", treeDir)
	}

	// Sort by version number (major_minor)
	sort.Slice(versions, func(i, j int) bool {
		return compareVersions(versions[i], versions[j]) < 0
	})

	return versions[len(versions)-1], nil
}

// compareVersions compares two "M_N" version strings.
func compareVersions(a, b string) int {
	aParts := strings.SplitN(a, "_", 2)
	bParts := strings.SplitN(b, "_", 2)

	aMajor, _ := strconv.Atoi(aParts[0])
	bMajor, _ := strconv.Atoi(bParts[0])
	if aMajor != bMajor {
		return aMajor - bMajor
	}

	aMinor, bMinor := 0, 0
	if len(aParts) > 1 {
		aMinor, _ = strconv.Atoi(aParts[1])
	}
	if len(bParts) > 1 {
		bMinor, _ = strconv.Atoi(bParts[1])
	}
	return aMinor - bMinor
}

// nodeWithSkillRe matches [NNN]= { followed by ["skill"]= on the next line.
// In the real tree.lua, nodes are top-level entries in the return table (not nested
// under a "nodes" key). This distinguishes them from group entries and other data.
var nodeWithSkillRe = regexp.MustCompile(`\[(\d+)\]= \{\s*\n\s*\["skill"\]`)

// parseTreeLua parses a PoB TreeData/*/tree.lua file into PassiveNode structs.
func parseTreeLua(content string) ([]PassiveNode, error) {
	var nodes []PassiveNode

	for _, loc := range nodeWithSkillRe.FindAllStringSubmatchIndex(content, -1) {
		skillID, _ := strconv.Atoi(content[loc[2]:loc[3]])
		// Find the opening { position
		bracePos := strings.Index(content[loc[0]:], "{")
		if bracePos < 0 {
			continue
		}
		blockStart := loc[0] + bracePos + 1
		body := extractNestedBlock(content[blockStart:])
		if body == "" {
			continue
		}

		name := extractLuaBracketString(body, "name")
		if name == "" {
			continue
		}

		node := PassiveNode{
			SkillID:        skillID,
			Name:           name,
			IsNotable:      strings.Contains(body, `["isNotable"]= true`),
			IsKeystone:     strings.Contains(body, `["isKeystone"]= true`),
			IsMastery:      strings.Contains(body, `["isMastery"]= true`),
			AscendancyName: extractLuaBracketString(body, "ascendancyName"),
			Stats:          extractLuaBracketStringArray(body, "stats"),
			Group:          extractLuaBracketInt(body, "group"),
			Orbit:          extractLuaBracketInt(body, "orbit"),
			OrbitIndex:     extractLuaBracketInt(body, "orbitIndex"),
		}

		nodes = append(nodes, node)
	}

	if len(nodes) == 0 {
		return nil, fmt.Errorf("no nodes parsed")
	}
	return nodes, nil
}

// extractLuaBracketString extracts ["key"]= "value" from Lua-style tables.
func extractLuaBracketString(body, key string) string {
	re := regexp.MustCompile(`\["` + regexp.QuoteMeta(key) + `"\]= "([^"]*)"`)
	m := re.FindStringSubmatch(body)
	if m == nil {
		return ""
	}
	return m[1]
}

// extractLuaBracketInt extracts ["key"]= N from Lua-style tables.
func extractLuaBracketInt(body, key string) int {
	re := regexp.MustCompile(`\["` + regexp.QuoteMeta(key) + `"\]= (-?\d+)`)
	m := re.FindStringSubmatch(body)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// extractLuaBracketStringArray extracts ["key"]= { "a", "b" } from Lua-style tables.
func extractLuaBracketStringArray(body, key string) []string {
	re := regexp.MustCompile(`\["` + regexp.QuoteMeta(key) + `"\]= \{`)
	loc := re.FindStringIndex(body)
	if loc == nil {
		return nil
	}
	block := extractNestedBlock(body[loc[1]:])
	if block == "" {
		return nil
	}
	var result []string
	strRe := regexp.MustCompile(`"([^"]*)"`)
	for _, m := range strRe.FindAllStringSubmatch(block, -1) {
		result = append(result, m[1])
	}
	return result
}
