#!/bin/bash
# build.sh - Build script for aGTM
# Generates minified JS files and the Base64-encoded sGTM version.
#
# Usage:
#   ./build.sh          Build all files
#   ./build.sh --check  Dry run: only check if build tools are available
#
# Requirements: Bun (https://bun.sh) — installs terser on first run via bunx

set -e

TERSER="bunx terser"
TERSER_OPTS="--ecma 5 --keep-fnames --compress --mangle"

# ── Preflight checks ────────────────────────────────────────────────────────

if ! command -v bun &>/dev/null; then
  echo "ERROR: bun not found. Install Bun (Arch: sudo pacman -S bun)." >&2
  exit 1
fi

if [ "$1" = "--check" ]; then
  echo "OK: bun $(bun --version), terser available via bunx"
  exit 0
fi

# ── Inject version from VERSION file into aGTM.js and package.json ───────────

echo "Injecting version..."
bun run scripts/inject-version.js

# ── Safety check: no uncommented aGTM.f.init() in aGTM.js ───────────────────
# The source must NOT contain an active init call (only commented ones).
# Strips block and line comments before checking.
# See CLAUDE.md, section "The aGTM.f.init() situation".

ACTIVE_INIT=$(bun run scripts/check-init.js)
if [ "$ACTIVE_INIT" = "found" ]; then
  echo "ERROR: Uncommented aGTM.f.init() found in aGTM.js." >&2
  echo "       Comment it out or remove it before building." >&2
  exit 1
fi

# ── Minify aGTM.js ──────────────────────────────────────────────────────────

echo "Building aGTM.min.js..."
$TERSER aGTM.js $TERSER_OPTS --output aGTM.min.js
echo "  Done: aGTM.min.js ($(wc -c < aGTM.min.js) bytes)"

# ── Minify CMP files ─────────────────────────────────────────────────────────

echo "Building cmp/*.min.js..."
for src in cmp/cc_*.js; do
  [[ "$src" == *.min.js ]] && continue
  out="${src%.js}.min.js"
  $TERSER "$src" $TERSER_OPTS --output "$out"
  echo "  Done: $out ($(wc -c < "$out") bytes)"
done

# ── Base64-encode aGTM.min.js ─────────────────────────────────────────────────

echo "Building aGTM.base64..."
base64 -w 0 aGTM.min.js > aGTM.base64
echo "  Done: aGTM.base64 ($(wc -c < aGTM.base64) bytes)"

# ── Inject base64 + version into sGTM client template ────────────────────────

echo "Updating sgtmClient/template.tpl..."
bun run scripts/update-sgtm-template.js

echo ""
echo "Build complete."
