#!/usr/bin/env bash
set -euo pipefail

# The official entrypoint calls this only for an empty isolated data directory.
export MORPHIUME_DB_OWNER_PASSWORD
export MORPHIUME_DB_APP_PASSWORD
MORPHIUME_DB_OWNER_PASSWORD="$(cat /run/secrets/db_owner_password)"
MORPHIUME_DB_APP_PASSWORD="$(cat /run/secrets/db_app_password)"
psql --username postgres --dbname "${POSTGRES_DB:-morphiume_staging}" --set ON_ERROR_STOP=1 <<'SQL'
\getenv owner_password MORPHIUME_DB_OWNER_PASSWORD
\getenv app_password MORPHIUME_DB_APP_PASSWORD
\getenv database_name POSTGRES_DB
CREATE ROLE morphiume_staging_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE morphiume_staging_app LOGIN PASSWORD :'app_password';
ALTER DATABASE :"database_name" OWNER TO morphiume_staging_owner;
REVOKE ALL ON DATABASE :"database_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database_name" TO morphiume_staging_app;
ALTER SCHEMA public OWNER TO morphiume_staging_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO morphiume_staging_app;
ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_staging_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO morphiume_staging_app;
ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_staging_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO morphiume_staging_app;
SQL
unset MORPHIUME_DB_OWNER_PASSWORD MORPHIUME_DB_APP_PASSWORD
