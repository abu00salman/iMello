#!/usr/bin/env bash
# Builds the GitHub Pages site:   <base>        landing page (apps/landing, plain static files)
#                                  <base>app/    the iMello web app (apps/web)
#                                  <base>sw.js   the service worker, kept at the site root so push
#                                                subscriptions registered before the landing page existed keep working
#
#   scripts/assemble-pages.sh /Wanas/ site
#
# API/homeserver URLs come from the environment (VITE_API_URL, VITE_HOMESERVER_URL), as for the app build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:?usage: assemble-pages.sh <base, e.g. /Wanas/> <empty output dir>}"
OUT="${2:?usage: assemble-pages.sh <base, e.g. /Wanas/> <empty output dir>}"
case "$BASE" in /|/*/) ;; *) echo "base must start and end with / (got: $BASE)" >&2; exit 1 ;; esac
if [[ -e "$OUT" ]]; then echo "$OUT already exists; give an empty/new folder" >&2; exit 1; fi

cd "$ROOT"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
pnpm --filter @imello/web exec tsc --noEmit
# Build straight into the output folder: apps/web/dist (used by the local preview and the browser tests) stays untouched.
VITE_BASE="${BASE}app/" VITE_SW_BASE="$BASE" VITE_CSP_META="${VITE_CSP_META:-true}" \
  pnpm --filter @imello/web exec vite build --outDir "$OUT/app" --emptyOutDir
tar -C apps/landing --exclude=build.mjs --exclude=.taste-skill --exclude=node_modules -cf - . | tar -C "$OUT" -xf -
cp "$OUT/app/sw.js" "$OUT/sw.js"
echo "Site assembled in $OUT (landing: ${BASE}, app: ${BASE}app/)"
