package main

import (
	"fmt"
	"sort"
	"strings"
)

// entityRef is a lightweight reference to a catalog entity, used in indexes and
// candidate lists. Type-specific fields are omitempty.
type entityRef struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Category string   `json:"category,omitempty"`
	Playable bool     `json:"playable,omitempty"`
	Roles    []string `json:"roles,omitempty"`
}

// candidatesResult is returned when a fuzzy lookup matches more than one entity.
type candidatesResult struct {
	Query      string      `json:"query"`
	Candidates []entityRef `json:"candidates"`
}

// resolveEntity resolves want against all by exact ID (case-insensitive), then
// fuzzy ID/name substring. One match → single(match); several → a
// candidatesResult built via refOf, sorted by ID; none → an error tagged kind.
func resolveEntity[Ent any](
	want, kind string,
	all map[string]Ent,
	idOf, nameOf func(Ent) string,
	refOf func(Ent) entityRef,
	single func(Ent) any,
) (any, error) {
	for id, v := range all {
		if strings.EqualFold(id, want) {
			return single(v), nil
		}
	}

	needle := strings.ToLower(want)
	var matches []Ent
	for _, v := range all {
		if strings.Contains(strings.ToLower(idOf(v)), needle) ||
			strings.Contains(strings.ToLower(nameOf(v)), needle) {
			matches = append(matches, v)
		}
	}

	switch len(matches) {
	case 0:
		return nil, fmt.Errorf("%s: no match for %q — call %s with no lookup parameter for the index", kind, want, kind)
	case 1:
		return single(matches[0]), nil
	default:
		refs := make([]entityRef, len(matches))
		for i, v := range matches {
			refs[i] = refOf(v)
		}
		sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
		return candidatesResult{Query: want, Candidates: refs}, nil
	}
}
