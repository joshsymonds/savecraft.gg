package main

import (
	"fmt"
	"go/format"
	"strings"
	"testing"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/tools/datagen/sosdata"
)

// guideFixture builds a synthetic WIKIS document mimicking GUIDE.txt (article
// with LINK_KEY) and ROOMS.txt (article without LINK_KEY). TEXT close quotes
// are immediately followed by ',' per the dialect.
func guideFixture() string {
	intro := "\nWelcome to the grand wiki guide to Songs of Syx.\n \n" +
		"This aims to explain mechanics. Follow <a CREATING here>, <a TRADE here>, then <a CREATING again>.\n"
	fish := "\nFisheries are a reliable food source on maps with lots of water.\n"
	return fmt.Sprintf(`WIKIS: [
	{
		CATEGORY: "Guide",
		NAME: "01. Introduction",
		CATEGORIES: [],
		LINK_KEY: INTRODUCTION,
		TEXT: "%s",
	},
	{
		CATEGORY: "Rooms",
		NAME: "Fisheries",
		TEXT: "%s",
	},
]
`, intro, fish)
}

func decodeFixture(t *testing.T) []data.GuideArticle {
	t.Helper()
	root, err := sosdata.Parse([]byte(guideFixture()))
	if err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	arts, err := decodeGuideArticles(root)
	if err != nil {
		t.Fatalf("decodeGuideArticles: %v", err)
	}
	return arts
}

func TestDecodeGuideArticles(t *testing.T) {
	arts := decodeFixture(t)
	if len(arts) != 2 {
		t.Fatalf("got %d articles, want 2", len(arts))
	}

	a := arts[0]
	if a.LinkKey != "INTRODUCTION" {
		t.Errorf("LinkKey = %q, want INTRODUCTION", a.LinkKey)
	}
	if a.Title != "01. Introduction" {
		t.Errorf("Title = %q, want '01. Introduction'", a.Title)
	}
	if a.Category != "Guide" {
		t.Errorf("Category = %q, want Guide", a.Category)
	}
	if a.Synopsis != "Welcome to the grand wiki guide to Songs of Syx." {
		t.Errorf("Synopsis = %q", a.Synopsis)
	}
	if !strings.Contains(a.Text, "<a CREATING here>") {
		t.Errorf("Text lost markup: %q", a.Text)
	}
}

func TestDecodeCrossLinksDedupOrder(t *testing.T) {
	arts := decodeFixture(t)
	got := arts[0].CrossLinks
	want := []string{"CREATING", "TRADE"} // CREATING referenced twice -> once, order preserved
	if len(got) != len(want) {
		t.Fatalf("CrossLinks = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("CrossLinks = %v, want %v", got, want)
		}
	}
}

func TestDecodeSynthesizesSlugWhenLinkKeyAbsent(t *testing.T) {
	arts := decodeFixture(t)
	room := arts[1]
	if room.LinkKey != "FISHERIES" {
		t.Errorf("slug LinkKey = %q, want FISHERIES", room.LinkKey)
	}
	if room.Category != "Rooms" {
		t.Errorf("Category = %q, want Rooms", room.Category)
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Fisheries":        "FISHERIES",
		"01. Introduction": "01_INTRODUCTION",
		"Picking a world":  "PICKING_A_WORLD",
		"Farms & Fields":   "FARMS_FIELDS",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGenerateGuideSourceCompiles(t *testing.T) {
	arts := decodeFixture(t)
	src, err := generateGuideSource(arts)
	if err != nil {
		t.Fatalf("generateGuideSource: %v", err)
	}
	// Must be valid, gofmt-stable Go source.
	if _, err := format.Source(src); err != nil {
		t.Fatalf("generated source does not gofmt: %v\n%s", err, src)
	}
	s := string(src)
	for _, want := range []string{"package data", "var GuideArticles", "INTRODUCTION", "FISHERIES"} {
		if !strings.Contains(s, want) {
			t.Errorf("generated source missing %q", want)
		}
	}
}
