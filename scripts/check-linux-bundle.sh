#!/usr/bin/env bash
# The Linux packages in <folder> carry the Node.js runtime the backend needs, still executable after packaging:
# the .deb (unpacked) and the AppImage (extracted) each run `node --version` from the app's resource folder.
set -euo pipefail
dir=$(cd "$1" && pwd)
work=$(mktemp -d)
cd "$work"

deb=$(ls "$dir"/*_amd64.deb)
dpkg-deb -x "$deb" deb
node=$(find deb -path '*/kv-vault/node' -type f | head -n1)
test -n "$node" || { echo "no node in $deb"; find deb -maxdepth 4; exit 1; }
echo "deb: $node → $("$node" --version)"
test -f "$(dirname "$node")/backend.mjs" || { echo "no backend.mjs next to node in the .deb"; exit 1; }

app=$(ls "$dir"/*_amd64.AppImage 2>/dev/null || true)
if [ -n "$app" ]; then
  cp "$app" app.AppImage && chmod +x app.AppImage
  ./app.AppImage --appimage-extract >/dev/null
  node=$(find squashfs-root -path '*/kv-vault/node' -type f | head -n1)
  test -n "$node" || { echo "no node in $app"; exit 1; }
  echo "AppImage: $node → $("$node" --version)"
fi
