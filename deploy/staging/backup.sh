#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/morphiume
compose=(docker compose --project-name morphiume-staging -f deploy/staging/compose.db.yaml)
"${compose[@]}" config --quiet
[[ -s /etc/morphiume-staging/backup-recipients.txt ]] || { echo 'Dedicated backup recipients are required.' >&2; exit 1; }
command -v age >/dev/null
destination="/srv/morphiume/staging/backups/$(date -u +%Y%m%dT%H%M%SZ)-$(openssl rand -hex 4)"
install -d -m 0700 "$destination"
date -u +%Y-%m-%dT%H:%M:%SZ > "$destination/backup-start-utc"
# Encrypt streams directly: no unencrypted intermediate dump or media archive.
"${compose[@]}" exec -T db pg_dump --username morphiume_staging_owner --dbname morphiume_staging --format custom --no-owner --no-acl |
  age --encrypt --recipients-file /etc/morphiume-staging/backup-recipients.txt --output "$destination/database.dump.age.partial"
mv "$destination/database.dump.age.partial" "$destination/database.dump.age"
date -u +%Y-%m-%dT%H:%M:%SZ > "$destination/dump-complete-utc"
tar --directory /srv/morphiume/staging/media --create --gzip --file - . |
  age --encrypt --recipients-file /etc/morphiume-staging/backup-recipients.txt --output "$destination/media.tar.gz.age.partial"
mv "$destination/media.tar.gz.age.partial" "$destination/media.tar.gz.age"
if [[ -f /etc/morphiume-staging/deployed-source-commit ]]; then
  install -m 0600 /etc/morphiume-staging/deployed-source-commit "$destination/source-commit"
else
  git rev-parse HEAD > "$destination/source-commit"
fi
if [[ -f /etc/morphiume-staging/deployed-image-id ]]; then
  install -m 0600 /etc/morphiume-staging/deployed-image-id "$destination/image-id"
fi
"${compose[@]}" exec -T db psql -U morphiume_staging_owner -d morphiume_staging -X -At --set ON_ERROR_STOP=1 <<'SQL' > "$destination/business-baseline.json"
SELECT jsonb_build_object(
  'capturedUtc',clock_timestamp(),
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
date -u +%Y-%m-%dT%H:%M:%SZ > "$destination/backup-complete-utc"
files=(database.dump.age media.tar.gz.age source-commit backup-start-utc dump-complete-utc backup-complete-utc business-baseline.json)
[[ ! -f "$destination/image-id" ]] || files+=(image-id)
(cd "$destination" && sha256sum "${files[@]}" > SHA256SUMS)
echo "Encrypted synthetic staging backup completed: $destination"
echo 'No offsite protection or 15-minute RPO is established by this local logical backup.'
