#!/bin/bash
# Build ~/Applications/DSH.app — a native launcher around the desktop kit.
# Idempotent: re-running overwrites the bundle in place. Release packages carry
# a prebuilt launcher; source checkouts compile the tiny launcher with clang.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Applications/DSH.app"
CONTENTS="$APP_DIR/Contents"

mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
cp "$REPO_DIR/app/Info.plist" "$CONTENTS/Info.plist"

# Signed Mach-O files must be installed through a new inode. In-place cp over
# an executable that macOS has already launched can retain the old vnode code
# signature cache and make the replacement die with SIGKILL (Code Signature
# Invalid), even while `codesign --verify` reports that the file is valid.
install_executable_atomically() {
  local source="$1"
  local target="$2"
  local target_dir
  local staged
  target_dir="$(dirname "$target")"
  staged="$(mktemp "$target_dir/.${target##*/}.install.XXXXXX")"
  if ! cp "$source" "$staged" || ! chmod 0755 "$staged" || ! mv -f "$staged" "$target"; then
    rm -f "$staged"
    return 1
  fi
}

# LaunchServices must see a Mach-O CFBundleExecutable. If this were a shell
# script, macOS would hand the bundle to Terminal.app. Release tarballs stage
# the matching arm64 binary under bin/; source checkouts build the same source
# locally when Xcode Command Line Tools are available.
LAUNCHER_BIN="$REPO_DIR/bin/dsh-launcher"
if [ -f "$LAUNCHER_BIN" ]; then
  install_executable_atomically "$LAUNCHER_BIN" "$CONTENTS/MacOS/dsh-launcher"
elif [ "$(uname -s)" = "Darwin" ] && command -v clang >/dev/null 2>&1; then
  LAUNCHER_STAGE="$(mktemp "$CONTENTS/MacOS/.dsh-launcher.build.XXXXXX")"
  if ! clang -O2 -Wall -Wextra -mmacosx-version-min=13.0 \
    "$REPO_DIR/app/dsh-launcher.c" -o "$LAUNCHER_STAGE"; then
    rm -f "$LAUNCHER_STAGE"
    exit 1
  fi
  chmod 0755 "$LAUNCHER_STAGE"
  mv -f "$LAUNCHER_STAGE" "$CONTENTS/MacOS/dsh-launcher"
else
  echo "error: no native dsh-launcher binary; install the macOS release package or Xcode Command Line Tools" >&2
  exit 1
fi
chmod 0755 "$CONTENTS/MacOS/dsh-launcher"
cp "$REPO_DIR/app/dsh-launcher.sh" "$CONTENTS/Resources/dsh-launcher.sh"
chmod 0755 "$CONTENTS/Resources/dsh-launcher.sh"

# Release plugin packages carry the matching native shell under bin/. Keep a
# copy inside the app bundle as well, so the clickable app remains usable even
# if ~/.dsh/bin is later moved or cleaned. Source checkouts without bin/ keep
# using the traditional ~/.dsh/bin installation path.
if [ -f "$REPO_DIR/bin/dsh-desktop-kit" ]; then
  install_executable_atomically \
    "$REPO_DIR/bin/dsh-desktop-kit" \
    "$CONTENTS/Resources/dsh-desktop-kit"
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
