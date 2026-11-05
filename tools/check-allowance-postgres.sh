#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="${1:-unslopy-api-1}"
verification_dir="$(docker exec "$container" mktemp -d /tmp/unslopy-allowance.XXXXXXXX)"
trap 'docker exec "$container" rm -rf "$verification_dir"' EXIT
tar -cf - apps/api/src apps/api/tsconfig.json tsconfig.base.json package.json tools/check-allowance-postgres.cjs |
  docker exec -i "$container" tar -xf - -C "$verification_dir"
docker exec "$container" ln -s /app/node_modules "$verification_dir/node_modules"
docker exec -w "$verification_dir" "$container" node tools/check-allowance-postgres.cjs
