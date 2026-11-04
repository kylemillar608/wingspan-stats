#!/bin/bash
# Re-renders the link-preview image and home-screen icons from assets/src/
# using headless Google Chrome (macOS path). Run from the repo root:
#   bash scripts/render-images.sh
set -euo pipefail
CH="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="$(mktemp -d)"
shot() { "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
  --window-size="$2" --virtual-time-budget=8000 --screenshot="$3" "file://$ROOT/assets/src/$1" >/dev/null 2>&1; }
shot "og-image.html" 1200,630 "$ROOT/assets/og-image.png"
shot "icon.html?size=512" 512,512 "$ROOT/assets/icon-512.png"
shot "icon.html?size=512&maskable=1" 512,512 "$ROOT/assets/icon-maskable-512.png"
sips -z 192 192 "$ROOT/assets/icon-512.png" --out "$ROOT/assets/icon-192.png" >/dev/null
sips -z 180 180 "$ROOT/assets/icon-512.png" --out "$ROOT/assets/apple-touch-icon.png" >/dev/null
rm -rf "$PROFILE"
echo "Rendered: og-image.png, icon-512.png, icon-maskable-512.png, icon-192.png, apple-touch-icon.png"
