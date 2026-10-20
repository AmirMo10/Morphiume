#!/usr/bin/env bash
# Fresh target cluster role setup; never creates/seeds the application database.
set -euo pipefail
[[ "${POSTGRES_DB:-}" == postgres ]] || { echo 'Unexpected replica bootstrap database.' >&2; exit 1; }
export MORPHIUME_REPLICA_OWNER_PASSWORD MORPHIUME_REPLICA_APP_PASSWORD
MORPHIUME_REPLICA_OWNER_PASSWORD="$(cat /run/secrets/db_owner_password)"
MORPHIUME_REPLICA_APP_PASSWORD="$(cat /run/secrets/db_app_password)"
[[ "$MORPHIUME_REPLICA_OWNER_PASSWORD" =~ ^[a-f0-9]{64}$ && "$MORPHIUME_REPLICA_APP_PASSWORD" =~ ^[a-f0-9]{64}$ ]] || {
  echo 'Protected role passwords must match the accepted replica contract.' >&2; exit 1;
}
[[ "$MORPHIUME_REPLICA_OWNER_PASSWORD" != "$MORPHIUME_REPLICA_APP_PASSWORD" ]] || exit 1
psql -U postgres -d postgres -X -q --set ON_ERROR_STOP=1 <<'SQL'
SET log_statement='none'; SET log_min_error_statement='panic'; SET log_min_messages='panic';
\getenv owner_password MORPHIUME_REPLICA_OWNER_PASSWORD
\getenv app_password MORPHIUME_REPLICA_APP_PASSWORD
BEGIN;
CREATE ROLE morphiume_runtime_owner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_password';
CREATE ROLE morphiume_runtime_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
COMMIT;
SQL
unset MORPHIUME_REPLICA_OWNER_PASSWORD MORPHIUME_REPLICA_APP_PASSWORD
