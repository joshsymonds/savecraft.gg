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
