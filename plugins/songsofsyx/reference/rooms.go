package main

import (
	"sort"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

type roomsIndexResult struct {
	Count int         `json:"count"`
	Rooms []entityRef `json:"rooms"`
}

// roomsModule looks up rooms/buildings. With no "room" param it returns the
// index (optionally filtered by "category"). With "room" it resolves one
// building by exact ID (case-insensitive) or fuzzy ID/name, returning the full
// Room, a candidate list when ambiguous, or an error.
func roomsModule(query map[string]any) (any, error) {
	if want := stringParam(query, "room"); want != "" {
		return resolveRoom(want)
	}
	return roomsIndex(stringParam(query, "category")), nil
}

func roomRef(room data.Room) entityRef {
	return entityRef{ID: room.ID, Name: room.Name, Category: room.Category}
}

func roomsIndex(category string) roomsIndexResult {
	refs := make([]entityRef, 0, len(data.Rooms))
	for _, room := range data.Rooms {
		if category != "" && !strings.EqualFold(room.Category, category) {
			continue
		}
		refs = append(refs, roomRef(room))
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].ID < refs[j].ID })
	return roomsIndexResult{Count: len(refs), Rooms: refs}
}

func resolveRoom(want string) (any, error) {
	return resolveEntity(want, "rooms", data.Rooms,
		func(room data.Room) string { return room.ID },
		func(room data.Room) string { return room.Name },
		roomRef,
		func(room data.Room) any { return room },
	)
}
