"""Synthetic archive/engine/proof/consumer checks. No Docker, SSH or PG calls.

The only subprocesses are bounded local Python children used to test output and
timeout handling. Server reads and all application operations are mocked.
"""
import copy
import gzip
import hashlib
import importlib.util
import io
import json
import sys
import tarfile
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import contract as c
import engine_image as e
import health
import preview
import restore
import scheduled
import upgrade


def sha(value):
    return 'sha256:' + hashlib.sha256(value).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def verifier():
    specification = importlib.util.spec_from_file_location('synthetic_release_verifier', c.OPS_ROOT / 'verify-release.py')
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def synthetic_archive(directory):
    # One plain and one gzip layer exercise both exact wire hashes and diff IDs.
    plain = (b'synthetic-layer-a', b'synthetic-layer-b')
    layers = (plain[0], gzip.compress(plain[1], mtime=0))
    source = 'a' * 40
    config = {'os': 'linux', 'architecture': 'amd64', 'rootfs': {'type': 'layers', 'diff_ids': [sha(item) for item in plain]},
              'config': {'User': '1001:1001', 'Labels': {'org.opencontainers.image.revision': source,
                         'org.opencontainers.image.source': e.REPOSITORY}, 'Entrypoint': e.ENTRYPOINT, 'Cmd': e.CMD, 'Env': ['NODE_ENV=production']}}
    config_bytes = encoded(config)
    identity = {'sourceCommit': source, 'testedPlatformConfig': sha(config_bytes),
                'candidateManifestDigest': 'sha256:' + 'c' * 64, 'image': 'ghcr.io/amirmo10/morphiume:' + source}
    archive = directory / 'accepted-image.tar.gz'
    members = {'manifest.json': encoded([{'Config': 'config.json', 'RepoTags': [identity['image']], 'Layers': ['layer-a.tar', 'layer-b.tar.gz']}]),
               'config.json': config_bytes, 'layer-a.tar': layers[0], 'layer-b.tar.gz': layers[1]}
    with tarfile.open(archive, 'w:gz') as package:
        for name, value in members.items():
            item = tarfile.TarInfo(name); item.size = len(value)
            package.addfile(item, io.BytesIO(value))
    archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    (directory / 'accepted-image.sha256').write_text(archive_hash + '  accepted-image.tar.gz\n')
    (directory / 'image-identity.json').write_text(json.dumps(identity))
    report = verifier().verify(archive, directory / 'image-identity.json', source, identity['testedPlatformConfig'], identity['candidateManifestDigest'], archive_hash)
    return archive, report, layers


def metadata(report, manifest=None):
    result = {'id': report['testedPlatformConfig'], 'descriptor': None, 'os': 'linux', 'architecture': 'amd64', 'user': '1001:1001',
              'sourceCommit': report['sourceCommit'], 'sourceRepo': e.REPOSITORY, 'entrypoint': e.ENTRYPOINT, 'cmd': e.CMD,
              'rootFs': {'Type': 'layers', 'Layers': report['rootFsDiffIds']}}
    if manifest is not None:
        result |= {'id': sha(manifest), 'descriptor': {'mediaType': e.OCI_MANIFEST, 'digest': sha(manifest), 'size': len(manifest)}}
    return result


def manifest_bytes(report):
    return encoded({'schemaVersion': 2, 'mediaType': e.OCI_MANIFEST,
                    'config': {'mediaType': e.OCI_CONFIG, 'digest': report['testedPlatformConfig'], 'size': report['configBytes']},
                    'layers': report['archiveLayers']})


def containers(report, running=True):
    return [{'Image': c.runtime_image(report), 'Config': {'User': '1001:1001', 'Labels': {
                'com.docker.compose.service': name, 'org.opencontainers.image.revision': report['sourceCommit']}},
             'State': {'Running': running, 'Health': {'Status': 'healthy'}, 'Status': 'running' if running else 'exited'}} for name in ('app', 'worker')]


