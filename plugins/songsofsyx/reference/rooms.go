package main

import (
	"fmt"
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

// roomRef is a lightweight room reference for indexes and candidate lists.
type roomRef struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
}

type roomsIndexResult struct {
	Count int       `json:"count"`
	Rooms []roomRef `json:"rooms"`
}

type roomsCandidates struct {
	Query      string    `json:"query"`
	Candidates []roomRef `json:"candidates"`
}

// roomsModule looks up rooms/buildings. With no "room" param it returns the
// index (optionally filtered by "category"). With "room" it resolves one
// building by exact ID (case-insensitive) or fuzzy ID/name substring, returning
// the full Room, or a candidate list when ambiguous.
func roomsModule(query map[string]any) (any, error) {
	if want := stringParam(query, "room"); want != "" {
		return resolveRoom(want)
	}
	return roomsIndex(stringParam(query, "category")), nil
}

func roomsIndex(category string) roomsIndexResult {
	refs := make([]roomRef, 0, len(data.Rooms))
	for _, room := range data.Rooms {
		if category != "" && !strings.EqualFold(room.Category, category) {
			continue
		}
		refs = append(refs, roomRef{ID: room.ID, Name: room.Name, Category: room.Category})
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
	return roomsIndexResult{Count: len(refs), Rooms: refs}
}

func resolveRoom(want string) (any, error) {
	// Exact ID (case-insensitive) wins outright.
	for id, room := range data.Rooms {
		if strings.EqualFold(id, want) {
			return room, nil
		}
	}

	// Otherwise collect substring matches on ID or name.
	needle := strings.ToLower(want)
	var matches []data.Room
	for _, room := range data.Rooms {
		if strings.Contains(strings.ToLower(room.ID), needle) ||
			strings.Contains(strings.ToLower(room.Name), needle) {
			matches = append(matches, room)
		}
	}

	switch len(matches) {
	case 0:
		return nil, fmt.Errorf("rooms: no building matching %q — call rooms with no 'room' for the index", want)
	case 1:
		return matches[0], nil
	default:
		refs := make([]roomRef, len(matches))
		for i, room := range matches {
			refs[i] = roomRef{ID: room.ID, Name: room.Name, Category: room.Category}
		}
		sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
		return roomsCandidates{Query: want, Candidates: refs}, nil
	}
}
