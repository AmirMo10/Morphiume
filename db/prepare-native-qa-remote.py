"""One fresh QA logical database; invoked only through the reviewed private-stdin dispatcher."""
import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
import subprocess
from pathlib import Path

DB_CONTAINER = 'morphiume-staging-db-1'
PG_IMAGE = 'postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c'
PRIVATE_ROOT = Path('/etc/morphiume-staging-qa')
SUFFIX = re.compile(r'[a-f0-9]{16}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')
IDENTIFIER = re.compile(r'[a-z][a-z0-9_]{0,62}\Z')
SESSION = "SET log_statement='none'; SET log_min_error_statement='panic'; SET log_min_messages='panic'; SET log_duration=off; SET log_min_duration_statement=-1; SET log_min_duration_sample=-1; SET statement_timeout='15s'; SET lock_timeout='2s';\n"


class Stopped(Exception):
    pass


def require(value):
    if not value:
        raise Stopped('Native QA provisioning stopped; partial private state retained')


def validate_plan(plan):
    require(isinstance(plan, dict) and set(plan) == {'schemaVersion', 'phase', 'suffix', 'database', 'ownerRole', 'appRole', 'remoteSourceSha256', 'credentials', 'connections', 'boundary'})
    suffix = plan['suffix']
    require(isinstance(suffix, str) and SUFFIX.fullmatch(suffix))
    require(plan['schemaVersion'] == 1 and plan['phase'] == 'prepared-local' and isinstance(plan['remoteSourceSha256'], str) and HASH.fullmatch(plan['remoteSourceSha256']))
    require(plan['database'] == 'morphiume_staging_qa_' + suffix and plan['ownerRole'] == 'morphiume_staging_qa_owner_' + suffix and plan['appRole'] == 'morphiume_staging_qa_app_' + suffix)
    passwords = plan['credentials']
    require(isinstance(passwords, dict) and set(passwords) == {'ownerPassword', 'appPassword'})
    require(all(isinstance(v, str) and HASH.fullmatch(v) for v in passwords.values()) and passwords['ownerPassword'] != passwords['appPassword'])
    require(plan['connections'] == {
        'databaseUrl': f"postgresql://{plan['appRole']}:{passwords['appPassword']}@127.0.0.1:15433/{plan['database']}",
        'migrationDatabaseUrl': f"postgresql://{plan['ownerRole']}:{passwords['ownerPassword']}@127.0.0.1:15433/{plan['database']}"})
    require(plan['boundary'] == {'deploymentEnv': 'test', 'paymentProvider': 'mock', 'smsProvider': 'mock', 'appBaseUrl': 'http://localhost:3004'})
    return plan


def run(argv, input_text=None, timeout=30):
    try:
        result = subprocess.run(argv, input=input_text, text=True, capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError):
        raise Stopped('Private command failed') from None
    require(result.returncode == 0 and len(result.stdout.encode()) <= 1048576 and len(result.stderr.encode()) <= 1048576)
    return result.stdout.strip()


def identifier(value):
    require(isinstance(value, str) and IDENTIFIER.fullmatch(value))
    return '"' + value + '"'


def psql(database, sql):
    identifier(database)
    return run(['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', database, '-X', '-qAt', '--set', 'ON_ERROR_STOP=1'], SESSION + sql, 60)


def authenticated(plan, owner, sql):
    role = plan['ownerRole' if owner else 'appRole']
    password = plan['credentials']['ownerPassword' if owner else 'appPassword']
    identifier(role); identifier(plan['database'])
    # The fixed command reads the password from stdin before handing SQL to psql.
    shell = 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -h 127.0.0.1 -p 5432 -U ' + role + ' -d ' + plan['database'] + ' -X -qAt --set ON_ERROR_STOP=1'
    return run(['docker', 'exec', '-i', DB_CONTAINER, 'sh', '-c', shell], password + '\n' + "SET statement_timeout='15s'; SET lock_timeout='2s';\n" + sql, 60)


