"""Fixed fresh staging boundaries, private config and accepted release checks."""
import hashlib
import importlib.util
import json
import os
import re
import secrets
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
DATABASE = 'morphiume_staging_runtime'
OWNER = 'morphiume_runtime_owner'
APP = 'morphiume_runtime_app'
DB_CONTAINER = 'morphiume-staging-db-1'
DB_NETWORK = 'morphiume-staging_database'
PROJECT = 'morphiume-staging-runtime'
PG_IMAGE = 'postgres:18.6-bookworm@sha256:afc7e2d441324c0388fa80c3d24f733b4194a4eb7f47dd8ee2b08eb1a24a647c'
OPS_ROOT = Path(__file__).resolve().parent.parent
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
             'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
             'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py',
             'runtime/monitor.py', 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs',
             'runtime/systemd/morphiume-runtime-backup.service', 'runtime/systemd/morphiume-runtime-backup.timer',
             'runtime/systemd/morphiume-runtime-health.service', 'runtime/systemd/morphiume-runtime-health.timer')
ORIGINS = {'ssh-localhost': 'http://localhost:3100', 'private-ip': 'http://192.168.240.51'}
RELEASE_KEYS = ('sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256')


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def validate_identity(value):
    if not isinstance(value, dict) or any(not isinstance(value.get(key), str) for key in RELEASE_KEYS + ('opsSha256',)) or not re.fullmatch('[a-f0-9]{40}', value['sourceCommit']) or not re.fullmatch('[a-f0-9]{64}', value['opsSha256']):
        raise ValueError('Explicit release/source/Ops identities are required')
    if any(not re.fullmatch('sha256:[a-f0-9]{64}', str(value.get(key, ''))) for key in ('testedPlatformConfig', 'candidateManifestDigest')) or not re.fullmatch('[a-f0-9]{64}', str(value.get('archiveSha256', ''))):
        raise ValueError('Explicit accepted config/manifest/archive identities are required')


def bundle_path(source, fingerprint):
    validate_identity({'sourceCommit': source, 'opsSha256': fingerprint, 'testedPlatformConfig': 'sha256:' + '0' * 64,
                       'candidateManifestDigest': 'sha256:' + '0' * 64, 'archiveSha256': '0' * 64})
    return ROOT / 'releases' / source / 'ops-bundles' / fingerprint / 'ops'


def validate_bundle_path(directory):
    directory = Path(directory)
    relative = directory.relative_to(ROOT / 'releases')
    parts = relative.parts
    # Retained legacy bundles are never overwritten. New source may coexist
    # under an independently trusted fingerprint for the same accepted image.
    if not (len(parts) == 2 and parts[1] == 'ops' or len(parts) == 4 and parts[1] == 'ops-bundles' and re.fullmatch('[a-f0-9]{64}', parts[2]) and parts[3] == 'ops') or not re.fullmatch('[a-f0-9]{40}', parts[0]):
        raise ValueError('Unexpected immutable source-based Ops bundle path')
    return directory


def resolve_ops_bundle(source, fingerprint):
    current = bundle_path(source, fingerprint)
    return verify_ops_bundle(current if current.exists() else ROOT / 'releases' / source / 'ops', fingerprint)


def profile_path(record):
    validate_profile(record)
    return ROOT / 'releases' / record['sourceCommit'] / 'profiles' / record['profile'] / canonical_hash(record) / 'profile.json'


def validate_profile(record):
    keys = set(RELEASE_KEYS) | {'version', 'profile', 'origin', 'opsSha256', 'opsRoot', 'configSha256'}
    if not isinstance(record, dict) or set(record) != keys or type(record.get('version')) is not int or record['version'] != 1 or record.get('profile') not in ORIGINS:
        raise ValueError('Unexpected immutable access-profile shape')
    validate_identity(record)
    if record['origin'] != ORIGINS[record['profile']] or record['opsRoot'] != bundle_path(record['sourceCommit'], record['opsSha256']).as_posix():
        raise ValueError('Profile origin or immutable Ops path mismatch')
    if not isinstance(record['configSha256'], dict) or set(record['configSha256']) != {'app.json', 'worker.json', 'migration.json'} or any(not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value) for value in record['configSha256'].values()):
        raise ValueError('Profile must bind all three private runtime configurations')
    return record


