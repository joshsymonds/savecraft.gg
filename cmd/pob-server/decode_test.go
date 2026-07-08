package main

import (
	"strings"
	"testing"
)

func TestDecodeBuildCodeRoundTrip(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="99" className="Witch"/></PathOfBuilding>`

	code, err := EncodeBuildCode(xml)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}

	if strings.ContainsAny(code, "+/=") {
		t.Fatalf("code should be URL-safe, got: %s", code)
	}

	decoded, err := DecodeBuildCode(code)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}

	if decoded != xml {
		t.Fatalf("round-trip mismatch:\n  want: %s\n  got:  %s", xml, decoded)
	}
}

func TestDecodeBuildCodeInvalid(t *testing.T) {
	_, err := DecodeBuildCode("not-valid-base64!!!")
	if err == nil {
		t.Fatal("expected error for invalid input")
	}
}

func TestDecodeBuildCodeHandlesPadding(t *testing.T) {
	xml := "<PathOfBuilding/>"

	code, err := EncodeBuildCode(xml)
	if err != nil {
		t.Fatal(err)
	}

	// Ensure no padding in encoded form
	if strings.HasSuffix(code, "=") {
		t.Fatal("encoded form should not have padding")
	}

	decoded, err := DecodeBuildCode(code)
	if err != nil {
		t.Fatalf("decode without padding: %v", err)
	}
	if decoded != xml {
		t.Fatalf("mismatch: %q != %q", decoded, xml)
	}
}

func TestDetectBuildGamePoE1(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding><Build level="99" className="Witch"/></PathOfBuilding>`
	game, err := DetectBuildGame(xml)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if game != GamePoE {
		t.Fatalf("expected game %q, got %q", GamePoE, game)
	}
}

func TestDetectBuildGamePoE2(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding2><Build level="1" className="Monk"/></PathOfBuilding2>`
	game, err := DetectBuildGame(xml)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if game != GamePoE2 {
		t.Fatalf("expected game %q, got %q", GamePoE2, game)
	}
}

func TestDetectBuildGameUnrecognizedRoot(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><SomethingElse/>`
	_, err := DetectBuildGame(xml)
	if err == nil {
		t.Fatal("expected error for unrecognized root element")
	}
}

func TestDetectBuildGameMalformedXML(t *testing.T) {
	_, err := DetectBuildGame("not xml at all")
	if err == nil {
		t.Fatal("expected error for malformed XML")
	}
}

func TestDetectBuildGameOrDefaultFallsBackToPoE(t *testing.T) {
	// Synthetic placeholder XML, as used throughout the existing test
	// suite for builds whose content doesn't matter (the mocked Lua
	// process ignores it) — must default to poe1, not error.
	if game := detectBuildGameOrDefault("<A/>"); game != GamePoE {
		t.Fatalf("expected fallback to %q, got %q", GamePoE, game)
	}
}

func TestDetectBuildGameOrDefaultRecognizesPoE2(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><PathOfBuilding2><Build level="1"/></PathOfBuilding2>`
	if game := detectBuildGameOrDefault(xml); game != GamePoE2 {
		t.Fatalf("expected %q, got %q", GamePoE2, game)
	}
}