def validate_container(item):
    require(isinstance(item, dict) and item['State']['Running'] is True and item['State'].get('Health', {}).get('Status') == 'healthy')
    require(item['Config']['Image'] == PG_IMAGE and item['Config']['Labels'].get('com.docker.compose.project') == 'morphiume-staging' and item['Config']['Labels'].get('com.docker.compose.service') == 'db')
    mounts = [(m.get('Source'), m.get('Destination')) for m in item['Mounts'] if m.get('Type') == 'bind']
    require(('/srv/morphiume/staging/postgres', '/var/lib/postgresql') in mounts and not any(source == '/srv/morphiume/postgres' for source, _ in mounts))
    require(sum(destination == '/var/lib/postgresql' for _, destination in mounts) == 1)
    require(not any(m.get('Destination', '').startswith('/var/lib/postgresql/') for m in item['Mounts']))
    expected_ports = {'5432/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '5433'}]}
    require({k: v for k, v in item['NetworkSettings']['Ports'].items() if v} == expected_ports and item['HostConfig']['PortBindings'] == expected_ports)
    require('PGDATA=/var/lib/postgresql/18/docker' in item['Config']['Env'])


def private_directory(path):
    metadata = path.lstat()
    require(stat.S_ISDIR(metadata.st_mode) and metadata.st_uid == 0 and metadata.st_gid == 0 and stat.S_IMODE(metadata.st_mode) == 0o700)


def write_private(path, value, replace=False):
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
    temporary = path.with_name(path.name + '.next') if replace else path
    descriptor = os.open(temporary, flags, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(json.dumps(value, sort_keys=True) + '\n'); stream.flush(); os.fsync(stream.fileno())
    metadata = temporary.lstat()
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0 and metadata.st_gid == 0 and stat.S_IMODE(metadata.st_mode) == 0o600)
    if replace:
        prior = path.lstat()
        require(stat.S_ISREG(prior.st_mode) and prior.st_uid == 0 and prior.st_gid == 0 and stat.S_IMODE(prior.st_mode) == 0o600)
        os.replace(temporary, path)


def scram(password):
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('ascii'), salt, 4096)
    client = hmac.new(key, b'Client Key', hashlib.sha256).digest()
    server = hmac.new(key, b'Server Key', hashlib.sha256).digest()
    encode = lambda value: base64.b64encode(value).decode('ascii')
    return 'SCRAM-SHA-256$4096:' + encode(salt) + '$' + encode(hashlib.sha256(client).digest()) + ':' + encode(server)


def original_boundary(plan, databases):
    owner, app = plan['ownerRole'], plan['appRole']
    # This is catalog/ACL readback only, never reads business rows or changes old privileges.
    for database in databases:
        value = json.loads(psql(database, f"""SELECT jsonb_build_object(
          'connect',has_database_privilege('{owner}',current_database(),'CONNECT') OR has_database_privilege('{app}',current_database(),'CONNECT'),
          'objects',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f') AND (has_table_privilege('{owner}',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('{app}',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))),
          'sequences',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind='S' AND (has_sequence_privilege('{owner}',c.oid,'USAGE,SELECT,UPDATE') OR has_sequence_privilege('{app}',c.oid,'USAGE,SELECT,UPDATE'))),
          'ownership',(SELECT count(*) FROM pg_class WHERE relowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('{owner}','{app}'))) + (SELECT count(*) FROM pg_namespace WHERE nspowner IN (SELECT oid FROM pg_roles WHERE rolname IN ('{owner}','{app}')))
        );"""))
        require(value == {'connect': False, 'objects': 0, 'sequences': 0, 'ownership': 0})


def role_readback(plan):
    owner, app = plan['ownerRole'], plan['appRole']
    value = json.loads(psql('postgres', f"""SELECT jsonb_build_object(
      'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'createdb',rolcreatedb,'createrole',rolcreaterole,'replication',rolreplication,'bypassrls',rolbypassrls,'inherit',rolinherit) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('{owner}','{app}')),
      'memberships',(SELECT count(*) FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('{owner}','{app}')) OR member IN (SELECT oid FROM pg_roles WHERE rolname IN ('{owner}','{app}'))),
      'ownedDatabases',(SELECT jsonb_agg(datname ORDER BY datname) FROM pg_database WHERE datdba IN (SELECT oid FROM pg_roles WHERE rolname IN ('{owner}','{app}')))
    );"""))
    expected = sorted([{'name': name, 'login': True, 'superuser': False, 'createdb': False, 'createrole': False, 'replication': False, 'bypassrls': False, 'inherit': False} for name in (owner, app)], key=lambda x: x['name'])
    require(value == {'roles': expected, 'memberships': 0, 'ownedDatabases': [plan['database']]})


