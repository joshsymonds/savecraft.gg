package main

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
)

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

	xml, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("zlib decompress: %w", err)
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