def make_profile(report, name, configs):
    if name not in ORIGINS: raise ValueError('Unknown access profile')
    for file, value in configs.items():
        validate_config(value, OWNER if file == 'migration.json' else APP, file == 'migration.json', profile=name)
    record = {key: report[key] for key in RELEASE_KEYS + ('opsSha256',)}
    record |= {'version': 1, 'profile': name, 'origin': ORIGINS[name],
               'opsRoot': bundle_path(report['sourceCommit'], report['opsSha256']).as_posix(),
               'configSha256': {file: canonical_hash(value) for file, value in configs.items()}}
    return validate_profile(record)


def private_directory(path):
    path = exact_path(path)
    metadata = path.stat()
    if not path.is_dir() or metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise ValueError('Profile/source directory must be root-owned and private')
    return path


def preserve_profile(record):
    path = exact_path(profile_path(record))
    base = ROOT / 'releases' / record['sourceCommit']
    private_directory(base)
    for directory in (base / 'profiles', base / 'profiles' / record['profile'], path.parent):
        if not directory.exists(): directory.mkdir(mode=0o700)
        private_directory(directory)
    if path.exists():
        if json.loads(private_file(path).read_text()) != record: raise ValueError('Immutable profile already differs')
    else: write_private(path, json.dumps(record, sort_keys=True) + '\n')
    return path


def read_profile(path, expected_hash):
    path = exact_path(Path(path))
    parts = path.relative_to(ROOT / 'releases').parts
    if len(parts) != 5 or not re.fullmatch('[a-f0-9]{40}', parts[0]) or parts[1] != 'profiles' or parts[2] not in ORIGINS or not re.fullmatch('[a-f0-9]{64}', parts[3]) or parts[4] != 'profile.json' or parts[3] != expected_hash:
        raise ValueError('Unexpected immutable access-profile path')
    for directory in (path.parent, *path.parent.parents):
        if directory == ROOT / 'releases': break
        private_directory(directory)
    record = validate_profile(json.loads(private_file(path).read_text()))
    if canonical_hash(record) != expected_hash or profile_path(record) != path:
        raise ValueError('Access-profile content differs from its trusted hash/path')
    verify_ops_bundle(Path(record['opsRoot']), record['opsSha256'])
    return record


def active_profile(required=False):
    path = CONFIG / 'active-profile.json'
    if not path.exists():
        if required: raise ValueError('Explicit active profile is required')
        return None  # Retained legacy SSH-only deployment, never infer private-IP.
    pointer = json.loads(private_file(path).read_text())
    if not isinstance(pointer, dict) or set(pointer) != {'profilePath', 'profileSha256'}:
        raise ValueError('Unexpected active-profile pointer')
    return read_profile(pointer['profilePath'], pointer['profileSha256'])


def select_profile(record):
    path = preserve_profile(record)
    temporary = CONFIG / 'active-profile.json.new'
    write_private(temporary, json.dumps({'profilePath': str(path), 'profileSha256': canonical_hash(record)}) + '\n')
    if (CONFIG / 'active-profile.json').exists(): private_file(CONFIG / 'active-profile.json')
    os.replace(temporary, CONFIG / 'active-profile.json')


def compose_environment(image, bundle, profile=None):
    value = f'MORPHIUME_IMAGE={image}\nMORPHIUME_OPS_ROOT={bundle}\n'
    if profile is not None:
        validate_profile(profile)
        if image != profile['testedPlatformConfig'] or Path(bundle).as_posix() != profile['opsRoot']:
            raise ValueError('Compose environment differs from the selected release/profile')
        value = f"MORPHIUME_IMAGE={image}\nMORPHIUME_OPS_ROOT={Path(bundle).as_posix()}\nMORPHIUME_APP_BASE_URL={profile['origin']}\n"
    return value


