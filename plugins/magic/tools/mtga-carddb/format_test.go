package main

import (
	"bytes"
	"go/format"
	"os"
	"path/filepath"
	"testing"
)

// The generated parser data file must be gofmt/goimports-canonical as
// written — the pre-commit hook (just check -> fmt-go-check) and the
// PR-gated `just datagen-magic` recipe both reject unformatted output.
// The generator must produce clean Go by construction, not rely on a
// human running `just fmt-go` after every regeneration.
func TestGenerateParserDataWritesGofmtCleanFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "arena_cards_gen.go")
	cards := []ArenaCard{
		{GrpID: 100, Name: "Test Card", Set: "tst", Rarity: "rare"},
		{GrpID: 9, Name: `Name with "quotes" and \backslash`, Set: "abc", Rarity: "common"},
		{GrpID: 70123, Name: "Æther, the Long One", Set: "neo", Rarity: "mythic"},
	}

	if err := generateParserData(path, cards); err != nil {
		t.Fatalf("generateParserData: %v", err)
	}

	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read generated file: %v", err)
	}

	want, err := format.Source(got)
	if err != nil {
		t.Fatalf("generated file is not valid Go: %v", err)
	}

	if string(want) != string(got) {
		t.Errorf("generated file is not gofmt-canonical: got %d bytes, gofmt wants %d bytes",
			len(got), len(want))
	}
}

// The generator must be deterministic: identical input → byte-identical
// output, with no wall-clock/nondeterministic content. This is the
// load-bearing anti-churn invariant — `just datagen-magic` opens a PR
// only when the regenerated file differs, so a reintroduced timestamp
// (the old `// Generated: <time.Now()>` header) would make every
// scheduled run churn a spurious PR.
func TestGenerateParserDataIsDeterministic(t *testing.T) {
	cards := []ArenaCard{
		{GrpID: 100, Name: "Test Card", Set: "tst", Rarity: "rare"},
		{GrpID: 9, Name: `Name with "quotes" and \backslash`, Set: "abc", Rarity: "common"},
		{GrpID: 70123, Name: "Æther, the Long One", Set: "neo", Rarity: "mythic"},
	}

	read := func() []byte {
		p := filepath.Join(t.TempDir(), "arena_cards_gen.go")
		if err := generateParserData(p, cards); err != nil {
			t.Fatalf("generateParserData: %v", err)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("read generated file: %v", err)
		}
		return b
	}

	first := read()
	second := read()
	if !bytes.Equal(first, second) {
		t.Errorf("generator is not deterministic: two runs with identical input differ (%d vs %d bytes)",
			len(first), len(second))
	}
	if bytes.Contains(first, []byte("Generated:")) {
		t.Error(`generated file contains a nondeterministic "Generated:" line; ` +
			"datagen-magic's no-diff no-op depends on byte-stable output")
	}
}