class EngineSafety(unittest.TestCase):
    def setUp(self):
        local = c.OPS_ROOT / '.local'; local.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='engine-safety-', dir=local)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.archive, self.report, self.layers = synthetic_archive(self.root)
        self.manifest = manifest_bytes(self.report)
        self.metadata = metadata(self.report, self.manifest)
        self.info = {'containerd': {'Address': e.SOCKET, 'Namespaces': {'Containers': e.NAMESPACE, 'Plugins': 'plugins.moby'}},
                     'driverStatus': [['driver-type', 'io.containerd.snapshotter.v1']]}
        self.versions = b'Client:\n Version: v2.4.1\nServer:\n Version: v2.4.1\n'
        self.commands = []

    def command(self, arguments, **kwargs):
        self.commands.append(arguments)
        if arguments[:3] == ['docker', 'image', 'inspect']: return encoded(self.metadata)
        if arguments[:2] == ['docker', 'info']: return encoded(self.info)
        if arguments == ['ctr', '--address', e.SOCKET, 'version']: return self.versions
        if arguments == ['ctr', '--address', e.SOCKET, '--namespace', e.NAMESPACE, 'content', 'get', self.metadata['id']]: return self.manifest
        raise AssertionError('Unreviewed command/config content read')

    def proven(self, classic=False):
        if classic: self.metadata = metadata(self.report)
        with patch.object(e, 'read_command', side_effect=self.command):
            return e.prove(self.report['image'], self.report)

    def mapped(self):
        return e.mapped_report(self.report, self.proven()) | {'opsSha256': 'e' * 64}

    def test_archive_reports_exact_config_size_rootfs_and_wire_layers(self):
        with tarfile.open(self.archive) as package:
            self.assertEqual(self.report['configBytes'], len(package.extractfile('config.json').read()))
        self.assertEqual(self.report['archiveLayers'], [{'mediaType': 'application/vnd.oci.image.layer.v1.tar' + ('+gzip' if index else ''), 'digest': sha(item), 'size': len(item)} for index, item in enumerate(self.layers)])
        self.assertEqual(self.report['uncompressedLayerBytes'], len(b'synthetic-layer-a') + len(b'synthetic-layer-b'))
        self.assertNotIn('config', self.report); self.assertNotIn('Env', self.report)

    def test_oci_mapping_preserves_accepted_config_and_reads_no_config_blob(self):
        proof = self.proven(); report = e.mapped_report(self.report, proof)
        self.assertEqual(report['testedPlatformConfig'], self.report['testedPlatformConfig'])
        self.assertNotEqual(report['runtimeImageId'], report['testedPlatformConfig'])
        self.assertEqual(report['runtimeImageId'], sha(self.manifest))
        self.assertEqual(proof['engineProofSha256'], e.fingerprint({key: value for key, value in proof.items() if key != 'engineProofSha256'}))
        content_reads = [command[-1] for command in self.commands if 'content' in command]
        self.assertEqual(content_reads, [sha(self.manifest)])
        self.assertNotIn('.Env', e.INSPECT)

    def test_classic_null_descriptor_uses_config_id_without_ctr(self):
        proof = self.proven(classic=True)
        self.assertEqual(proof['runtimeImageId'], self.report['testedPlatformConfig'])
        self.assertEqual(proof['store'], 'classic-config-id'); self.assertIsNone(proof['platformManifestDigest'])
        self.assertEqual(len(self.commands), 1)
        self.assertIn('{{json .Descriptor}}', e.INSPECT)  # Docker29 API returns null on classic store.

    def test_classic_wrong_id_and_immutable_reference_mismatch_are_rejected(self):
        self.metadata = metadata(self.report) | {'id': 'sha256:' + 'f' * 64}
        with patch.object(e, 'read_command', side_effect=self.command), self.assertRaises(ValueError): e.prove(self.report['image'], self.report)
        self.metadata = metadata(self.report, self.manifest)
        with patch.object(e, 'read_command', side_effect=self.command), self.assertRaises(ValueError): e.prove('sha256:' + '0' * 64, self.report)

    def test_discovery_is_one_exact_source_tag_all_other_tags_rejected(self):
        for reference in ('ghcr.io/amirmo10/morphiume:latest', self.report['image'] + '-other', 'docker.io/untrusted:tag', 'sha256:bad'):
            with patch.object(e, 'read_command', side_effect=AssertionError('No discovery permitted')), self.assertRaises(ValueError): e.prove(reference, self.report)
        proof = self.proven()
        self.commands.clear()
        with patch.object(e, 'read_command', side_effect=self.command): self.assertEqual(e.prove(proof['runtimeImageId'], self.report), proof)
        self.assertEqual(self.commands[0][5], proof['runtimeImageId'])

    def test_metadata_wrong_source_platform_user_launcher_and_rootfs_rejected(self):
        for change in ({'sourceCommit': '0' * 40}, {'sourceRepo': 'https://invalid.test'}, {'os': 'windows'}, {'architecture': 'arm64'}, {'user': '0:0'},
                       {'entrypoint': ['sh']}, {'cmd': ['other']}, {'rootFs': {'Type': 'layers', 'Layers': list(reversed(self.report['rootFsDiffIds']))}}, {'unknown': True}):
            with self.subTest(change=change), self.assertRaises(ValueError): e.validate_metadata(self.metadata | change, self.report)

    def test_manifest_bytes_hash_size_config_binding_and_layer_order_rejected(self):
        e.validate_manifest(self.manifest, self.metadata, self.report)
        with self.assertRaises(ValueError): e.validate_manifest(self.manifest + b' ', self.metadata, self.report)
        original = json.loads(self.manifest)
        changes = [{'config': original['config'] | {'digest': 'sha256:' + 'f' * 64}}, {'config': original['config'] | {'size': self.report['configBytes'] + 1}},
                   {'config': original['config'] | {'mediaType': 'unknown'}}, {'layers': list(reversed(original['layers']))},
                   {'layers': [original['layers'][0] | {'digest': 'sha256:' + 'f' * 64}, original['layers'][1]]},
                   {'layers': [original['layers'][0] | {'size': True}, original['layers'][1]]}, {'schemaVersion': 1}, {'manifests': []}]
        for change in changes:
            data = encoded(original | change)
            with self.subTest(change=change), self.assertRaises(ValueError): e.validate_manifest(data, metadata(self.report, data), self.report)

    def test_index_bad_descriptor_and_oversized_manifest_fail_before_content_read(self):
        for change in ({'mediaType': 'application/vnd.oci.image.index.v1+json'}, {'digest': self.report['testedPlatformConfig']}, {'size': e.LIMIT + 1}, {'size': True}):
            self.metadata = metadata(self.report, self.manifest)
            self.metadata['descriptor'] |= change
            self.commands.clear()
            with patch.object(e, 'read_command', side_effect=self.command), self.assertRaises(ValueError): e.prove(self.report['image'], self.report)
            self.assertEqual(len(self.commands), 1)

    def test_socket_namespace_store_version_and_extra_backend_keys_are_closed(self):
        for change in ({'driverStatus': [['driver-type', 'unknown']]}, {'containerd': self.info['containerd'] | {'Address': '/tmp/socket'}},
                       {'containerd': self.info['containerd'] | {'Namespaces': {'Containers': 'other', 'Plugins': 'plugins.moby'}}}, {'other': True}):
            with self.subTest(change=change), self.assertRaises(ValueError): e.validate_backend(self.info | change, self.versions)
        for versions in (b'', self.versions.replace(b'v2.4.1', b'v2.4.2'), self.versions + b' Version: v2.4.1\n'):
            with self.assertRaises(ValueError): e.validate_backend(self.info, versions)

    def test_duplicate_json_keys_and_incomplete_archive_reports_fail(self):
        with self.assertRaises(ValueError): e.parse_json(b'{"config":1,"config":2}')
        for key in ('configBytes', 'rootFsDiffIds', 'archiveLayers'):
            changed = dict(self.report); changed.pop(key)
            with self.assertRaises((KeyError, ValueError)): e.validate_archive(changed)
        with self.assertRaises(ValueError): e.validate_archive(self.report | {'configBytes': True})

    def test_proof_missing_tampered_rehashed_wrong_config_or_version_fails(self):
        proof = self.proven()
        for change in ({'runtimeImageId': self.report['testedPlatformConfig']}, {'engineProofSha256': '0' * 64}, {'version': True}, {'sourceCommit': '0' * 40}, {'configDigest': 'sha256:' + 'f' * 64}, {'unexpected': 1}):
            with self.subTest(change=change), self.assertRaises(ValueError): e.validate_proof(proof | change, self.report)
        for key in proof:
            incomplete = dict(proof); incomplete.pop(key)
            with self.assertRaises(ValueError): e.validate_proof(incomplete, self.report)
        rehashed = proof | {'configDigest': 'sha256:' + 'f' * 64}
        rehashed['engineProofSha256'] = e.fingerprint({key: value for key, value in rehashed.items() if key != 'engineProofSha256'})
        with self.assertRaises(ValueError): e.validate_proof(rehashed, self.report)

    def test_verify_loaded_phase_never_loads_pulls_or_starts_anything(self):
        module = verifier(); proof = self.proven()
        with (patch.object(module, 'engine_module', return_value=e), patch.object(e, 'prove', return_value=proof) as prove,
              patch.object(module.subprocess, 'run', side_effect=AssertionError('Adoption must not mutate Docker'))):
            report = module.verify_or_load_image(self.archive, self.report, verify_loaded=True)
        prove.assert_called_once_with(self.report['image'], self.report)
        self.assertEqual(report['runtimeImageId'], proof['runtimeImageId'])
        with patch.object(module, 'engine_module', return_value=e), patch.object(e, 'prove', return_value=proof), patch.object(module.subprocess, 'run') as load:
            module.verify_or_load_image(self.archive, self.report, verify_loaded=False)
        self.assertEqual(load.call_args.args[0][:3], ['docker', 'image', 'load'])

    def test_record_scope_exact_shape_old_partial_and_live_reproof_failures(self):
        proof = self.proven(); mapped = e.mapped_report(self.report, proof)
        ops = 'e' * 64
        record = mapped | {'mode': 'loaded-and-identity-verified', 'applicationStarted': False, 'namespace': 'runtime', 'opsSha256': ops, 'loadedRecordVersion': 2}
        with ExitStack() as stack:
            stack.enter_context(patch.object(c, 'ROOT', self.root))
            stack.enter_context(patch.object(c, 'private_directory', side_effect=lambda path: Path(path)))
            stack.enter_context(patch.object(c, 'private_file', side_effect=lambda path: Path(path)))
            stack.enter_context(patch.object(c, 'engine_module', return_value=e))
            reproof = stack.enter_context(patch.object(e, 'prove', return_value=proof))
            path = c.engine_record_path(self.report['sourceCommit'], ops); path.parent.mkdir(parents=True)
            def write(value): path.write_text(json.dumps(value))
            write(record)
            actual = c.recorded_image(self.report, ops)
            self.assertEqual(actual['runtimeImageId'], mapped['runtimeImageId'])
            reproof.assert_called_with(proof['runtimeImageId'], self.report)
            for change in ({'namespace': 'integration'}, {'opsSha256': 'f' * 64}, {'applicationStarted': True}, {'loadedRecordVersion': 1}, {'extra': 1}, {'runtimeImageId': self.report['testedPlatformConfig']}, {'engineProof': None}):
                write(record | change)
                with self.subTest(change=change), self.assertRaises(ValueError): c.recorded_image(self.report, ops)
            write(self.report | {'mode': 'loaded-and-identity-verified'})
            with self.assertRaises(ValueError): c.recorded_image(self.report, ops)
            write(record); path.with_name('loaded-release.json.new').write_text('{}')
            with self.assertRaises(ValueError): c.recorded_image(self.report, ops)
            path.with_name('loaded-release.json.new').unlink()
            reproof.side_effect = ValueError('Actual immutable image changed')
            with self.assertRaises(ValueError): c.recorded_image(self.report, ops)
            path.unlink()
            with self.assertRaises(FileNotFoundError): c.recorded_image(self.report, ops)

    def test_profile_v2_and_compose_use_engine_id_accepted_config_remains_bound(self):
        report = self.mapped(); _, configs, _, _ = c.generate_configs()
        profile = c.make_profile(report, 'ssh-localhost', configs)
        self.assertEqual(profile['version'], 2)
        self.assertEqual(profile['testedPlatformConfig'], self.report['testedPlatformConfig'])
        environment = c.compose_environment(report['runtimeImageId'], Path(profile['opsRoot']), profile)
        self.assertIn('MORPHIUME_IMAGE=' + report['runtimeImageId'], environment)
        self.assertNotIn('MORPHIUME_IMAGE=' + report['testedPlatformConfig'], environment)
        with self.assertRaises(ValueError): c.compose_environment(report['testedPlatformConfig'], Path(profile['opsRoot']), profile)
        for change in ({'version': 1}, {'runtimeImageId': 'tag:mutable'}, {'engineProofSha256': ''}, {'extra': True}):
            with self.assertRaises(ValueError): c.validate_profile(profile | change)
        with self.assertRaises(ValueError): c.match_mapping(profile | {'engineProofSha256': '0' * 64}, report)

    def test_all_application_container_consumers_use_engine_id_source_and_user(self):
        report = self.mapped(); good = containers(report)
        c.validate_app_containers(good, report); upgrade.validate_writers(good, report)
        c.validate_app_containers(containers(report, running=False), report, running=False)
        for change in ('config-id', 'source', 'user', 'running', 'health', 'duplicate'):
            wrong = copy.deepcopy(good)
            if change == 'config-id': wrong[0]['Image'] = report['testedPlatformConfig']
            if change == 'source': wrong[0]['Config']['Labels']['org.opencontainers.image.revision'] = '0' * 40
            if change == 'user': wrong[0]['Config']['User'] = '0:0'
            if change == 'running': wrong[0]['State']['Running'] = False
            if change == 'health': wrong[0]['State']['Health']['Status'] = 'unhealthy'
            if change == 'duplicate': wrong.append(copy.deepcopy(wrong[0]))
            with self.subTest(change=change), self.assertRaises(ValueError): c.validate_app_containers(wrong, report)

    def test_restore_and_upgrade_backup_bind_the_engine_proof(self):
        report = self.mapped()
        manifest = report | {'database': c.DATABASE, 'ciphertextSha256': {'database.dump.age': '1' * 64, 'media.tar.gz.age': '2' * 64}, 'backupStartUtc': 'start', 'backupCompleteUtc': 'complete'}
        restore.validate_backup_identity(manifest, report); upgrade.validate_backup_manifest(manifest, report)
        for change in ({'runtimeImageId': report['testedPlatformConfig']}, {'engineProofSha256': '0' * 64}, {'opsSha256': 'f' * 64}, {'database': 'morphiume_staging'}):
            for guard in (restore.validate_backup_identity, upgrade.validate_backup_manifest):
                with self.subTest(guard=guard.__name__, change=change), self.assertRaises(ValueError): guard(manifest | change, report)
        app = containers(report)[0]
        database = {'Config': {'Image': c.PG_IMAGE, 'Labels': {'com.docker.compose.service': 'db'}}, 'State': {'Running': True, 'Health': {'Status': 'healthy'}}}
        restore.validate_restored_containers([app, database], report)
        with self.assertRaises(ValueError): restore.validate_restored_containers([app | {'Image': report['testedPlatformConfig']}, database], report)
        with self.assertRaises(ValueError): restore.validate_restored_containers([app, database, containers(report)[1]], report)

    def test_preview_cannot_change_runtime_mapping_and_timer_evidence_is_bound(self):
        report = self.mapped(); _, configs, _, _ = c.generate_configs()
        profile = c.make_profile(report, 'ssh-localhost', configs)
        preview.validate_transition(profile, report, report['opsSha256'], c.canonical_hash(profile), False)
        with self.assertRaises(ValueError): preview.validate_transition(profile, report | {'runtimeImageId': report['testedPlatformConfig']}, report['opsSha256'], c.canonical_hash(profile), False)
        approval = report | {'mode': 'quiesce-runtime-only', 'sharedDatabaseWindowReleased': True}
        evidence = report | {'checks': dict.fromkeys(scheduled.CHECKS, True), 'acceptedUtc': '2026-10-13T00:00:00Z', 'observedRtoSeconds': 1, 'observedRecoveryPointGapSeconds': 0}
        scheduled.validate_acceptance(approval, evidence, report)
        with self.assertRaises(ValueError): scheduled.validate_acceptance(approval | {'runtimeImageId': report['testedPlatformConfig']}, evidence, report)
        with self.assertRaises(ValueError): scheduled.validate_acceptance(approval, evidence | {'engineProofSha256': '0' * 64}, report)

    def test_monitor_engine_mismatch_is_critical(self):
        facts = {'databaseHealthy': True, 'appReadiness': 200, 'containers': [dict(service=name, status='running', health='healthy', oomKilled=False, restarts=0, engineIdentityMatches=name != 'app') for name in ('app', 'worker')],
                 'database': {'database': c.DATABASE, 'dead': 0, 'oldestPendingSeconds': 0}}
        self.assertIn('runtime_engine_identity_changed', [item['code'] for item in health.evaluate(facts, 'running')['alerts']])

    def test_bounded_local_reader_rejects_oversized_output_timeout_and_failures(self):
        self.assertEqual(e.read_command([sys.executable, '-c', 'print("safe")']), b'safe\r\n' if sys.platform == 'win32' else b'safe\n')
        for arguments, kwargs in (([sys.executable, '-c', 'print("x"*200)'], {'maximum': 32}), ([sys.executable, '-c', 'import time;time.sleep(3)'], {'timeout': 0.1}), ([sys.executable, '-c', 'raise SystemExit(2)'], {})):
            with self.assertRaises(ValueError): e.read_command(arguments, **kwargs)

    def test_environment_overrides_are_scrubbed(self):
        with patch.dict(e.os.environ, {'DOCKER_HOST': 'tcp://wrong', 'CONTAINERD_ADDRESS': '/tmp/socket', 'CONTAINERD_NAMESPACE': 'other', 'COMPOSE_FILE': 'wrong', 'MORPHIUME_IMAGE': 'mutable'}):
            environment = e.environment()
        self.assertNotIn('CONTAINERD_ADDRESS', environment); self.assertNotIn('CONTAINERD_NAMESPACE', environment)
        self.assertNotIn('COMPOSE_FILE', environment); self.assertNotIn('MORPHIUME_IMAGE', environment)
        self.assertEqual(environment.get('DOCKER_HOST'), 'unix:///var/run/docker.sock' if e.os.name == 'posix' else None)


if __name__ == '__main__':
    unittest.main(verbosity=2)