def run(arguments, input_text=None, timeout=30):
    """Capture, never echo command stderr/configuration/password-bearing input."""
    result = subprocess.run(arguments, input=input_text, capture_output=True, text=True, timeout=timeout, env=command_environment(arguments))
    if result.returncode:
        raise ValueError('Required operation failed; inspect protected state without printing configuration')
    return result.stdout.strip()


def command_environment(arguments):
    environment = os.environ.copy()
    if arguments and arguments[0] == 'docker':
        # Host exports must not override reviewed Compose env-file identities.
        for key in tuple(environment):
            if key.startswith(('MORPHIUME_', 'COMPOSE_', 'DOCKER_')):
                environment.pop(key)
        if os.name == 'posix':
            environment['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    return environment


def exact_path(path):
    path = Path(path)
    if not path.is_absolute() or path.resolve() != path or any(parent.is_symlink() for parent in (path, *path.parents)):
        raise ValueError('Reviewed path resolves outside its exact boundary')
    return path


def assert_boundaries():
    if os.name != 'posix' or os.getuid() != 0:
        raise ValueError('Runtime mutations require the authorized Linux root session')
    if run(['findmnt', '--mountpoint', '/srv/morphiume/postgres', '--noheadings', '--output', 'SOURCE']) != '/dev/mapper/vg0-lv--2' or run(['findmnt', '--mountpoint', '/srv/morphiume/postgres', '--noheadings', '--output', 'FSTYPE']) != 'ext4':
        raise ValueError('Reserved database mount identity changed')
    for path in (Path('/etc/morphiume-staging'), Path('/srv/morphiume/staging'),
                 Path('/srv/morphiume/staging/postgres'), CONFIG, ROOT,
                 *(ROOT / name for name in ('media', 'backups', 'restore', 'metrics', 'releases'))):
        exact_path(path)
    if ROOT.exists() and (not ROOT.is_dir() or ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o077):
        raise ValueError('Runtime root must be private and root-owned')


def private_file(path, uid=0):
    path = exact_path(path)
    metadata = path.stat()
    if not path.is_file() or metadata.st_uid != uid or metadata.st_mode & 0o077:
        raise ValueError('Private runtime file ownership or permissions changed')
    return path


def write_private(path, value, uid=0, gid=0):
    exact_path(path)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as file:
        file.write(value)
    os.chown(path, uid, gid)


def ops_digest():
    files = {}
    for name in OPS_FILES:
        path = OPS_ROOT / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Reviewed ops bundle is incomplete or linked')
        # Canonical LF allows a reviewed Windows checkout and Linux bundle match.
        files[name] = hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()
    return hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_url(value, role, host='db', port=5432):
    if not isinstance(value, str):
        raise ValueError('Private connection value has invalid type')
    url = urlsplit(value)
    if (url.scheme, url.hostname, url.port, unquote(url.username or ''), url.path) != ('postgresql', host, port, role, '/' + DATABASE) or not url.password or '?' in value or '#' in value:
        raise ValueError('Private connection selects an unexpected database or role')


def validate_config(config, role, migration=False, profile='ssh-localhost'):
    if profile not in ORIGINS: raise ValueError('Unknown explicit canonical profile')
    keys = {'DATABASE_URL', 'PAYMENT_PROVIDER', 'SMS_PROVIDER'}
    if not migration:
        keys |= {'APP_BASE_URL', 'MEDIA_ROOT', 'AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'}
    if not isinstance(config, dict) or set(config) != keys or any(not isinstance(value, str) or '\0' in value for value in config.values()):
        raise ValueError('Unexpected private runtime configuration shape')
    validate_url(config['DATABASE_URL'], role)
    if not re.fullmatch('postgresql://' + re.escape(role) + ':[a-f0-9]{64}@db:5432/' + DATABASE, config['DATABASE_URL']):
        raise ValueError('Runtime settings require the exact generated database URL shape')
    if config['PAYMENT_PROVIDER'] != 'mock' or config['SMS_PROVIDER'] != 'mock':
        raise ValueError('Only isolated synthetic providers are approved')
    if not migration:
        if config['APP_BASE_URL'] != ORIGINS[profile] or config['MEDIA_ROOT'] != '/app/media':
            raise ValueError('Private runtime origin or media root changed')
        values = [config[key] for key in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET')]
        if len(set(values)) != 3 or any(not re.fullmatch('[a-f0-9]{64}', value) for value in values):
            raise ValueError('Independent generated runtime secrets are required')


def generate_configs():
    passwords = {'db_owner_password': secrets.token_hex(32), 'db_app_password': secrets.token_hex(32)}
    common = {'PAYMENT_PROVIDER': 'mock', 'SMS_PROVIDER': 'mock'}
    app_url = f"postgresql://{APP}:{passwords['db_app_password']}@db:5432/{DATABASE}"
    owner_url = f"postgresql://{OWNER}:{passwords['db_owner_password']}@db:5432/{DATABASE}"
    configs = {}
    for name in ('app', 'worker'):
        configs[name + '.json'] = dict(common, DATABASE_URL=app_url, APP_BASE_URL='http://localhost:3100', MEDIA_ROOT='/app/media',
            AUTH_SECRET=secrets.token_hex(32), ADMIN_AUTH_SECRET=secrets.token_hex(32), MOCK_CONTROL_SECRET=secrets.token_hex(32))
    configs['migration.json'] = dict(common, DATABASE_URL=owner_url)
    for name, value in configs.items():
        validate_config(value, OWNER if name == 'migration.json' else APP, name == 'migration.json')
    connections = {'databaseUrl': app_url.replace('@db:5432/', '@127.0.0.1:15434/'),
                   'migrationDatabaseUrl': owner_url.replace('@db:5432/', '@127.0.0.1:15434/')}
    return passwords, configs, connections, 'BOOTSTRAP_ADMIN_EMAIL=owner-runtime@morphiume.test\nBOOTSTRAP_ADMIN_PASSWORD=' + secrets.token_hex(32) + '\n'


def psql(database, sql):
    if database not in ('postgres', 'morphiume_staging', DATABASE):
        raise ValueError('Unexpected administrator database target')
    return run(['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', database,
                '-X', '-qAt', '--set', 'ON_ERROR_STOP=1'], input_text=sql, timeout=60)


def db_container():
    item = json.loads(run(['docker', 'inspect', DB_CONTAINER]))[0]
    if item['State'].get('Health', {}).get('Status') != 'healthy' or item['Config']['Image'] != PG_IMAGE or item['Config']['Labels'].get('com.docker.compose.project') != 'morphiume-staging':
        raise ValueError('Existing staging PostgreSQL identity or health changed')
    mounts = [(mount.get('Source'), mount.get('Destination')) for mount in item['Mounts'] if mount.get('Type') == 'bind']
    if ('/srv/morphiume/staging/postgres', '/var/lib/postgresql') not in mounts:
        raise ValueError('Existing staging database storage boundary changed')
    network = item['NetworkSettings']['Networks'].get(DB_NETWORK)
    if not network or 'db' not in network.get('Aliases', []):
        raise ValueError('Existing staging database network or alias changed')
    network_info = json.loads(run(['docker', 'network', 'inspect', DB_NETWORK]))[0]
    if not network_info.get('Internal') or network_info['Id'] != network['NetworkID']:
        raise ValueError('Existing database network is not the expected internal network')
    return network['NetworkID']


def release_arguments(parser):
    parser.add_argument('--source', required=True)
    parser.add_argument('--config-id', required=True)
    parser.add_argument('--manifest-digest', required=True)
    parser.add_argument('--archive-sha256', required=True)
    parser.add_argument('--ops-sha256', required=True)
    parser.add_argument('--quiescent-window-released', action='store_true', help='Only after the coordinator explicitly releases the shared DB window')
    parser.add_argument('--apply', action='store_true', help='Only after explicit accepted-identity dispatch; default is a static read-only plan')


def verify_release(args):
    assert_boundaries()
    if not args.quiescent_window_released:
        raise ValueError('Shared database quiet window has not been explicitly released')
    if not re.fullmatch('[a-f0-9]{40}', args.source) or not re.fullmatch('[a-f0-9]{64}', args.ops_sha256) or ops_digest() != args.ops_sha256:
        raise ValueError('Accepted source or reviewed ops bundle fingerprint mismatch')
    if run(['git', '-C', '/opt/morphiume', 'rev-parse', 'HEAD']) != args.source or run(['git', '-C', '/opt/morphiume', 'status', '--porcelain']):
        raise ValueError('Checkout must be clean at the explicitly accepted source')
    allowed_ops = (Path('/opt/morphiume/deploy/staging'), ROOT / 'releases' / args.source / 'ops', bundle_path(args.source, args.ops_sha256))
    if OPS_ROOT not in allowed_ops:
        raise ValueError('Use the accepted checkout or exact reviewed release ops directory')
    exact_path(OPS_ROOT)
    directory = exact_path(ROOT / 'releases' / args.source)
    if directory.stat().st_uid != 0 or directory.stat().st_mode & 0o077:
        raise ValueError('Accepted release directory must be private and root-owned')
    for name in ('accepted-image.tar.gz', 'accepted-image.sha256', 'image-identity.json', 'loaded-release.json'):
        private_file(directory / name)
    specification = importlib.util.spec_from_file_location('morphiume_release', OPS_ROOT / 'verify-release.py')
    verifier = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(verifier)
    report = verifier.verify(directory / 'accepted-image.tar.gz', directory / 'image-identity.json', args.source,
                             args.config_id, args.manifest_digest, args.archive_sha256)
    loaded = json.loads((directory / 'loaded-release.json').read_text())
    if any(loaded.get(key) != report[key] for key in ('sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256')) or loaded.get('mode') != 'loaded-and-identity-verified' or loaded.get('namespace') != 'runtime':
        raise ValueError('Accepted archive has not been loaded and verified in this namespace')
    image = json.loads(run(['docker', 'image', 'inspect', args.config_id]))[0]
    if (image['Id'], image['Os'], image['Architecture'], image['Config']['User'], image['Config']['Labels'].get('org.opencontainers.image.revision')) != (args.config_id, 'linux', 'amd64', '1001:1001', args.source):
        raise ValueError('Loaded image identity differs from the accepted release')
    return report | {'opsSha256': args.ops_sha256}


def compose(image, env_file=None, ops_root=None):
    if not re.fullmatch('sha256:[a-f0-9]{64}', image):
        raise ValueError('Compose commands require the accepted immutable image ID')
    environment = Path(env_file) if env_file else CONFIG / 'deploy.env'
    if environment not in (CONFIG / 'deploy.env', CONFIG / 'deploy.candidate.env'):
        raise ValueError('Unexpected runtime Compose environment path')
    bundle = Path(ops_root) if ops_root else OPS_ROOT
    if ops_root: validate_bundle_path(bundle); exact_path(bundle)
    return ['docker', 'compose', '--project-name', PROJECT, '--env-file', str(environment),
            '-f', str(bundle / 'runtime/compose.yaml')]


def ops_manifest():
    return {name: hashlib.sha256((OPS_ROOT / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest() for name in OPS_FILES}


def preserve_ops_bundle(source):
    if not re.fullmatch('[a-f0-9]{40}', source):
        raise ValueError('Invalid accepted source for Ops preservation')
    destination = exact_path(bundle_path(source, ops_digest()))
    if destination.exists() and destination != OPS_ROOT:
        if verify_ops_bundle(destination, ops_digest()) != destination:
            raise ValueError('Preserved Ops bundle differs from the reviewed source')
        return destination
    if not destination.exists():
        base = ROOT / 'releases' / source
        private_directory(base)
        for directory in (base / 'ops-bundles', destination.parent):
            if not directory.exists(): directory.mkdir(mode=0o700)
            private_directory(directory)
        destination.mkdir(mode=0o700)
        for name in OPS_FILES:
            target = exact_path(destination / name)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            write_private(target, (OPS_ROOT / name).read_text().replace('\r\n', '\n'))
            # Only public reviewed source: the container's mounted helper must
            # remain readable by UID1001; host directory traversal stays private.
            target.chmod(0o644)
    manifest_path = destination / 'ops-manifest.json'
    serialized = json.dumps(ops_manifest(), sort_keys=True, separators=(',', ':'))
    if manifest_path.exists():
        if private_file(manifest_path).read_text().strip() != serialized:
            raise ValueError('Preserved Ops manifest differs from the reviewed source')
    else:
        write_private(manifest_path, serialized + '\n')
    return verify_ops_bundle(destination, ops_digest())


def verify_ops_bundle(directory, expected_hash):
    directory = exact_path(directory)
    validate_bundle_path(directory)
    if directory.parent.parent.name == 'ops-bundles' and directory.parent.name != expected_hash:
        raise ValueError('Ops directory fingerprint differs from the explicitly trusted hash')
    if directory.stat().st_uid != 0 or directory.stat().st_mode & 0o077:
        raise ValueError('Preserved Ops directory must be private and root-owned')
    for parent in directory.parents:
        if parent == ROOT / 'releases': break
        private_directory(parent)
    values = json.loads(private_file(directory / 'ops-manifest.json').read_text())
    if not isinstance(values, dict) or not 1 <= len(values) <= 64:
        raise ValueError('Unexpected preserved Ops manifest shape')
    for name, expected in values.items():
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name or not (name == 'verify-release.py' or name.startswith('runtime/')) or path.suffix not in ('.py', '.mjs', '.sh', '.yaml', '.service', '.timer') or not re.fullmatch('[a-f0-9]{64}', expected):
            raise ValueError('Unexpected preserved Ops manifest member')
        file = exact_path(directory / name)
        metadata = file.stat()
        if not file.is_file() or metadata.st_uid != 0 or metadata.st_mode & 0o022 or metadata.st_size > 1024 ** 2 or hashlib.sha256(file.read_bytes().replace(b'\r\n', b'\n')).hexdigest() != expected:
            raise ValueError('Preserved Ops source fingerprint or permissions changed')
    actual = hashlib.sha256(json.dumps(values, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if actual != expected_hash:
        raise ValueError('Preserved Ops manifest differs from the explicit trusted fingerprint')
    return directory


def load_configs():
    metadata = CONFIG.stat()
    if metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise ValueError('Runtime configuration directory must be private and root-owned')
    profile = active_profile()
    configs = {}
    for name in ('app.json', 'worker.json', 'migration.json'):
        value = json.loads(private_file(CONFIG / name, uid=1001).read_text())
        validate_config(value, OWNER if name == 'migration.json' else APP, name == 'migration.json', profile=profile['profile'] if profile else 'ssh-localhost')
        if profile and canonical_hash(value) != profile['configSha256'][name]:
            raise ValueError('Private configuration differs from the immutable active profile')
        configs[name] = value
    secrets_used = [configs[name][key] for name in ('app.json', 'worker.json') for key in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET')]
    if len(set(secrets_used)) != 6 or configs['app.json']['DATABASE_URL'] != configs['worker.json']['DATABASE_URL']:
        raise ValueError('Private runtime credentials are not independently scoped')
    return configs


def profile_name():
    value = active_profile()
    return value['profile'] if value else 'ssh-localhost'


def lock():
    import fcntl
    path = exact_path(Path('/srv/morphiume/staging/deploy.lock'))
    if path.exists():
        private_file(path)
    descriptor = path.open('a')
    fcntl.flock(descriptor.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    return descriptor


if __name__ == '__main__':
    print(json.dumps({'namespace': PROJECT, 'opsSha256': ops_digest(), 'serverMutation': False}))
