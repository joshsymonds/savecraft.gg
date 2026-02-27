#!/usr/bin/env bash
# Generate a JSON manifest of all signed WASM plugins for R2.
# Usage: generate-plugin-manifest.sh <version>
# Outputs JSON to stdout.
set -euo pipefail

VERSION="${1:?Usage: generate-plugin-manifest.sh <version>}"

echo "{"

first=true
for wasm in plugins/*/*.wasm; do
    [ -f "$wasm" ] || continue
    game_id=$(basename "$(dirname "$wasm")")
    sha256=$(sha256sum "$wasm" | awk '{print $1}')

    if [ "$first" = true ]; then
        first=false
    else
        echo ","
    fi

    cat <<EOF
  "${game_id}": {
    "version": "${VERSION}",
    "sha256": "${sha256}",
    "url": "plugins/${game_id}/parser.wasm"
  }
EOF
done

echo ""
echo "}"
