package main

import (
	"fmt"
	"strings"

	"github.com/joshsymonds/savecraft.gg/plugins/songsofsyx/reference/data"
)

// guideTOCEntry is a table-of-contents row: enough to choose an article without
// its full body.
type guideTOCEntry struct {
	Key        string   `json:"key"`
	Title      string   `json:"title"`
	Category   string   `json:"category"`
	Synopsis   string   `json:"synopsis"`
	CrossLinks []string `json:"crossLinks,omitempty"`
}

type guideIndexResult struct {
	Count    int             `json:"count"`
	Articles []guideTOCEntry `json:"articles"`
}

type guideArticleResult struct {
	Key        string   `json:"key"`
	Title      string   `json:"title"`
	Category   string   `json:"category"`
	Text       string   `json:"text"`
	CrossLinks []string `json:"crossLinks,omitempty"`
}

type guideSearchResult struct {
	Query   string          `json:"query"`
	Count   int             `json:"count"`
	Matches []guideTOCEntry `json:"matches"`
}

// guideModule serves the in-game mechanics guide. Ops: "index" (default — the
// table of contents), "article" (full text by key), "search" (keyword match).
func guideModule(query map[string]any) (any, error) {
	op := stringParam(query, "op")
	if op == "" {
		op = "index"
	}
	switch op {
	case "index":
		return guideIndex(), nil
	case "article":
		key := stringParam(query, "key")
		if key == "" {
			return nil, fmt.Errorf("guide: op 'article' requires a 'key' (a LINK_KEY from the index)")
		}
		return guideArticle(key)
	case "search":
		q := stringParam(query, "q")
		if q == "" {
			return nil, fmt.Errorf("guide: op 'search' requires a 'q' search term")
		}
		return guideSearch(q), nil
	default:
		return nil, fmt.Errorf("guide: unknown op %q (use 'index', 'article', or 'search')", op)
	}
}

func guideIndex() guideIndexResult {
	entries := make([]guideTOCEntry, 0, len(data.GuideArticles))
	for _, art := range data.GuideArticles {
		entries = append(entries, toc(art))
	}
	return guideIndexResult{Count: len(entries), Articles: entries}
}

func guideArticle(key string) (any, error) {
	for _, art := range data.GuideArticles {
		if strings.EqualFold(art.LinkKey, key) {
			return guideArticleResult{
				Key:        art.LinkKey,
				Title:      art.Title,
				Category:   art.Category,
				Text:       art.Text,
				CrossLinks: art.CrossLinks,
			}, nil
		}
	}
	return nil, fmt.Errorf("guide: no article with key %q — call op 'index' for valid keys", key)
}

func guideSearch(term string) guideSearchResult {
	needle := strings.ToLower(term)
	matches := make([]guideTOCEntry, 0)
	for _, art := range data.GuideArticles {
		hay := strings.ToLower(art.Title + "\n" + art.Synopsis + "\n" + art.Text)
		if strings.Contains(hay, needle) {
			matches = append(matches, toc(art))
		}
	}
	return guideSearchResult{Query: term, Count: len(matches), Matches: matches}
}

func toc(art data.GuideArticle) guideTOCEntry {
	return guideTOCEntry{
		Key:        art.LinkKey,
		Title:      art.Title,
		Category:   art.Category,
		Synopsis:   art.Synopsis,
		CrossLinks: art.CrossLinks,
	}
}
