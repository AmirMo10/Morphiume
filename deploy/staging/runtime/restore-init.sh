#!/usr/bin/env bash
set -euo pipefail
[[ "${POSTGRES_DB:-}" == morphiume_staging_restore ]] || { echo 'Unexpected fresh restore database.' >&2; exit 1; }
export MORPHIUME_RESTORE_OWNER_PASSWORD MORPHIUME_RESTORE_APP_PASSWORD
MORPHIUME_RESTORE_OWNER_PASSWORD="$(cat /run/secrets/db_owner_password)"
MORPHIUME_RESTORE_APP_PASSWORD="$(cat /run/secrets/db_app_password)"
psql -U postgres -d morphiume_staging_restore -X -q --set ON_ERROR_STOP=1 <<'SQL'
SET log_statement='none'; SET log_min_error_statement='panic'; SET log_min_messages='panic';
\getenv owner_password MORPHIUME_RESTORE_OWNER_PASSWORD
\getenv app_password MORPHIUME_RESTORE_APP_PASSWORD
BEGIN;
CREATE ROLE morphiume_restore_owner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_password';
CREATE ROLE morphiume_restore_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
ALTER DATABASE morphiume_staging_restore OWNER TO morphiume_restore_owner;
REVOKE ALL ON DATABASE morphiume_staging_restore FROM PUBLIC;
GRANT CONNECT ON DATABASE morphiume_staging_restore TO morphiume_restore_owner,morphiume_restore_app;
ALTER SCHEMA public OWNER TO morphiume_restore_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO morphiume_restore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_restore_owner IN SCHEMA public
  GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO morphiume_restore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_restore_owner IN SCHEMA public
  GRANT USAGE,SELECT ON SEQUENCES TO morphiume_restore_app;
ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_restore_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
SQL
unset MORPHIUME_RESTORE_OWNER_PASSWORD MORPHIUME_RESTORE_APP_PASSWORD
