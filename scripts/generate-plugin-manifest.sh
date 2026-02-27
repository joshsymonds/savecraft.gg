#!/usr/bin/env bash
# Generate aggregate plugin manifest from plugin.toml files.
# Requires built .wasm files to exist.
# Usage: generate-plugin-manifest.sh <out-file>
set -euo pipefail

OUT="${1:?Usage: generate-plugin-manifest.sh <out-file>}"
go run ./cmd/plugin-manifest/ --aggregate "$OUT"
