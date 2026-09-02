#!/usr/bin/env bash
# Prefer Turbopack — webpack OOMs/silently dies on /ecosystem for some machines.
set -euo pipefail
cd "$(dirname "$0")"
if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
fi
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=16384"
echo "Pierron dapp (Turbopack). First open of a route may take a bit — do not Ctrl+C."
exec npx next dev --turbopack --port 3000
