#!/usr/bin/env bash
# Builds dist/orbit-hop.zip with index.html at the root of the archive,
# ready to upload when YouTube asks for the game bundle.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/orbit-hop.zip
(cd game && python3 -m zipfile -c ../dist/orbit-hop.zip index.html style.css js)
echo "Built dist/orbit-hop.zip ($(du -h dist/orbit-hop.zip | cut -f1))"
