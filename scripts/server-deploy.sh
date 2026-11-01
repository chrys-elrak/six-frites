#!/bin/sh
# Runs on the server from /root/six-frites, under the deploy lock. Builds while the running containers keep
# serving, migrates, then replaces the two API and the two web containers one at a time, waiting for each to be
# healthy, so one of every pair is always answering behind Traefik.
set -eu

compose() { docker compose -f docker-compose.prod.yml "$@"; }

cp infra/traefik/six-frites.yml /root/traefik/config/dynamic/
docker ps -a --format '{{.Names}}' | grep -E '^[0-9a-f]{12}_six-frites-' | xargs -r docker rm -f

compose build api
compose up -d --no-build postgres redis storage
compose run --rm --no-deps worker npx prisma migrate deploy

for service in api-2 api web-2 web; do
  compose up -d --no-build --no-deps --wait --wait-timeout 180 "$service"
done
compose up -d --no-build
