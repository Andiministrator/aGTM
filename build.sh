#!/bin/bash
# build.sh - Build script for aGTM
# Generates minified JS files and the Base64-encoded sGTM version.
#
# Usage:
#   ./build.sh          Build all files
#   ./build.sh --check  Dry run: only check if build tools are available
#
# Requirements: Node.js + npm, terser (npm install)

set -e

TERSER="node ./node_modules/terser/bin/terser"
TERSER_OPTS="--ecma 5 --keep-fnames --compress --mangle"

# ── Preflight checks ────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "ERROR: node not found. Install Node.js (Arch: sudo pacman -S nodejs)." >&2
  exit 1
fi

if [ ! -f "./node_modules/terser/bin/terser" ]; then
  echo "ERROR: terser not found. Run: npm install --no-bin-links" >&2
  exit 1
fi

if [ "$1" = "--check" ]; then
  echo "OK: node $(node --version), terser available"
  exit 0
fi

# ── Safety check: no uncommented aGTM.f.init() in aGTM.js ───────────────────
# The source must NOT contain an active init call (only commented ones).
# Uses Node.js to strip block comments and line comments before checking,
# because a simple grep cannot reliably detect multi-line block comments.
# See CLAUDE.md, section "The aGTM.f.init() situation".

ACTIVE_INIT=$(node -e "
  var fs = require('fs');
  var code = fs.readFileSync('aGTM.js', 'utf8');
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  code = code.replace(/\/\/.*/g, '');
  if (/aGTM\.f\.init\s*\(\s*\)/.test(code)) { process.stdout.write('found'); }
")
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
  # Skip already-minified files
  [[ "$src" == *.min.js ]] && continue
  out="${src%.js}.min.js"
  $TERSER "$src" $TERSER_OPTS --output "$out"
  echo "  Done: $out ($(wc -c < "$out") bytes)"
done

# ── Base64-encode aGTM.min.js ─────────────────────────────────────────────────

echo "Building aGTM.base64..."
base64 -w 0 aGTM.min.js > aGTM.base64
echo "  Done: aGTM.base64 ($(wc -c < aGTM.base64) bytes)"

echo ""
echo "Build complete."
