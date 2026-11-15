#!/usr/bin/env bash
set -euo pipefail

# Populate Redis with the complete Laorvia dataset.
# Override connection via environment variables:
#   REDIS_HOST=127.0.0.1 REDIS_PORT=6379 REDIS_PASSWORD="" REDIS_DB=0 ./scripts/seed-redis.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/seed-redis.mjs" "$@"
else
  echo "Error: Node.js is required to run seed-redis.mjs." >&2
  exit 1
fi
