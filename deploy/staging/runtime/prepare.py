"""Create only the approved fresh logical DB, roles and protected namespace."""
import argparse
import datetime
import json
import os
import subprocess
from pathlib import Path

import contract as c


def initial_state(database_exists, roles, config_exists, state_exists):
    if database_exists or roles or config_exists or state_exists:
        raise ValueError('Existing or partial runtime setup requires recovery; no credentials or data will be reset')


def original_baseline():
    return json.loads(c.psql('morphiume_staging', """SELECT jsonb_build_object(
      'databaseOid',(SELECT oid FROM pg_database WHERE datname=current_database()),
      'databaseOwner',(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()),
      'migrationCount',(SELECT count(*) FROM schema_migration),
      'orders',(SELECT count(*) FROM orders),
      'receipts',(SELECT count(*) FROM payment_receipt),
      'queue',(SELECT jsonb_object_agg(status,total) FROM (SELECT status,count(*) total FROM outbox_job GROUP BY status) q)
    );"""))


def update_state(value):
    temporary = c.CONFIG / 'setup-state.json.new'
    c.write_private(temporary, json.dumps(value, indent=2) + '\n')
    os.replace(temporary, c.CONFIG / 'setup-state.json')


def authenticated_check(role, password):
    # Password travels through private stdin, never command arguments/host env.
    shell = 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -h 127.0.0.1 -p 5432 -U ' + role + ' -d ' + c.DATABASE + ' -X -qAt --set ON_ERROR_STOP=1'
    query = "SELECT jsonb_build_object('database',current_database(),'role',current_user,'schemaCreate',has_schema_privilege(current_user,'public','CREATE'));\n"
    actual = json.loads(c.run(['docker', 'exec', '-i', c.DB_CONTAINER, 'sh', '-c', shell], input_text=password + '\n' + query))
    if actual != {'database': c.DATABASE, 'role': role, 'schemaCreate': role == c.OWNER}:
        raise ValueError('Actual authenticated runtime identity or schema privilege mismatch')


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'database': c.DATABASE, 'project': c.PROJECT,
                'configRoot': str(c.CONFIG), 'dataRoot': str(c.ROOT), 'serverMutation': False}
    report = c.verify_release(args)
    with c.lock():
        network_id = c.db_container()
        exists = json.loads(c.psql('postgres', "SELECT jsonb_build_object('database',EXISTS(SELECT FROM pg_database WHERE datname='morphiume_staging_runtime'),'roles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('morphiume_runtime_owner','morphiume_runtime_app')));"))
        initial_state(exists['database'], exists['roles'], c.CONFIG.exists(), (c.ROOT / 'database-ready.json').exists())
        for name in ('media', 'backups', 'restore', 'metrics'):
            if (c.ROOT / name).exists():
                raise ValueError('Partial runtime paths require operator recovery')
        recipient = c.private_file(Path('/etc/morphiume-staging/backup-recipients.txt')).read_text()
        if not recipient.strip() or '\0' in recipient:
            raise ValueError('Reviewed backup recipients are required')
        before = original_baseline()
        frozen_ops = c.preserve_ops_bundle(args.source)
        passwords, configs, connections, bootstrap = c.generate_configs()
        c.CONFIG.mkdir(mode=0o700)
        # Release handoff already created the private runtime/releases root.
        c.ROOT.mkdir(mode=0o700, exist_ok=True)
        state = {'phase': 'credentials-prepared', 'sourceCommit': args.source,
                 'testedPlatformConfig': args.config_id, 'opsSha256': args.ops_sha256}
        c.write_private(c.CONFIG / 'setup-state.json', json.dumps(state) + '\n')
        for name, value in passwords.items():
            c.write_private(c.CONFIG / name, value)
        for name, value in configs.items():
            c.write_private(c.CONFIG / name, json.dumps(value) + '\n', uid=1001, gid=1001)
        c.write_private(c.CONFIG / 'connections.json', json.dumps(connections) + '\n')
        c.write_private(c.CONFIG / 'bootstrap.env', bootstrap)
        c.write_private(c.CONFIG / 'backup-recipients.txt', recipient)
        c.write_private(c.CONFIG / 'deploy.env', f'MORPHIUME_IMAGE={args.config_id}\nMORPHIUME_OPS_ROOT={frozen_ops}\n')
        for name in ('backups', 'restore', 'metrics'):
            (c.ROOT / name).mkdir(mode=0o700)
        (c.ROOT / 'media').mkdir(mode=0o750)
        os.chown(c.ROOT / 'media', 1001, 1001)
        # Password SQL is not echoed/captured outside this operator process.
        # Suppress secret-bearing statement/error logging for this session only.
        c.psql('postgres', f"""SET log_statement='none'; SET log_min_error_statement='panic'; SET log_min_messages='panic';
          BEGIN;
          CREATE ROLE morphiume_runtime_owner LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{passwords['db_owner_password']}';
          CREATE ROLE morphiume_runtime_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{passwords['db_app_password']}';
          COMMIT;
        """)
        update_state(state | {'phase': 'roles-created'})
        # CREATE DATABASE cannot run inside a transaction. Start with connections
        # disabled, revoke PUBLIC, then enable only after reviewed grants exist.
        c.psql('postgres', """CREATE DATABASE morphiume_staging_runtime OWNER morphiume_runtime_owner TEMPLATE template0 ALLOW_CONNECTIONS false;
          REVOKE ALL ON DATABASE morphiume_staging_runtime FROM PUBLIC;
          GRANT CONNECT ON DATABASE morphiume_staging_runtime TO morphiume_runtime_owner,morphiume_runtime_app;
          ALTER DATABASE morphiume_staging_runtime ALLOW_CONNECTIONS true;
        """)
        update_state(state | {'phase': 'database-created'})
        c.psql(c.DATABASE, """BEGIN;
          ALTER SCHEMA public OWNER TO morphiume_runtime_owner;
          REVOKE ALL ON SCHEMA public FROM PUBLIC;
          GRANT USAGE ON SCHEMA public TO morphiume_runtime_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_runtime_owner IN SCHEMA public
            GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO morphiume_runtime_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_runtime_owner IN SCHEMA public
            GRANT USAGE,SELECT ON SEQUENCES TO morphiume_runtime_app;
          ALTER DEFAULT PRIVILEGES FOR ROLE morphiume_runtime_owner
            REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
          COMMIT;
        """)
        for role, name in ((c.OWNER, 'db_owner_password'), (c.APP, 'db_app_password')):
            authenticated_check(role, passwords[name])
        boundary = json.loads(c.psql('morphiume_staging', """SELECT jsonb_build_object(
          'originalConnectPrivilege',jsonb_build_object('owner',has_database_privilege('morphiume_runtime_owner',current_database(),'CONNECT'),'app',has_database_privilege('morphiume_runtime_app',current_database(),'CONNECT')),
          'originalTableAccess',(SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind IN ('r','p','v','m','f') AND (has_table_privilege('morphiume_runtime_owner',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('morphiume_runtime_app',t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
          'originalSequenceAccess',(SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind='S' AND (has_sequence_privilege('morphiume_runtime_owner',t.oid,'USAGE,SELECT,UPDATE') OR has_sequence_privilege('morphiume_runtime_app',t.oid,'USAGE,SELECT,UPDATE'))),
          'originalOwnedObjects',(SELECT count(*) FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('morphiume_runtime_owner','morphiume_runtime_app')))
        );"""))
        if boundary['originalTableAccess'] or boundary['originalSequenceAccess'] or boundary['originalOwnedObjects']:
            raise ValueError('Original object access boundary failed; preserve state for recovery')
        after = original_baseline()
        if before != after:
            raise ValueError('Original integration activity changed during setup; investigate without resetting it')
        c.load_configs()
        state |= {'phase': 'ready'}
        update_state(state)
        ready = report | {'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                          'database': c.DATABASE, 'databaseNetworkId': network_id, 'originalBaseline': before, 'privilegeBoundary': boundary}
        c.write_private(c.ROOT / 'database-ready.json', json.dumps(ready, indent=2) + '\n')
        return {'mode': 'prepared', 'database': c.DATABASE, 'project': c.PROJECT,
                'configRoot': str(c.CONFIG), 'applicationStarted': False, 'originalBaselineUnchanged': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    c.release_arguments(parser)
    arguments = parser.parse_args()
    try:
        print(json.dumps(main(arguments)))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Fresh runtime preparation stopped. Existing/partial state is retained; no reset or original privilege rewrite is attempted.')
        raise SystemExit(1) from None
