#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo 'Run the approved staging preparation as root.' >&2; exit 1; }
findmnt --mountpoint /srv/morphiume/postgres --noheadings >/dev/null
[[ -f /opt/morphiume/deploy/staging/initdb.sh ]] || { echo 'Staging checkout is missing.' >&2; exit 1; }
if [[ -d /srv/morphiume/staging/postgres/18/docker && ! -f /etc/morphiume-staging/app.json ]]; then
  echo 'Existing staging database requires credential recovery, not reinitialization.' >&2
  exit 1
fi
install -d -m 0700 /etc/morphiume-staging /srv/morphiume/staging /srv/morphiume/staging/backups
install -d -m 0700 -o 999 -g 999 /srv/morphiume/staging/postgres
install -d -m 0750 -o 1001 -g 1001 /srv/morphiume/staging/media
if [[ ! -f /etc/morphiume-staging/app.json ]]; then
  for file in db_bootstrap_password db_owner_password db_app_password; do
    [[ ! -e "/etc/morphiume-staging/$file" ]] || { echo 'Partial credential setup requires recovery.' >&2; exit 1; }
  done
  python3 - <<'PY'
import json, os, secrets
root = '/etc/morphiume-staging'
passwords = {}
for key in ('db_bootstrap_password', 'db_owner_password', 'db_app_password'):
    passwords[key] = secrets.token_hex(32)
    path = f'{root}/{key}'
    with open(path, 'x', encoding='utf-8') as f: f.write(passwords[key])
    os.chown(path, 999, 999)
    os.chmod(path, 0o600)
common = {'PAYMENT_PROVIDER': 'mock', 'SMS_PROVIDER': 'mock'}
runtime_url = f"postgresql://morphiume_staging_app:{passwords['db_app_password']}@db:5432/morphiume_staging"
owner_url = f"postgresql://morphiume_staging_owner:{passwords['db_owner_password']}@db:5432/morphiume_staging"
app = dict(common, DATABASE_URL=runtime_url, APP_BASE_URL='http://localhost:3100', MEDIA_ROOT='/app/media',
           AUTH_SECRET=secrets.token_hex(32), ADMIN_AUTH_SECRET=secrets.token_hex(32), MOCK_CONTROL_SECRET=secrets.token_hex(32))
worker = dict(common, DATABASE_URL=runtime_url, APP_BASE_URL='http://localhost:3100', MEDIA_ROOT='/app/media',
              AUTH_SECRET=secrets.token_hex(32), ADMIN_AUTH_SECRET=secrets.token_hex(32), MOCK_CONTROL_SECRET=secrets.token_hex(32))
configs = {'app.json': app, 'worker.json': worker,
           'migration.json': dict(common, DATABASE_URL=owner_url)}
for name, config in configs.items():
    path = f'{root}/{name}'
    with open(path, 'x', encoding='utf-8') as f: json.dump(config, f)
    os.chown(path, 1001, 1001)
    os.chmod(path, 0o600)
PY
fi
for file in db_bootstrap_password db_owner_password db_app_password app.json worker.json migration.json; do
  [[ -s "/etc/morphiume-staging/$file" ]] || { echo 'Staging credential set is incomplete.' >&2; exit 1; }
done
if [[ ! -e /etc/morphiume-staging/deploy.env ]]; then
  printf 'MORPHIUME_IMAGE=\n' > /etc/morphiume-staging/deploy.env
  chmod 0600 /etc/morphiume-staging/deploy.env
fi
echo 'Staging paths and separate credentials prepared. No containers were started; set the tested image identity before deployment.'
