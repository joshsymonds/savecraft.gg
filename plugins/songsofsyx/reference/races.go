package main

import (
	"sort"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

type racesIndexResult struct {
	Count int         `json:"count"`
	Races []entityRef `json:"races"`
}

// racesModule looks up species. With no "race" param it returns the index; with
// "race" it resolves one species by exact ID (case-insensitive) or fuzzy
// id/name, returning the full Race, a candidate list when ambiguous, or an
// error.
func racesModule(query map[string]any) (any, error) {
	if want := stringParam(query, "race"); want != "" {
		return resolveRace(want)
	}
	return racesIndex(), nil
}

func raceRef(race data.Race) entityRef {
	return entityRef{ID: race.ID, Name: race.Name, Playable: race.Playable}
}

func racesIndex() racesIndexResult {
	refs := make([]entityRef, 0, len(data.Races))
	for _, race := range data.Races {
		refs = append(refs, raceRef(race))
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
	return racesIndexResult{Count: len(refs), Races: refs}
}

func resolveRace(want string) (any, error) {
	return resolveEntity(want, "races", data.Races,
		func(race data.Race) string { return race.ID },
		func(race data.Race) string { return race.Name },
		raceRef,
		func(race data.Race) any { return race },
	)
}
