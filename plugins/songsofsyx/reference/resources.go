package main

import (
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

type resourcesIndexResult struct {
	Count     int         `json:"count"`
	Resources []entityRef `json:"resources"`
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

func resourceRef(res data.Resource) entityRef {
	return entityRef{ID: res.ID, Name: res.Name, Roles: res.Roles}
}

func resourcesIndex(role string) resourcesIndexResult {
	refs := make([]entityRef, 0, len(data.Resources))
	for _, res := range data.Resources {
		if role != "" && !hasRole(res.Roles, role) {
			continue
		}
		refs = append(refs, resourceRef(res))
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
	return resourcesIndexResult{Count: len(refs), Resources: refs}
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}

func resolveResource(want string) (any, error) {
	return resolveEntity(want, "resources", data.Resources,
		func(res data.Resource) string { return res.ID },
		func(res data.Resource) string { return res.Name },
		resourceRef,
		func(res data.Resource) any { return withFlows(res) },
	)
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