def identity_readback(plan, owner):
    value = json.loads(authenticated(plan, owner, """SELECT jsonb_build_object('database',current_database(),'role',current_user,'schemaCreate',has_schema_privilege(current_user,'public','CREATE'),'databaseCreate',has_database_privilege(current_user,current_database(),'CREATE'),'schemaUsage',has_schema_privilege(current_user,'public','USAGE'),'temporary',has_database_privilege(current_user,current_database(),'TEMP'));"""))
    require(value == {'database': plan['database'], 'role': plan['ownerRole' if owner else 'appRole'], 'schemaCreate': owner, 'databaseCreate': owner, 'schemaUsage': True, 'temporary': owner})


def dml_readback(plan):
    # Probe objects are new in this fresh DB, created as the genuine migration owner.
    authenticated(plan, True, 'CREATE TABLE public.native_qa_privilege_probe(id bigserial PRIMARY KEY,value integer NOT NULL);')
    value = json.loads(authenticated(plan, False, """BEGIN;
      INSERT INTO public.native_qa_privilege_probe(value) VALUES(1);
      UPDATE public.native_qa_privilege_probe SET value=2;
      SELECT jsonb_build_object('count',count(*),'value',min(value),'role',current_user) FROM public.native_qa_privilege_probe;
      DELETE FROM public.native_qa_privilege_probe;
      COMMIT;"""))
    require(value == {'count': 1, 'value': 2, 'role': plan['appRole']})
    permissions = json.loads(authenticated(plan, False, """SELECT jsonb_build_object('insert',has_table_privilege(current_user,'public.native_qa_privilege_probe','INSERT'),'select',has_table_privilege(current_user,'public.native_qa_privilege_probe','SELECT'),'update',has_table_privilege(current_user,'public.native_qa_privilege_probe','UPDATE'),'delete',has_table_privilege(current_user,'public.native_qa_privilege_probe','DELETE'),'truncate',has_table_privilege(current_user,'public.native_qa_privilege_probe','TRUNCATE'),'references',has_table_privilege(current_user,'public.native_qa_privilege_probe','REFERENCES'),'trigger',has_table_privilege(current_user,'public.native_qa_privilege_probe','TRIGGER'),'sequenceUsage',has_sequence_privilege(current_user,'public.native_qa_privilege_probe_id_seq','USAGE'),'sequenceSelect',has_sequence_privilege(current_user,'public.native_qa_privilege_probe_id_seq','SELECT'),'sequenceUpdate',has_sequence_privilege(current_user,'public.native_qa_privilege_probe_id_seq','UPDATE'));"""))
    require(permissions == {'insert': True, 'select': True, 'update': True, 'delete': True, 'truncate': False, 'references': False, 'trigger': False, 'sequenceUsage': True, 'sequenceSelect': True, 'sequenceUpdate': False})
    authenticated(plan, True, 'DROP TABLE public.native_qa_privilege_probe;')
    require(json.loads(psql(plan['database'], "SELECT jsonb_build_object('probe',to_regclass('public.native_qa_privilege_probe'),'publicOwner',pg_get_userbyid(nspowner)) FROM pg_namespace WHERE nspname='public';")) == {'probe': None, 'publicOwner': plan['ownerRole']})


