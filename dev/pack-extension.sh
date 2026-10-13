#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/manifest.json','utf8')).version")"
NAME="wechat-md-paste-${VERSION}"
OUT="$ROOT/dist/$NAME"
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT/manifest.json" "$OUT/"
cp -R "$ROOT/src" "$ROOT/icons" "$OUT/"
(
  cd "$ROOT/dist"
  rm -f "${NAME}.zip"
  zip -rq "${NAME}.zip" "$NAME"
)
echo "Packed: $OUT"
echo "Zip:    $ROOT/dist/${NAME}.zip"
echo "Chrome: load unpacked extension from dist/${NAME}/"
