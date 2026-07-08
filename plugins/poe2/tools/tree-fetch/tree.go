package main

import (
	"encoding/json"
	"fmt"
	"sort"
)

// PassiveNode holds a parsed PoE2 passive tree node, ready for D1 import.
type PassiveNode struct {
	Hash           int
	Name           string
	IsNotable      bool
	IsKeystone     bool
	IsMastery      bool
	AscendancyName string // resolved display name; "" if not ascendancy-scoped
	Stats          []string
}

// exportNode mirrors a single entry in poe2-skilltree-export's data.json
// "nodes" map. Only the fields the passive_tree module needs are decoded.
type exportNode struct {
	ID           *string  `json:"id"`
	Skill        *int     `json:"skill"`
	Name         string   `json:"name"`
	IsNotable    bool     `json:"isNotable"`
	IsKeystone   bool     `json:"isKeystone"`
	IsMastery    bool     `json:"isMastery"`
	AscendancyID string   `json:"ascendancyId"`
	Stats        []string `json:"stats"`
}

// exportAscendancy is one entry in a class's "ascendancies" array.
type exportAscendancy struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// exportClass is one entry in data.json's top-level "classes" array.
type exportClass struct {
	Ascendancies []exportAscendancy `json:"ascendancies"`
}

// treeExport is the subset of poe2-skilltree-export's data.json this tool reads.
type treeExport struct {
	Nodes   map[string]exportNode `json:"nodes"`
	Classes []exportClass         `json:"classes"`
}

// parseTreeData parses a poe2-skilltree-export data.json payload into
// PassiveNode rows, sorted by hash for deterministic output (required so
// repeated runs over unchanged data produce byte-identical SQL for the
// content-hash-based skip-if-unchanged check in main.go).
//
// Nodes without a "skill" id or with an empty name are skipped — these are
// non-passive placeholders in the export (e.g. the tree's "root" entry, and
// reserved/unreleased ascendancy grid slots that have no allocatable node
// yet). ascendancyId is resolved to its display name via the "classes"
// array (e.g. "Druid1" -> "Oracle"); nodes with an ascendancyId not found
// in "classes" keep the raw id rather than silently dropping the scoping.
func parseTreeData(data []byte) ([]PassiveNode, error) {
	var export treeExport
	if err := json.Unmarshal(data, &export); err != nil {
		return nil, fmt.Errorf("decoding data.json: %w", err)
	}

	ascendancyNames := make(map[string]string)
	for _, class := range export.Classes {
		for _, asc := range class.Ascendancies {
			if asc.Name != "" {
				ascendancyNames[asc.ID] = asc.Name
			}
		}
	}

	nodes := make([]PassiveNode, 0, len(export.Nodes))
	for _, raw := range export.Nodes {
		if raw.Skill == nil || raw.Name == "" {
			continue
		}

		ascendancyName := ""
		if raw.AscendancyID != "" {
			if resolved, ok := ascendancyNames[raw.AscendancyID]; ok {
				ascendancyName = resolved
			} else {
				ascendancyName = raw.AscendancyID
			}
		}

		nodes = append(nodes, PassiveNode{
			Hash:           *raw.Skill,
			Name:           raw.Name,
			IsNotable:      raw.IsNotable,
			IsKeystone:     raw.IsKeystone,
			IsMastery:      raw.IsMastery,
			AscendancyName: ascendancyName,
			Stats:          raw.Stats,
		})
	}

	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Hash < nodes[j].Hash })

	return nodes, nil
}
