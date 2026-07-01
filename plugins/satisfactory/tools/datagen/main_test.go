package main

import (
	"go/format"
	"os"
	"testing"
)

// Generated files must be gofmt-formatted: fmt-go-check runs goimports over
// the whole repo, including generated data tables.
func TestWriteEmitsFormattedSource(t *testing.T) {
	g := &generator{outDir: t.TempDir()}
	g.write("sample_gen.go", "var Sample = map[string]int{\n\"a\": 1,\n\"longer_key\": 2,\n}\n")

	got, err := os.ReadFile(g.outDir + "/sample_gen.go")
	if err != nil {
		t.Fatal(err)
	}
	want, err := format.Source(got)
	if err != nil {
		t.Fatalf("generated file does not parse: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("generated file is not gofmt-formatted:\ngot:\n%s\nwant:\n%s", got, want)
	}
}
