#!/bin/sh
set -eu
cd /opt/rent-app
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T app mkdir -p /data/backups
docker compose exec -T app sqlite3 /data/rent.sqlite ".backup '/data/backups/rent-$stamp.sqlite'"
docker compose exec -T app sqlite3 "/data/backups/rent-$stamp.sqlite" 'PRAGMA integrity_check;'
docker compose exec -T app find /data/backups -type f -name 'rent-*.sqlite' -mtime +14 -delete
