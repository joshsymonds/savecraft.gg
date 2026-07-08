package main

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"io"
	"strings"
)

// GamePoE and GamePoE2 identify which Path of Building fork a build
// belongs to. Every pob-server request that touches a LuaJIT process
// routes through one of these — see DetectBuildGame and Server.poolFor.
const (
	GamePoE  = "poe"
	GamePoE2 = "poe2"
)

// DetectBuildGame inspects a decoded build XML document's root element to
// determine which game it belongs to. PoE1 build codes root at
// <PathOfBuilding>; PoE2 (Path of Building 2) build codes root at
// <PathOfBuilding2> — confirmed against PathOfBuildingCommunity/PathOfBuilding-PoE2
// (Modules/Build.lua's LoadBuildFromXML, which errors on any other root).
// Returns an error for any other root element or malformed XML.
func DetectBuildGame(xmlText string) (string, error) {
	decoder := xml.NewDecoder(strings.NewReader(xmlText))
	for {
		tok, err := decoder.Token()
		if err != nil {
			return "", fmt.Errorf("reading build XML root element: %w", err)
		}
		start, ok := tok.(xml.StartElement)
		if !ok {
			continue
		}
		switch start.Name.Local {
		case "PathOfBuilding":
			return GamePoE, nil
		case "PathOfBuilding2":
			return GamePoE2, nil
		default:
			return "", fmt.Errorf("unrecognized build root element %q", start.Name.Local)
		}
	}
}

// detectBuildGameOrDefault is DetectBuildGame with a GamePoE fallback for
// XML whose root element isn't recognized. Used at call sites that read
// already-stored/cached build XML (modify, nearby, audit, compare,
// /resolve's internal-URL path) rather than freshly-supplied external
// input. Those rows were already validated at creation time (they went
// through the strict path in handleCalc or resolveExternal to get
// stored), so a row that somehow doesn't parse as either root — most
// commonly a test's synthetic placeholder XML like "<A/>", never a real
// production build — defaults to poe1 instead of turning a previously
// working request into a new failure mode. Call sites that validate
// freshly supplied XML (handleCalc, resolveExternal) use the strict
// DetectBuildGame instead, so genuinely malformed input is still
// rejected with a clear error before ever reaching a LuaJIT process.
func detectBuildGameOrDefault(xmlText string) string {
	game, err := DetectBuildGame(xmlText)
	if err != nil {
		return GamePoE
	}
	return game
}

// DecodeBuildCode decodes a PoB build code (URL-safe base64 of zlib-compressed XML).
func DecodeBuildCode(code string) (string, error) {
	// PoB uses URL-safe base64: - → +, _ → /
	code = strings.ReplaceAll(code, "-", "+")
	code = strings.ReplaceAll(code, "_", "/")

	// Add padding if needed
	switch len(code) % 4 {
	case 2:
		code += "=="
	case 3:
		code += "="
	}

	compressed, err := base64.StdEncoding.DecodeString(code)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}

	reader, err := zlib.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return "", fmt.Errorf("zlib init: %w", err)
	}
	defer reader.Close()

	// Limit decompressed size to prevent decompression bombs.
	const maxDecompressedSize = 10 * 1024 * 1024 // 10 MB
	limited := io.LimitReader(reader, maxDecompressedSize+1)
	xml, err := io.ReadAll(limited)
	if err != nil {
		return "", fmt.Errorf("zlib decompress: %w", err)
	}
	if len(xml) > maxDecompressedSize {
		return "", fmt.Errorf("decompressed build exceeds %d byte limit", maxDecompressedSize)
	}

	return string(xml), nil
}

// EncodeBuildCode encodes XML into a PoB build code.
func EncodeBuildCode(xml string) (string, error) {
	var buf bytes.Buffer
	writer := zlib.NewWriter(&buf)
	if _, err := writer.Write([]byte(xml)); err != nil {
		return "", fmt.Errorf("zlib compress: %w", err)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("zlib close: %w", err)
	}

	code := base64.StdEncoding.EncodeToString(buf.Bytes())
	// Convert to URL-safe
	code = strings.ReplaceAll(code, "+", "-")
	code = strings.ReplaceAll(code, "/", "_")
	// Strip padding
	code = strings.TrimRight(code, "=")

	return code, nil
}
