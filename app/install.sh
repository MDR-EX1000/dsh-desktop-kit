#!/bin/bash
# Build ~/Applications/DSH.app — a clickable wrapper around the desktop kit.
# Idempotent: re-running overwrites the bundle in place. macOS built-ins only.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Applications/DSH.app"
CONTENTS="$APP_DIR/Contents"

mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
cp "$REPO_DIR/app/Info.plist" "$CONTENTS/Info.plist"
cp "$REPO_DIR/app/dsh-launcher" "$CONTENTS/MacOS/dsh-launcher"
chmod +x "$CONTENTS/MacOS/dsh-launcher"

# Release plugin packages carry the matching native shell under bin/. Keep a
# copy inside the app bundle as well, so the clickable app remains usable even
# if ~/.dsh/bin is later moved or cleaned. Source checkouts without bin/ keep
# using the traditional ~/.dsh/bin installation path.
if [ -x "$REPO_DIR/bin/dsh-desktop-kit" ]; then
  cp "$REPO_DIR/bin/dsh-desktop-kit" "$CONTENTS/Resources/dsh-desktop-kit"
  chmod +x "$CONTENTS/Resources/dsh-desktop-kit"
fi

# icon.icns from the shell artwork (sips + iconutil ship with macOS).
ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$REPO_DIR/shell/icons/icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$REPO_DIR/shell/icons/icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/icon.icns"
rm -rf "$(dirname "$ICONSET")"

touch "$APP_DIR" # nudge LaunchServices to pick up the refresh
echo "installed: $APP_DIR"
