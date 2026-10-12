#!/usr/bin/env bash
set -euo pipefail
bash /opt/morphiume/deploy/staging/assert-boundaries.sh
umask 077
[[ $# == 2 ]] || { echo 'Usage: deploy.sh VERIFIED_SOURCE_COMMIT IMMUTABLE_IMAGE' >&2; exit 1; }
cd /opt/morphiume
expected_commit="$1"
image="$2"
[[ "$expected_commit" =~ ^[a-f0-9]{40}$ && "$(git rev-parse HEAD)" == "$expected_commit" ]] || { echo 'Checkout must match the verified source commit.' >&2; exit 1; }
exec 9>/srv/morphiume/staging/deploy.lock
flock -n 9 || { echo 'Another staging deployment is running.' >&2; exit 1; }
export MORPHIUME_IMAGE="$image"
compose=(docker compose --project-name morphiume-staging --env-file /etc/morphiume-staging/deploy.env -f deploy/staging/compose.yaml)
if [[ "${MORPHIUME_KEEP_DB_TUNNEL:-0}" == 1 ]]; then
  compose+=(-f deploy/staging/compose.integration.yaml)
fi
[[ "$image" =~ (^sha256:[a-f0-9]{64}$|@sha256:[a-f0-9]{64}$) ]] || { echo 'Set an immutable tested image digest or loaded image ID.' >&2; exit 1; }
findmnt --mountpoint /srv/morphiume/postgres --noheadings >/dev/null
"${compose[@]}" config --quiet
"${compose[@]}" pull db
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker pull "$image"
fi
revision="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "$revision" == "$expected_commit" ]] || { echo 'Image source revision does not match verified source.' >&2; exit 1; }
printf 'MORPHIUME_IMAGE=%s\n' "$image" > /etc/morphiume-staging/deploy.env.updated
chmod 0600 /etc/morphiume-staging/deploy.env.updated
mv /etc/morphiume-staging/deploy.env.updated /etc/morphiume-staging/deploy.env
if [[ -f /etc/morphiume-staging/deployed-image-id ]]; then
  install -m 0600 /etc/morphiume-staging/deployed-image-id /etc/morphiume-staging/previous-image-id
fi
if [[ -f /etc/morphiume-staging/deployed-source-commit ]]; then
  install -m 0600 /etc/morphiume-staging/deployed-source-commit /etc/morphiume-staging/previous-source-commit
fi
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180 db
# Stop writers before changing the schema; preserve all data and previous image.
"${compose[@]}" stop app worker
bash deploy/staging/backup.sh
"${compose[@]}" run --rm --no-deps migrate
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180 app worker
curl --fail --silent --show-error --max-time 10 --output /dev/null http://127.0.0.1:3001/api/health/ready
docker image inspect "$image" --format '{{.Id}}' > /etc/morphiume-staging/deployed-image-id
git rev-parse HEAD > /etc/morphiume-staging/deployed-source-commit
echo 'Staging app and worker are healthy. Verify through the SSH tunnel and record release evidence.'
