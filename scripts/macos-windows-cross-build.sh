#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop-tauri"
LLVM_BIN="/opt/homebrew/opt/llvm/bin"
LLD_BIN="/opt/homebrew/opt/lld/bin"
TARGET="x86_64-pc-windows-msvc"

missing=()

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    missing+=("$1")
  fi
}

require_file() {
  if [[ ! -x "$1" ]]; then
    missing+=("$1")
  fi
}

require_command pnpm
require_command cargo-xwin
require_file "$LLVM_BIN/llvm-lib"
require_file "$LLD_BIN/lld-link"

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing tools for macOS -> Windows cross build:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo >&2
  echo "Install the expected toolchain:" >&2
  echo "  cargo install cargo-xwin" >&2
  echo "  brew install llvm lld" >&2
  exit 1
fi

if ! rustup target list --installed | grep -qx "$TARGET"; then
  echo "Installing Rust target $TARGET..."
  rustup target add "$TARGET"
fi

export PATH="$LLD_BIN:$LLVM_BIN:$PATH"

pnpm --dir "$DESKTOP_DIR" exec tauri build \
  --runner cargo-xwin \
  --target "$TARGET" \
  --no-bundle

echo
echo "Built Windows app:"
echo "  $ROOT_DIR/target/$TARGET/release/codexbar-desktop-tauri.exe"
