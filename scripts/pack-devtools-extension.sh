#!/usr/bin/env bash
#
# pack-devtools-extension.sh — bundle devtools-extension/ into a downloadable ZIP.
#
# Produces ./aGTM-Inspector.zip at the repo root. The archive extracts to a single
# top-level folder "aGTM-Inspector/" containing manifest.json, so a user can grab
# the ZIP from GitHub, unzip it, and point Chrome's "Load unpacked" at that folder
# without cloning the repo.
#
# The aGTM Inspector is NOT on the ES5/build.sh path (own browser context), so this
# packaging step is deliberately standalone and is NOT wired into build.sh. Re-run
# it after any change under devtools-extension/ — the committed ZIP is a derived
# artifact and must be regenerated so it does not drift from source.
#
# Usage:  ./scripts/pack-devtools-extension.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/devtools-extension"
OUT="$REPO_ROOT/aGTM-Inspector.zip"
NAME="aGTM-Inspector"

if [ ! -f "$SRC/manifest.json" ]; then
  echo "error: $SRC/manifest.json not found — run from the aGTM repo." >&2
  exit 1
fi

command -v zip >/dev/null 2>&1 || { echo "error: 'zip' is not installed." >&2; exit 1; }

VERSION="$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SRC/manifest.json" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$NAME"

# Copy the extension, excluding derived/OS noise. Keep README.md — it documents install.
( cd "$SRC" && find . -type f \
    ! -name '.DS_Store' \
    ! -name '*.zip' \
    -print0 | sort -z | while IFS= read -r -d '' f; do
      mkdir -p "$STAGE/$NAME/$(dirname "$f")"
      cp "$f" "$STAGE/$NAME/$f"
    done )

rm -f "$OUT"
# -X strips extra file attributes for a leaner, more stable archive.
( cd "$STAGE" && zip -rqX "$OUT" "$NAME" )

echo "Wrote $OUT  (aGTM Inspector v${VERSION:-?})"
echo "Contents:"
( cd "$STAGE" && zip -sf "$OUT" | sed 's/^/  /' )
