package main

import (
	"strings"
	"testing"
)

func TestGuideIndexDefaultOp(t *testing.T) {
	// No op defaults to index.
	res, err := guideModule(map[string]any{})
	if err != nil {
		t.Fatalf("guideModule index: %v", err)
	}
	idx, ok := res.(guideIndexResult)
	if !ok {
		t.Fatalf("result type = %T, want guideIndexResult", res)
	}
	if idx.Count != len(idx.Articles) {
		t.Errorf("Count %d != len(Articles) %d", idx.Count, len(idx.Articles))
	}
	if idx.Count < 30 {
		t.Errorf("Count = %d, want the full guide (>=30)", idx.Count)
	}
	// TOC entries must carry keys/titles but NOT full body text.
	var sawIntro, sawFish bool
	for _, e := range idx.Articles {
		if e.Key == "" || e.Title == "" {
			t.Errorf("TOC entry missing key/title: %+v", e)
		}
		switch e.Key {
		case "INTRODUCTION":
			sawIntro = true
		case "FISHERIES":
			sawFish = true
		}
	}
	if !sawIntro || !sawFish {
		t.Errorf("index missing known keys (INTRODUCTION=%v, FISHERIES=%v)", sawIntro, sawFish)
	}
}

func TestGuideArticleByKeyCaseInsensitive(t *testing.T) {
	res, err := guideModule(map[string]any{"op": "article", "key": "introduction"})
	if err != nil {
		t.Fatalf("guideModule article: %v", err)
	}
	a, ok := res.(guideArticleResult)
	if !ok {
		t.Fatalf("result type = %T, want guideArticleResult", res)
	}
	if a.Key != "INTRODUCTION" {
		t.Errorf("Key = %q, want INTRODUCTION", a.Key)
	}
	if strings.TrimSpace(a.Text) == "" {
		t.Errorf("article Text is empty")
	}
}

func TestGuideArticleUnknownKeyErrors(t *testing.T) {
	if _, err := guideModule(map[string]any{"op": "article", "key": "NOPE_NOT_A_KEY"}); err == nil {
		t.Errorf("unknown key = nil error, want error")
	}
}

func TestGuideArticleMissingKeyErrors(t *testing.T) {
	if _, err := guideModule(map[string]any{"op": "article"}); err == nil {
		t.Errorf("missing key = nil error, want error")
	}
}

func TestGuideSearchFindsArticle(t *testing.T) {
	res, err := guideModule(map[string]any{"op": "search", "q": "fish"})
	if err != nil {
		t.Fatalf("guideModule search: %v", err)
	}
	sr, ok := res.(guideSearchResult)
	if !ok {
		t.Fatalf("result type = %T, want guideSearchResult", res)
	}
	var found bool
	for _, m := range sr.Matches {
		if m.Key == "FISHERIES" {
			found = true
		}
	}
	if !found {
		t.Errorf("search 'fish' did not return FISHERIES; matches=%d", sr.Count)
	}
}

func TestGuideSearchNoMatchIsEmptyNotError(t *testing.T) {
	res, err := guideModule(map[string]any{"op": "search", "q": "zzzznotfoundzzzz"})
	if err != nil {
		t.Fatalf("guideModule search: %v", err)
	}
	sr, ok := res.(guideSearchResult)
	if !ok {
		t.Fatalf("result type = %T, want guideSearchResult", res)
	}
	if sr.Count != 0 || len(sr.Matches) != 0 {
		t.Errorf("no-match search = %d matches, want 0", sr.Count)
	}
}

func TestGuideUnknownOpErrors(t *testing.T) {
	if _, err := guideModule(map[string]any{"op": "frobnicate"}); err == nil {
		t.Errorf("unknown op = nil error, want error")
	}
}

func TestSchemaIncludesGuide(t *testing.T) {
	s := schema()
	mods, ok := s["modules"].(map[string]any)
	if !ok {
		t.Fatalf("schema has no modules map")
	}
	guide, ok := mods["guide"].(map[string]any)
	if !ok {
		t.Fatalf("schema missing guide module")
	}
	params, ok := guide["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("guide module missing parameters")
	}
	for _, p := range []string{"op", "key", "q"} {
		if _, ok := params[p]; !ok {
			t.Errorf("guide parameters missing %q", p)
		}
	}
}
