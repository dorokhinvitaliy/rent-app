#!/bin/bash
set -Eeuo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 077
revision=${1:-}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a commit SHA'; exit 2; }
exec 9>/run/lock/rent-deploy.lock
flock -n 9 || { echo 'Deployment is already running'; exit 1; }
repo=/opt/rent-repository.git
mkdir -p /opt/rent-releases
[ -d "$repo" ] || git init --bare "$repo"
git --git-dir="$repo" fetch --force https://github.com/dorokhinvitaliy/rent-app.git refs/heads/main:refs/heads/main
head=$(git --git-dir="$repo" rev-parse refs/heads/main)
if [ "$head" != "$revision" ]; then echo 'A newer main commit exists; skipping outdated deployment'; exit 0; fi
previous=$(readlink -f /opt/rent-app)
release=/opt/rent-releases/$revision
if [ "$previous" = "$release" ]; then echo 'This revision is already deployed'; exit 0; fi
mkdir -p "$release"
git --git-dir="$repo" archive "$revision" | tar -x -C "$release"
cp /etc/rent-app.env "$release/.env"
printf '\nRENT_IMAGE=rent-app-app:%s\n' "$revision" >> "$release/.env"
compose() { docker compose --project-name rent-app --project-directory "$1" -f "$1/compose.yaml" "${@:2}"; }
compose "$release" config --quiet
compose "$release" build app
/bin/sh "$previous/deploy/backup.sh"
rollback() {
  echo 'Deployment failed; restoring previous application image (database is preserved)'
  compose "$previous" up -d --no-build
}
if ! compose "$release" up -d --no-build --wait --wait-timeout 90; then rollback; exit 1; fi
if ! curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors --max-time 10 https://place.athing.pro/api/health; then rollback; exit 1; fi
ln -s "$release" /opt/rent-app.next
mv -Tf /opt/rent-app.next /opt/rent-app
printf '%s\n' "$revision" > /opt/rent-deployed-sha
# Keep the active and two previous release directories/images; application data
# and SQLite backups live in a separate named volume and are never removed.
python3 - "$release" "$previous" <<'PY'
import pathlib,re,shutil,subprocess,sys
root=pathlib.Path('/opt/rent-releases')
releases=sorted((p for p in root.iterdir() if p.is_dir() and re.fullmatch('[0-9a-f]{40}',p.name)),key=lambda p:p.stat().st_mtime,reverse=True)
keep={*sys.argv[1:],*(str(p) for p in releases[:3])}
for p in releases:
 if str(p) not in keep:
  subprocess.run(['docker','image','rm','rent-app-app:'+p.name],check=False)
  shutil.rmtree(p)
PY
docker builder prune -f --keep-storage 3GB >/dev/null || true
echo "Deployed $revision to https://place.athing.pro"
