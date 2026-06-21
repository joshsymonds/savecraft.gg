package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

type resourceRef struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Roles []string `json:"roles,omitempty"`
}

type resourcesIndexResult struct {
	Count     int           `json:"count"`
	Resources []resourceRef `json:"resources"`
}

// roomRate is a room and the rate at which it produces/consumes a resource.
type roomRate struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Rate float64 `json:"rate"`
}

type resourceResult struct {
	Resource   data.Resource `json:"resource"`
	ProducedBy []roomRate    `json:"producedBy,omitempty"`
	ConsumedBy []roomRate    `json:"consumedBy,omitempty"`
}

type resourcesCandidates struct {
	Query      string        `json:"query"`
	Candidates []resourceRef `json:"candidates"`
}

// resourcesModule looks up resources/goods. With no "resource" param it returns
// the index (optionally filtered by "role"). With "resource" it resolves one
// good by exact ID or fuzzy id/name, returning the Resource plus the rooms that
// produce and consume it (computed from data.Rooms).
func resourcesModule(query map[string]any) (any, error) {
	if want := stringParam(query, "resource"); want != "" {
		return resolveResource(want)
	}
	return resourcesIndex(stringParam(query, "role")), nil
}

func resourcesIndex(role string) resourcesIndexResult {
	refs := make([]resourceRef, 0, len(data.Resources))
	for _, res := range data.Resources {
		if role != "" && !hasRole(res.Roles, role) {
			continue
		}
		refs = append(refs, resourceRef{ID: res.ID, Name: res.Name, Roles: res.Roles})
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
	return resourcesIndexResult{Count: len(refs), Resources: refs}
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if strings.EqualFold(r, want) {
			return true
		}
	}
	return false
}

func resolveResource(want string) (any, error) {
	// Exact ID (case-insensitive) wins.
	for id, res := range data.Resources {
		if strings.EqualFold(id, want) {
			return withFlows(res), nil
		}
	}

	needle := strings.ToLower(want)
	var matches []data.Resource
	for _, res := range data.Resources {
		if strings.Contains(strings.ToLower(res.ID), needle) ||
			strings.Contains(strings.ToLower(res.Name), needle) {
			matches = append(matches, res)
		}
	}

	switch len(matches) {
	case 0:
		return nil, fmt.Errorf("resources: no good matching %q — call resources with no 'resource' for the index", want)
	case 1:
		return withFlows(matches[0]), nil
	default:
		refs := make([]resourceRef, len(matches))
		for i, res := range matches {
			refs[i] = resourceRef{ID: res.ID, Name: res.Name, Roles: res.Roles}
		}
		sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
		return resourcesCandidates{Query: want, Candidates: refs}, nil
	}
}

// withFlows attaches the rooms that produce and consume the resource, sorted by
// room ID.
func withFlows(res data.Resource) resourceResult {
	out := resourceResult{Resource: res}
	for _, room := range data.Rooms {
		if rate, ok := room.Produces[res.ID]; ok {
			out.ProducedBy = append(out.ProducedBy, roomRate{ID: room.ID, Name: room.Name, Rate: rate})
		}
		if rate, ok := room.Consumes[res.ID]; ok {
			out.ConsumedBy = append(out.ConsumedBy, roomRate{ID: room.ID, Name: room.Name, Rate: rate})
		}
	}
	sort.Slice(out.ProducedBy, func(i, j int) bool { return out.ProducedBy[i].ID < out.ProducedBy[j].ID })
	sort.Slice(out.ConsumedBy, func(i, j int) bool { return out.ConsumedBy[i].ID < out.ConsumedBy[j].ID })
	return out
}
