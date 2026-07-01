package main

import (
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

type techIndexResult struct {
	Count int         `json:"count"`
	Techs []entityRef `json:"techs"`
}

// techModule looks up knowledge-tree nodes. With no "tech" param it returns the
// index (optionally filtered by "category"). With "tech" it resolves one node
// by exact ID (case-insensitive) or fuzzy id/name, returning the full Tech, a
// candidate list when ambiguous, or an error.
func techModule(query map[string]any) (any, error) {
	if want := stringParam(query, "tech"); want != "" {
		return resolveTech(want)
	}
	return techIndex(stringParam(query, "category")), nil
}

func techRef(tech data.Tech) entityRef {
	return entityRef{ID: tech.ID, Name: tech.Name, Category: tech.Category}
}

func techIndex(category string) techIndexResult {
	count, refs := buildIndex(data.Techs, techRef, func(tech data.Tech) bool {
		return category == "" || strings.EqualFold(tech.Category, category)
	})
	return techIndexResult{Count: count, Techs: refs}
}

func resolveTech(want string) (any, error) {
	return resolveEntity(want, "tech", data.Techs,
		func(tech data.Tech) string { return tech.ID },
		func(tech data.Tech) string { return tech.Name },
		techRef,
		func(tech data.Tech) any { return tech },
	)
}
