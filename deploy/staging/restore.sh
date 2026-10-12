#!/usr/bin/env bash
set -euo pipefail
bash /opt/morphiume/deploy/staging/assert-boundaries.sh
umask 077
[[ $# == 2 ]] || { echo 'Usage: restore.sh BACKUP_DIRECTORY TEMPORARY_IDENTITY_FILE' >&2; exit 1; }
backup="$(realpath "$1")"
identity="$(realpath "$2")"
case "$backup" in /srv/morphiume/staging/backups/*) ;; *) echo 'Only a staging backup directory is accepted.' >&2; exit 1 ;; esac
case "$identity" in /etc/morphiume-staging/*|/dev/shm/morphiume-restore-*/identity) ;; *) echo 'Use a dedicated protected temporary restore identity.' >&2; exit 1 ;; esac
[[ "$(stat -c %a "$identity")" == 600 ]] || { echo 'Restore identity must have mode600.' >&2; exit 1; }
[[ -f "$backup/SHA256SUMS" ]] || { echo 'Backup manifest missing.' >&2; exit 1; }
(cd "$backup" && sha256sum --check SHA256SUMS)
export MORPHIUME_RESTORE_PROJECT="morphiume-restore-$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 3)"
export MORPHIUME_RESTORE_ROOT="/srv/morphiume/staging/restore/$MORPHIUME_RESTORE_PROJECT"
export MORPHIUME_IMAGE="$(cat "$backup/image-id")"
docker image inspect "$MORPHIUME_IMAGE" >/dev/null
install -d -m 0700 "$MORPHIUME_RESTORE_ROOT"
install -d -m 0700 -o 999 -g 999 "$MORPHIUME_RESTORE_ROOT/postgres"
install -d -m 0750 -o 1001 -g 1001 "$MORPHIUME_RESTORE_ROOT/media"
date -u +%Y-%m-%dT%H:%M:%SZ > "$MORPHIUME_RESTORE_ROOT/recovery-start-utc"
python3 - "$MORPHIUME_RESTORE_ROOT" <<'PY'
import json, os, secrets, sys
from pathlib import Path
root = Path(sys.argv[1])
passwords = {}
for key in ('db_bootstrap_password','db_owner_password','db_app_password'):
    passwords[key] = secrets.token_hex(32)
    path = root/key
    path.write_text(passwords[key])
    os.chown(path,999,999); os.chmod(path,0o600)
app = json.loads(Path('/etc/morphiume-staging/app.json').read_text())
app['DATABASE_URL'] = f"postgresql://morphiume_staging_app:{passwords['db_app_password']}@db:5432/morphiume_restore"
app['APP_BASE_URL'] = 'http://localhost:3101'
app['MEDIA_ROOT'] = '/app/media'
path = root/'app.json'
path.write_text(json.dumps(app)); os.chown(path,1001,1001); os.chmod(path,0o600)
env = f'MORPHIUME_RESTORE_PROJECT={root.name}\nMORPHIUME_RESTORE_ROOT={root}\nMORPHIUME_IMAGE={os.environ["MORPHIUME_IMAGE"]}\n'
(root/'restore.env').write_text(env)
os.chmod(root/'restore.env',0o600)
PY
cd /opt/morphiume
compose=(docker compose --env-file "$MORPHIUME_RESTORE_ROOT/restore.env" -f deploy/staging/compose.restore.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait --wait-timeout 180 db
age --decrypt --identity "$identity" "$backup/database.dump.age" |
  "${compose[@]}" exec -T db pg_restore -U postgres -d morphiume_restore --role morphiume_staging_owner --no-owner --no-acl --exit-on-error --single-transaction
age --decrypt --identity "$identity" "$backup/media.tar.gz.age" |
  python3 -c 'import sys,tarfile; archive=tarfile.open(fileobj=sys.stdin.buffer,mode="r|gz"); archive.extractall(sys.argv[1],filter="data")' "$MORPHIUME_RESTORE_ROOT/media"
chown -R 1001:1001 "$MORPHIUME_RESTORE_ROOT/media"
"${compose[@]}" exec -T db psql -U morphiume_staging_owner -d morphiume_restore -X -At --set ON_ERROR_STOP=1 <<'SQL' > "$MORPHIUME_RESTORE_ROOT/business-restored.json"
SELECT jsonb_build_object(
  'migrationCount',(SELECT count(*) FROM schema_migration),
  'customers',(SELECT count(*) FROM "user"),
  'orders',(SELECT count(*) FROM orders),
  'receipts',(SELECT count(*) FROM payment_receipt),
  'shipments',(SELECT count(*) FROM shipment),
  'refunds',(SELECT count(*) FROM refund),
  'reserved',(SELECT coalesce(sum(reserved),0) FROM inventory_balance),
  'onHand',(SELECT coalesce(sum(on_hand),0) FROM inventory_balance)
);
SQL
"${compose[@]}" --profile application up -d --no-build --pull never --wait --wait-timeout 180 app
curl --fail --silent --show-error --max-time 10 --output /dev/null http://127.0.0.1:3002/api/health/ready
date -u +%Y-%m-%dT%H:%M:%SZ > "$MORPHIUME_RESTORE_ROOT/application-ready-utc"
printf 'Isolated restore app/DB ready. Project: %s\nProtected evidence/data: %s\n' "$MORPHIUME_RESTORE_PROJECT" "$MORPHIUME_RESTORE_ROOT"
echo 'Verify native login, owned order, media and payment dedup, then record recovery-accepted-utc. No worker started.'