def provision(plan):
    validate_plan(plan); require(os.geteuid() == 0)
    inspected = json.loads(run(['docker', 'inspect', DB_CONTAINER])); require(len(inspected) == 1); validate_container(inspected[0])
    bootstrap = json.loads(psql('postgres', "SELECT jsonb_build_object('role',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'version',current_setting('server_version_num')::int,'recovery',pg_is_in_recovery());"))
    require(bootstrap == {'role': 'postgres', 'superuser': True, 'version': 180006, 'recovery': False})
    database, owner, app = plan['database'], plan['ownerRole'], plan['appRole']
    existing = json.loads(psql('postgres', f"SELECT jsonb_build_object('database',EXISTS(SELECT FROM pg_database WHERE datname='{database}'),'roles',(SELECT count(*) FROM pg_roles WHERE rolname IN ('{owner}','{app}')),'oldDatabases',(SELECT coalesce(jsonb_agg(datname ORDER BY datname),'[]'::jsonb) FROM pg_database WHERE NOT datistemplate AND datname<>'postgres'));"))
    require(existing['database'] is False and existing['roles'] == 0 and isinstance(existing['oldDatabases'], list))
    for name in existing['oldDatabases']: identifier(name)
    if not PRIVATE_ROOT.exists(): PRIVATE_ROOT.mkdir(mode=0o700)
    private_directory(PRIVATE_ROOT)
    directory = PRIVATE_ROOT / plan['suffix']; directory.mkdir(mode=0o700); private_directory(directory)
    state = {'schemaVersion': 1, 'phase': 'pending', 'suffix': plan['suffix'], 'remoteSourceSha256': plan['remoteSourceSha256'], 'createdUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    write_private(directory / 'plan.json', plan)
    write_private(directory / 'pending.json', state)
    def phase(value):
        state['phase'] = value; write_private(directory / 'pending.json', state, replace=True)
    try:
        # Only new roles are created. Cleartext passwords are not embedded in SQL.
        psql('postgres', f"BEGIN; CREATE ROLE {identifier(owner)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{scram(plan['credentials']['ownerPassword'])}'; CREATE ROLE {identifier(app)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{scram(plan['credentials']['appPassword'])}'; COMMIT;")
        phase('roles-created')
        original_boundary(plan, existing['oldDatabases'])
        psql('postgres', f"CREATE DATABASE {identifier(database)} OWNER {identifier(owner)} TEMPLATE template0 ALLOW_CONNECTIONS false; REVOKE ALL ON DATABASE {identifier(database)} FROM PUBLIC; GRANT CONNECT ON DATABASE {identifier(database)} TO {identifier(owner)},{identifier(app)}; ALTER DATABASE {identifier(database)} ALLOW_CONNECTIONS true;")
        phase('database-created')
        psql(database, f"""BEGIN; ALTER SCHEMA public OWNER TO {identifier(owner)}; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO {identifier(app)};
          ALTER DEFAULT PRIVILEGES FOR ROLE {identifier(owner)} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO {identifier(app)};
          ALTER DEFAULT PRIVILEGES FOR ROLE {identifier(owner)} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO {identifier(app)};
          ALTER DEFAULT PRIVILEGES FOR ROLE {identifier(owner)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC; COMMIT;""")
        phase('privileges-configured')
        role_readback(plan); identity_readback(plan, True); identity_readback(plan, False); dml_readback(plan)
        original_boundary(plan, existing['oldDatabases'])
        evidence = {'schemaVersion': 1, 'mode': 'provisioned', 'suffix': plan['suffix'], 'database': database, 'ownerRole': owner, 'appRole': app, 'remoteSourceSha256': plan['remoteSourceSha256'], 'roleIsolationVerified': True, 'appDmlVerified': True, 'originalBusinessAccessDenied': True, 'applicationStarted': False, 'canonicalMigrationsApplied': False}
        write_private(directory / 'evidence.json', evidence); phase('provisioned')
        return evidence
    except Exception:
        phase('failed-review-required')
        raise Stopped('Preserve partial state; automatic retry/reset prohibited') from None


def dispatch(plan):
    try:
        print(json.dumps(provision(plan)))
    except Exception:
        print('Native QA provisioning stopped; preserve private pending state. No automatic retry, drop or credential reset.')
        raise SystemExit(1) from None


if __name__ == '__main__':
    # A standalone invocation has no apply mode or input side effects.
    print(json.dumps({'mode': 'unexecuted-plan', 'serverMutation': False, 'requiresReviewedPrivateStdinDispatcher': True}))
