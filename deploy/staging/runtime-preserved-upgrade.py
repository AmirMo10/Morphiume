#!/usr/bin/env python3
"""Finite preserved-runtime cutover. Default is a plan, never a server action.

Three separately dispatched phases: prepare -> external before -> migrate ->
external after -> activate. Frozen Ops are imported only after byte verification.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
OPS_HASH = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
PREVIOUS_OPS = '591ad92162d1747238db946c9a9a22724edde79627c6995a353c5064b39a77db'
PREVIOUS_SOURCE = '6130f4ed7ec090344a5a4a1937a65ef04572975b'
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
 'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
 'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py', 'runtime/monitor.py',
 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py', 'runtime/operator-config.mjs',
 'runtime/engine_image.py', 'runtime/systemd/morphiume-runtime-backup.service',
 'runtime/systemd/morphiume-runtime-backup.timer', 'runtime/systemd/morphiume-runtime-health.service',
 'runtime/systemd/morphiume-runtime-health.timer')
RELEASE_KEYS = ('sourceCommit', 'testedPlatformConfig', 'candidateManifestDigest', 'archiveSha256',
                'opsSha256', 'runtimeImageId', 'engineProofSha256')
HASH = re.compile(r'[a-f0-9]{64}')
COMMIT = re.compile(r'[a-f0-9]{40}')
UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')


def need(value):
    if not value:
        raise ValueError('Preserved runtime cutover guard failed')


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def parse_json(data):
    def pairs(items):
        value = {}
        for key, item in items:
            need(key not in value)
            value[key] = item
        return value
    return json.loads(data, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def exact(path, directory=False, private=False):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 4 * 1024**2)
    if private:
        need(info.st_mode & 0o777 == (0o700 if directory else 0o600))
    return path


def read_json(path, expected_hash=None):
    data = exact(path, private=True).read_bytes()
    if expected_hash is not None:
        need(HASH.fullmatch(expected_hash) and digest_bytes(data) == expected_hash)
    return parse_json(data)


def verify_ops(directory, expected):
    """No executing a contract/pyc to learn what files should be verified."""
    directory = exact(directory, directory=True, private=True)
    manifest = read_json(directory / 'ops-manifest.json')
    need(type(manifest) is dict and set(manifest) == set(OPS_FILES))
    for name in OPS_FILES:
        need(type(manifest[name]) is str and HASH.fullmatch(manifest[name]))
        data = exact(directory / name).read_bytes().replace(b'\r\n', b'\n')
        need(digest_bytes(data) == manifest[name])
    actual = digest_bytes(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode())
    need(actual == expected == OPS_HASH)


def import_bundle(args):
    need(os.name == 'posix' and os.getuid() == 0 and args.quiescent_window_released and args.migration_reviewed)
    need(COMMIT.fullmatch(args.source) and COMMIT.fullmatch(args.tool_source_commit)
         and COMMIT.fullmatch(args.ops_source_commit) and COMMIT.fullmatch(args.observer_source_commit))
    need(args.ops_sha256 == OPS_HASH and args.previous_ops_sha256 == PREVIOUS_OPS and args.previous_source == PREVIOUS_SOURCE)
    need(UUID.fullmatch(args.operation_id) and Path(args.evidence_dir) == ROOT / 'preservation' / args.operation_id)
    for value in (args.observer_sha256, args.shared_helper_sha256, args.previous_engine_proof_sha256, args.previous_access_profile_sha256):
        need(type(value) is str and HASH.fullmatch(value))
    if args.phase != 'prepare':
        for value in (args.state_sha256, args.gate_sha256, args.catalog_sha256, args.before_sha256):
            need(type(value) is str and HASH.fullmatch(value))
    if args.phase == 'activate':
        need(type(args.after_sha256) is str and HASH.fullmatch(args.after_sha256))
    tool = exact(Path(__file__), private=False)
    need(HASH.fullmatch(args.tool_sha256) and digest_bytes(tool.read_bytes()) == args.tool_sha256)
    expected_parent = ROOT / 'releases' / args.source / 'tools' / args.tool_sha256
    need(tool == expected_parent / 'runtime-preserved-upgrade.py')
    exact(expected_parent, directory=True, private=True)
    set_cache_guard(expected_parent)
    bundle = ROOT / 'releases' / args.source / 'ops-bundles' / OPS_HASH / 'ops'
    need(Path(args.ops_root) == bundle)
    verify_ops(bundle, args.ops_sha256)
    need(not any(name in sys.modules for name in ('contract', 'backup', 'upgrade')))
    modules = {}
    for name in ('contract', 'backup', 'upgrade'):
        spec = importlib.util.spec_from_file_location(name, bundle / 'runtime' / (name + '.py'))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        modules[name] = module
    need(modules['contract'].ops_digest() == OPS_HASH)
    return modules['contract'], modules['backup'], modules['upgrade'], expected_parent


def set_cache_guard(verified_tool_parent):
    prefix = verified_tool_parent / 'unused-bytecode-cache'
    need(not prefix.exists() and not prefix.is_symlink())
    # A new nonexistent prefix blocks stale old __pycache__ reads too.
    sys.dont_write_bytecode = True
    sys.pycache_prefix = str(prefix)


def release_subset(value):
    return {key: value[key] for key in RELEASE_KEYS}


def record_path(c):
    return c.CONFIG / 'preserved-upgrade.json'


def evidence_path(args):
    need(UUID.fullmatch(args.operation_id))
    path = ROOT / 'preservation' / args.operation_id
    need(Path(args.evidence_dir) == path)
    return path


def store(c, state, phase):
    state['phase'] = phase
    state['stages'].append({'phase': phase, 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    # Exclusive immutable journal snapshot precedes each operation. Unknown
    # .new/partial/event state is not replayed or silently overwritten.
    event = Path(state['journalRoot']) / f"{len(state['stages']):02d}-{phase}.json"
    c.write_private(event, json.dumps(state, sort_keys=True) + '\n')
    pending = record_path(c).with_name('preserved-upgrade.json.new')
    c.write_private(pending, json.dumps(state, sort_keys=True) + '\n')
    if record_path(c).exists():
        c.private_file(record_path(c))
    os.replace(pending, record_path(c))


def no_partial(c, prepare=False):
    for name in ('upgrading.json', 'upgrading.json.new', 'deployed-release.json.new',
                 'preserved-upgrade.json.new', 'active-profile.json.new'):
        need(not (c.CONFIG / name).exists())
    transition = c.CONFIG / 'preview-transition.json'
    if transition.exists():
        need(read_json(transition).get('phase') in ('accepted', 'rolled-back'))
    if prepare:
        need(not record_path(c).exists() and not (c.CONFIG / 'deploy.candidate.env').exists())


def verify_stopped(c, u, state):
    current = c.archived_image(state['previous'])
    need(release_subset(current) == state['previous'])
    c.validate_app_containers(u.runtime_containers(), current, running=False)
    deployed = read_json(c.CONFIG / 'deployed-release.json')
    need(deployed == state['previousDeployment'])
    profile = c.active_profile(required=True)
    need(c.canonical_hash(profile) == state['previousAccessProfileSha256'])
    c.match_mapping(profile, current)
    c.load_configs()
    old_ops = c.resolve_ops_bundle(current['sourceCommit'], current['opsSha256'])
    need(c.private_file(c.CONFIG / 'deploy.env').read_text() == c.compose_environment(c.runtime_image(current), old_ops, profile))


COMPARE_JS = r"""
import * as o from '/app/deploy/staging/observe-runtime-preservation.mjs';
const reject=()=>{throw new Error('Preservation proof rejected')};
const need=v=>{if(!v)reject()};
let text='';for await(const chunk of process.stdin){text+=chunk;need(Buffer.byteLength(text)<=16*1024*1024)}
const p=JSON.parse(text), b=p.before, g=p.gate;
o.validateRuntimeGate(g,p.source);
o.validateAdditionReference(p.reference,p.source,b.identity.version);
await o.verifyRuntimeBackupFiles(p.backupDirectory,g);
need(b.schemaVersion===1&&b.kind==='runtime-preservation'&&b.phase==='before');
need(b.binding.sourceCommit===p.source&&b.binding.toolSourceCommit===p.observerSource);
need(b.binding.sharedHelperSha256===p.sharedHash&&b.binding.databaseName==='morphiume_staging_runtime');
need(o.digest(b.binding.acceptedImage)===o.digest(p.candidate)&&o.digest(g.acceptedImage)===o.digest(p.candidate));
need(o.digest(b.binding.previousImage)===o.digest(p.previous)&&o.digest(g.previousImage)===o.digest(p.previous));
need(b.binding.gateDigest===o.digest(g)&&b.binding.backupManifestSha256===g.backupManifestSha256);
need(o.digest(b.binding.backupCiphertextSha256)===o.digest(g.backupCiphertextSha256));
need(b.binding.additionCatalogSha256===o.digest(p.reference)&&g.additionCatalogSha256===o.digest(p.reference));
need(b.binding.migrationManifestSha256===o.digest(o.MIGRATIONS));
o.validateHistory(b.history,'before');
need(o.digest(b.tables.map(t=>t.name))===o.digest(o.PRESERVED_TABLES));
need(o.digest(Object.keys(b.rows).sort())===o.digest(o.PRESERVED_TABLES));
need(b.identity.database==='morphiume_staging_runtime'&&b.identity.role==='morphiume_runtime_app'&&b.identity.session_role==='morphiume_runtime_app'&&b.identity.read_only==='on'&&b.identity.schema_usage===true);
for(const key of ['superuser','create_db','create_role','replication','bypass_rls','owner_member','schema_create'])need(b.identity[key]===false);
const expectedHistory=Object.entries(o.MIGRATIONS).slice(0,p.mode==='before'?11:13).map(([name,checksum])=>({name,checksum}));
need(o.digest(p.history.migrations)===o.digest(expectedHistory));
if(p.mode==='before'){console.log(JSON.stringify({beforeValidated:true,migrationCount:11,tableCount:49}));}
else{
 const a=p.after;need(a.binding.toolSourceCommit===p.observerSource);
 const result=o.compareRuntimeObservations(b,a,p.reference);
 need(o.digest(a.acceptance)===o.digest(result));
 console.log(JSON.stringify(result));
}
"""


def proof(c, u, args, state, tool_root, mode):
    evidence = evidence_path(args)
    exact(evidence, directory=True, private=True)
    need(str(evidence) == state['evidenceRoot'])
    need(args.gate_sha256 and args.catalog_sha256 and args.before_sha256)
    gate = read_json(evidence / 'cutover-gates.json', args.gate_sha256)
    reference = read_json(evidence / 'addition-catalog.json', args.catalog_sha256)
    before = read_json(evidence / 'before.json', args.before_sha256)
    after = read_json(evidence / 'after.json', args.after_sha256) if mode == 'after' else None
    need(gate['acceptedImage'] == state['candidate'] and gate['previousImage'] == state['previous'])
    need(gate['backupManifestSha256'] == state['backupManifestSha256']
         and gate['backupCiphertextSha256'] == state['backupCiphertextSha256'])
    u.verified_backup(state['backupDirectory'], state['previous'])
    need(digest_bytes(c.private_file(Path(state['backupDirectory']) / 'backup-manifest.json').read_bytes()) == state['backupManifestSha256'])
    if mode == 'after':
        need(args.before_sha256 == state['beforeSha256'] and args.gate_sha256 == state['gateSha256']
             and args.catalog_sha256 == state['catalogRawSha256'])
    observer = tool_root / 'observation'
    exact(observer, directory=True, private=True)
    for name, expected in (('observe-runtime-preservation.mjs', args.observer_sha256),
                           ('upgrade-original-observation.mjs', args.shared_helper_sha256)):
        need(HASH.fullmatch(expected) and digest_bytes(exact(observer / name).read_bytes()) == expected)
    data = {'mode': mode, 'source': args.source, 'observerSource': args.observer_source_commit,
            'sharedHash': args.shared_helper_sha256, 'before': before, 'after': after, 'reference': reference,
            'gate': gate, 'previous': state['previous'], 'candidate': state['candidate'],
            'backupDirectory': state['backupDirectory'], 'history': u.migrations_snapshot()}
    command = ['docker', 'run', '-i', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', '0:0',
               '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '384m', '--cpus', '0.5',
               '--pids-limit', '64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m', '--entrypoint', 'node',
               '--mount', f'type=bind,src={observer / "observe-runtime-preservation.mjs"},dst=/app/deploy/staging/observe-runtime-preservation.mjs,readonly',
               '--mount', f'type=bind,src={observer / "upgrade-original-observation.mjs"},dst=/app/deploy/staging/upgrade-original-observation.mjs,readonly',
               '--mount', f"type=bind,src={state['backupDirectory']},dst={state['backupDirectory']},readonly",
               c.runtime_image(state['candidate']), '--input-type=module', '-e', COMPARE_JS]
    value = parse_json(c.run(command, input_text=json.dumps(data), timeout=90))
    if mode == 'before':
        need(value == {'beforeValidated': True, 'migrationCount': 11, 'tableCount': 49})
    else:
        need(set(value) == {'schemaVersion', 'kind', 'databaseName', 'accepted', 'preservedTableCount', 'newTableCount',
                           'migrationBeforeCount', 'migrationAfterCount', 'preservedRowsDigest', 'migrationPrefixDigest',
                           'oldCatalogDigest', 'newCatalogDigest', 'bindingDigest'})
        need(value.get('accepted') is True and value.get('kind') == 'runtime-preservation'
             and value.get('schemaVersion') == 1 and value.get('databaseName') == 'morphiume_staging_runtime'
             and value.get('preservedTableCount') == 49 and value.get('newTableCount') == 4
             and value.get('migrationBeforeCount') == 11 and value.get('migrationAfterCount') == 13)
        need(all(type(value[key]) is str and HASH.fullmatch(value[key]) for key in
                 ('preservedRowsDigest', 'migrationPrefixDigest', 'oldCatalogDigest', 'newCatalogDigest', 'bindingDigest')))
    return value


def validate_state(args, state, candidate):
    need(state['formatVersion'] == 1 and state['toolSha256'] == args.tool_sha256
         and state['toolSourceCommit'] == args.tool_source_commit and state['opsSourceCommit'] == args.ops_source_commit
         and state['operationId'] == args.operation_id and state['candidate'] == release_subset(candidate)
         and state['previous']['sourceCommit'] == args.previous_source and state['previous']['opsSha256'] == args.previous_ops_sha256)
    need(state['previous']['testedPlatformConfig'] == args.previous_config_id
         and state['previous']['candidateManifestDigest'] == args.previous_manifest_digest
         and state['previous']['archiveSha256'] == args.previous_archive_sha256
         and state['previous']['runtimeImageId'] == args.previous_runtime_image_id
         and state['previous']['engineProofSha256'] == args.previous_engine_proof_sha256)
    need(state['previousAccessProfileSha256'] == args.previous_access_profile_sha256
         and state['observerSourceCommit'] == args.observer_source_commit
         and state['observerSha256'] == args.observer_sha256 and state['sharedHelperSha256'] == args.shared_helper_sha256)
    need(state['journalRoot'] == str(ROOT / 'releases' / args.source / ('preserved-upgrade-' + args.operation_id))
         and state['evidenceRoot'] == str(evidence_path(args)) and state['seedInvoked'] is False
         and state['automaticRollback'] is False and type(state['stages']) is list and 1 <= len(state['stages']) <= 24)
    need(state['phase'] == ('backup-completed' if args.phase == 'migrate' else 'migration-completed'))


def validate_journal(c, state):
    expected = ['prepared', 'writer-stop-started', 'backup-started', 'backup-completed']
    if state['phase'] == 'migration-completed':
        expected += ['owner-check-started', 'migration-started', 'migration-completed']
    need([event['phase'] for event in state['stages']] == expected)
    root = c.private_directory(Path(state['journalRoot']))
    files = {f'{index:02d}-{phase}.json' for index, phase in enumerate(expected, 1)}
    need({file.name for file in root.iterdir()} == files)
    need(read_json(root / f'{len(expected):02d}-{expected[-1]}.json') == state)


def execute(c, b, u, args, tool_root):
    need(args.phase in ('prepare', 'migrate', 'activate'))
    candidate = c.verify_release(args)
    previous = u.previous_identity(args)
    with c.lock():
        no_partial(c, prepare=args.phase == 'prepare')
        c.db_container()
        candidate_ops = c.resolve_ops_bundle(args.source, args.ops_sha256)
        command = c.compose(c.runtime_image(candidate), env_file=c.CONFIG / 'deploy.candidate.env', ops_root=candidate_ops)
        state = None
        owned = False
        cleanup_allowed = False
        try:
            if args.phase == 'prepare':
                old, old_ops = u.verify_previous(previous)
                need(old['runtimeImageId'] == args.previous_runtime_image_id and old['engineProofSha256'] == args.previous_engine_proof_sha256)
                deployed = read_json(c.CONFIG / 'deployed-release.json')
                u.validate_transition(deployed, previous, candidate)
                c.match_mapping(deployed, old)
                c.validate_app_containers(u.runtime_containers(), old)
                profile = c.active_profile(required=True)
                c.match_mapping(profile, old)
                need(c.canonical_hash(profile) == args.previous_access_profile_sha256)
                configs = c.load_configs()
                need(c.private_file(c.CONFIG / 'deploy.env').read_text() == c.compose_environment(c.runtime_image(old), old_ops, profile))
                next_profile = c.make_profile(candidate, profile['profile'], configs)
                journal = c.ROOT / 'releases' / args.source / ('preserved-upgrade-' + args.operation_id)
                need(UUID.fullmatch(args.operation_id) and not journal.exists())
                c.exact_path(journal).mkdir(mode=0o700)
                state = {'formatVersion': 1, 'operationId': args.operation_id, 'toolSha256': args.tool_sha256,
                         'toolSourceCommit': args.tool_source_commit, 'opsSourceCommit': args.ops_source_commit,
                         'observerSourceCommit': args.observer_source_commit, 'observerSha256': args.observer_sha256,
                         'sharedHelperSha256': args.shared_helper_sha256, 'previous': release_subset(old),
                         'candidate': release_subset(candidate), 'previousDeployment': deployed,
                         'previousAccessProfileSha256': args.previous_access_profile_sha256,
                         'candidateProfile': next_profile, 'journalRoot': str(journal), 'evidenceRoot': str(evidence_path(args)),
                         'stages': [], 'seedInvoked': False, 'automaticRollback': False}
                owned = True
                store(c, state, 'prepared')
                c.write_private(c.CONFIG / 'deploy.candidate.env', c.compose_environment(c.runtime_image(candidate), candidate_ops, next_profile))
                old_command = c.compose(c.runtime_image(old), ops_root=old_ops)
                c.run(old_command + ['config', '--quiet']); c.run(command + ['config', '--quiet'])
                store(c, state, 'writer-stop-started')
                cleanup_allowed = True
                c.run(old_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
                verify_stopped(c, u, state)
                store(c, state, 'backup-started')
                result = b.create_backup(old)  # Old613/591 identity; executing backupOps may be68.
                manifest = u.verified_backup(result['directory'], old)
                need(manifest['businessBaseline']['migrationCount'] == 11)
                state.update(backupDirectory=result['directory'], backupManifestSha256=digest_bytes(c.private_file(Path(result['directory']) / 'backup-manifest.json').read_bytes()), backupCiphertextSha256=manifest['ciphertextSha256'])
                store(c, state, 'backup-completed')
                return {'phase': state['phase'], 'writersStarted': False, 'preservationAccepted': False}
            need(args.state_sha256)
            state = read_json(record_path(c), args.state_sha256)
            validate_state(args, state, candidate)
            validate_journal(c, state)
            verify_stopped(c, u, state)
            need(c.private_file(c.CONFIG / 'deploy.candidate.env').read_text() == c.compose_environment(c.runtime_image(candidate), candidate_ops, state['candidateProfile']))
            owned = True
            cleanup_allowed = True
            if args.phase == 'migrate':
                proof(c, u, args, state, tool_root, 'before')
                state.update(beforeSha256=args.before_sha256, gateSha256=args.gate_sha256, catalogRawSha256=args.catalog_sha256)
                store(c, state, 'owner-check-started')
                for service in ('check-owner', 'check-app'):
                    c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', service], timeout=60)
                store(c, state, 'migration-started')
                c.run(command + ['run', '--rm', '--pull', 'never', '--no-deps', 'migrate'], timeout=180)
                store(c, state, 'migration-completed')
                return {'phase': state['phase'], 'writersStarted': False, 'preservationAccepted': False}
            accepted = proof(c, u, args, state, tool_root, 'after')
            state.update(afterSha256=args.after_sha256, preservation=accepted)
            store(c, state, 'preservation-accepted')
            store(c, state, 'profile-promotion-started')
            c.select_profile(state['candidateProfile'])  # Only after complete independently recomputed proof.
            store(c, state, 'compatible-writer-started')
            c.run(command + ['up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180', 'app', 'worker'], timeout=210)
            c.validate_app_containers(u.runtime_containers(), candidate)
            with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=10) as response:
                need(response.status == 200)
            history = c.CONFIG / 'history'
            c.exact_path(history).mkdir(mode=0o700, exist_ok=True)
            c.private_directory(history)
            saved = history / (previous['sourceCommit'] + '.json')
            if saved.exists():
                need(read_json(saved) == state['previousDeployment'])
            else:
                c.write_private(saved, json.dumps(state['previousDeployment']) + '\n')
            store(c, state, 'commit-started')
            os.replace(c.CONFIG / 'deploy.candidate.env', c.CONFIG / 'deploy.env')
            deployed = candidate | {'deployedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'database': c.DATABASE, 'project': c.PROJECT, 'accessProfileSha256': c.canonical_hash(state['candidateProfile']),
                                    'previousSourceCommit': previous['sourceCommit'], 'preMigrationBackup': state['backupDirectory'],
                                    'nativeFixtureAcceptance': 'pending', 'preservationAccepted': True,
                                    'minimumCompatibleNotificationConsumerSource': args.source}
            u.atomic_replace_json(c.CONFIG / 'deployed-release.json', deployed)
            compatibility = {'candidate': state['candidate'], 'previous': state['previous'], 'preservation': accepted,
                'beforeSha256': state['beforeSha256'], 'afterSha256': state['afterSha256'], 'backupManifestSha256': state['backupManifestSha256'],
                'minimumCompatibleNotificationConsumerSource': args.source, 'old613ConsumerResumeForbidden': True,
                'notificationMaterialization': 'requires-post-start-observation', 'nativeFixtureAcceptance': 'pending'}
            c.write_private(Path(state['journalRoot']) / 'compatibility.json', json.dumps(compatibility) + '\n')
            store(c, state, 'committed')
            return {'phase': state['phase'], 'writersStarted': True, 'preservationAccepted': True, 'nativeAcceptance': 'pending', 'old613ConsumerResumeForbidden': True}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            if owned:
                # Finite best-effort stop of this same project; never restart613.
                if cleanup_allowed:
                    try: c.run(command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
                    except (OSError, ValueError, subprocess.SubprocessError): pass
                state['failedAfterPhase'] = state.get('phase', 'unknown')
                try: store(c, state, 'failed-preserved')
                except (OSError, ValueError, subprocess.SubprocessError): pass
            raise ValueError('Preserved upgrade failed; retain state and stopped writers') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--phase', choices=('prepare', 'migrate', 'activate'), required=True)
    for key in ('source', 'config-id', 'manifest-digest', 'archive-sha256', 'ops-sha256', 'ops-root', 'ops-source-commit',
                'tool-source-commit', 'tool-sha256', 'operation-id', 'evidence-dir', 'observer-source-commit', 'observer-sha256',
                'shared-helper-sha256', 'previous-source', 'previous-config-id', 'previous-manifest-digest',
                'previous-archive-sha256', 'previous-ops-sha256', 'previous-runtime-image-id',
                'previous-engine-proof-sha256', 'previous-access-profile-sha256'):
        parser.add_argument('--' + key, required=True)
    for key in ('state-sha256', 'gate-sha256', 'catalog-sha256', 'before-sha256', 'after-sha256'):
        parser.add_argument('--' + key)
    parser.add_argument('--quiescent-window-released', action='store_true')
    parser.add_argument('--migration-reviewed', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.apply:
        print(json.dumps({'mode': 'unexecuted-plan', 'phase': args.phase, 'serverMutation': False, 'seedInvoked': False, 'automaticRollback': False}))
        return 0
    try:
        c, b, u, tool_root = import_bundle(args)
        print(json.dumps(execute(c, b, u, args, tool_root)))
        return 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError, ImportError):
        print(json.dumps({'mode': 'failed-preserved', 'accepted': False, 'automaticRetry': False, 'automaticRollback': False}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
