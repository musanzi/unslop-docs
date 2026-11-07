#!/usr/bin/env bash
set -euo pipefail

cd "$HOME/unslop-docs"

report_failure() {
  result=$?
  docker compose -f compose.prod.yml -p unslopy ps --all >&2 || true
  docker compose -f compose.prod.yml -p unslopy logs --tail 80 renderer detector >&2 || true
  for container in $(docker compose -f compose.prod.yml -p unslopy ps --all -q renderer detector); do
    docker inspect --format '{{json .State}}' "$container" >&2 || true
  done
  free -h >&2 || true
  df -h . >&2 || true
  exit "$result"
}
trap report_failure ERR

git fetch origin main
git checkout main
git merge --ff-only origin/main
docker compose -f compose.prod.yml -p unslopy build
docker compose -f compose.prod.yml -p unslopy up -d --wait --wait-timeout 1200 db redis renderer detector
docker compose -f compose.prod.yml -p unslopy stop worker api

umask 077
backup_dir="$HOME/unslop-backups/$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
mkdir -p "$backup_dir"
docker compose -f compose.prod.yml -p unslopy exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' < /dev/null > "$backup_dir/database.dump"
docker compose -f compose.prod.yml -p unslopy run --rm --no-deps -T api tar -C /app/private-documents -czf - . < /dev/null > "$backup_dir/documents.tar.gz"
echo "Database and document backup saved to $backup_dir"

docker compose -f compose.prod.yml -p unslopy run --rm --no-deps -T api node_modules/.bin/typeorm migration:run -d dist/apps/api/src/modules/database/orm.config.js < /dev/null
docker compose -f compose.prod.yml -p unslopy up -d --remove-orphans --wait --wait-timeout 120
docker compose -f compose.prod.yml -p unslopy run --rm --no-deps -T api node tools/smoke-document-workflow.cjs pages < /dev/null
docker compose -f compose.prod.yml -p unslopy run --rm --no-deps -T worker node tools/smoke-document-workflow.cjs provider < /dev/null
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
