#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/unslop-docs"
git fetch origin main
git checkout main
git reset --hard origin/main
docker compose -f compose.prod.yml -p unslopy build
docker compose -f compose.prod.yml -p unslopy up -d --remove-orphans
docker compose -f compose.prod.yml -p unslopy exec -T api node_modules/.bin/typeorm migration:run -d dist/apps/api/src/modules/database/orm.config.js
docker image prune -f

api_port="$(grep -E '^API_PORT=' .env | cut -d= -f2)"
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:${api_port:-8000}/health" > /dev/null; then
    echo "API is healthy"
    exit 0
  fi
  sleep 2
done

echo "API health check failed" >&2
docker compose -f compose.prod.yml -p unslopy logs --tail 50 api >&2
exit 1
