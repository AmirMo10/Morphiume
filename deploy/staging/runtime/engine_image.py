"""Bounded read-only image identity proof; no config blobs, tags as runrefs or pulls.

Docker's classic store exposes a config ID. The containerd store exposes an
OCI manifest ID. Keep accepted config identity separate from the engine run ID.
"""
import hashlib
import json
import os
import re
import subprocess
import threading

LIMIT = 64 * 1024
SOCKET = '/run/containerd/containerd.sock'
NAMESPACE = 'moby'
CTR_VERSION = 'v2.4.1'
OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
OCI_CONFIG = 'application/vnd.oci.image.config.v1+json'
REPOSITORY = 'https://github.com/AmirMo10/Morphiume'
ENTRYPOINT = ['node', '/app/deploy/staging/runtime.mjs']
CMD = ['node', 'server.js']
INSPECT = ('{"id":{{json .Id}},"descriptor":{{json .Descriptor}},"os":{{json .Os}},'
           '"architecture":{{json .Architecture}},"user":{{json .Config.User}},'
           '"sourceCommit":{{json (index .Config.Labels "org.opencontainers.image.revision")}},'
           '"sourceRepo":{{json (index .Config.Labels "org.opencontainers.image.source")}},'
           '"entrypoint":{{json .Config.Entrypoint}},"cmd":{{json .Config.Cmd}},"rootFs":{{json .RootFS}}}')
INFO = '{"containerd":{{json .Containerd}},"driverStatus":{{json .DriverStatus}}}'


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def parse_json(value):
    def unique(pairs):
        result = {}
        for key, item in pairs:
            if key in result: raise ValueError('Duplicate image metadata key')
            result[key] = item
        return result
    return json.loads(value, object_pairs_hook=unique)


def digest(value):
    if not isinstance(value, str) or not re.fullmatch('sha256:[a-f0-9]{64}', value):
        raise ValueError('Immutable image/config/digest identity is required')
    return value


def environment():
    value = os.environ.copy()
    for key in tuple(value):
        if key.startswith(('DOCKER_', 'COMPOSE_', 'MORPHIUME_', 'CONTAINERD_')): value.pop(key)
    if os.name == 'posix': value['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    return value


def read_command(arguments, maximum=LIMIT, timeout=30):
    """Consume bounded stdout; never echo raw output/stderr/configuration."""
    process = subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment())
    timed_out = threading.Event()
    def terminate():
        timed_out.set()
        if process.poll() is None: process.kill()
    timer = threading.Timer(timeout, terminate); timer.start()
    try:
        value = process.stdout.read(maximum + 1)
        if len(value) > maximum:
            process.kill(); raise ValueError('Image metadata exceeds its reviewed bound')
        if process.wait(timeout=5) or timed_out.is_set(): raise ValueError('Required read-only image metadata operation failed')
        return value
    finally:
        timer.cancel(); process.stdout.close()
        if process.poll() is None: process.kill(); process.wait()


def validate_archive(report):
    digest(report['testedPlatformConfig'])
    if not re.fullmatch('[a-f0-9]{40}', str(report.get('sourceCommit', ''))): raise ValueError('Accepted source is required')
    layers = report.get('rootFsDiffIds')
    if not isinstance(layers, list) or not 1 <= len(layers) <= 100 or any(digest(value) != value for value in layers):
        raise ValueError('Verified archive RootFS identities are required')
    if type(report.get('configBytes')) is not int or not 0 < report['configBytes'] <= 4 * 1024 ** 2:
        raise ValueError('Verified archive config size is required')
    descriptors = report.get('archiveLayers')
    if not isinstance(descriptors, list) or len(descriptors) != len(layers): raise ValueError('Verified archive layer descriptors are required')
    for item in descriptors:
        if not isinstance(item, dict) or set(item) != {'mediaType', 'digest', 'size'} or item['mediaType'] not in ('application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip') or type(item['size']) is not int or item['size'] < 0:
            raise ValueError('Unsupported verified archive layer representation')
        digest(item['digest'])


def validate_metadata(metadata, report):
    validate_archive(report)
    keys = {'id', 'descriptor', 'os', 'architecture', 'user', 'sourceCommit', 'sourceRepo', 'entrypoint', 'cmd', 'rootFs'}
    if not isinstance(metadata, dict) or set(metadata) != keys: raise ValueError('Unexpected restricted image metadata shape')
    digest(metadata['id'])
    if (metadata['os'], metadata['architecture'], metadata['user'], metadata['sourceCommit'], metadata['sourceRepo'], metadata['entrypoint'], metadata['cmd']) != ('linux', 'amd64', '1001:1001', report['sourceCommit'], REPOSITORY, ENTRYPOINT, CMD):
        raise ValueError('Loaded image source/platform/user/launcher differs from the accepted archive')
    if metadata['rootFs'] != {'Type': 'layers', 'Layers': report['rootFsDiffIds']}:
        raise ValueError('Loaded RootFS differs from the cryptographically verified archive')


def validate_backend(info, versions):
    if not isinstance(info, dict) or set(info) != {'containerd', 'driverStatus'} or info.get('driverStatus') != [['driver-type', 'io.containerd.snapshotter.v1']]:
        raise ValueError('Unsupported image store metadata')
    containerd = info.get('containerd')
    if containerd != {'Address': SOCKET, 'Namespaces': {'Containers': NAMESPACE, 'Plugins': 'plugins.moby'}}:
        raise ValueError('Unreviewed containerd socket or namespaces')
    # ctr is the shipped diagnostic client; pin its observed read-only contract
    # rather than claiming its CLI is a stable Docker public API.
    versions = versions.decode()
    if re.findall(r'^\s*Version:\s*(\S+)', versions, re.MULTILINE) != [CTR_VERSION, CTR_VERSION]:
        raise ValueError('Containerd client/server version needs independent compatibility review')


def validate_manifest(data, metadata, report):
    descriptor = metadata['descriptor']
    if not isinstance(descriptor, dict) or descriptor.get('mediaType') != OCI_MANIFEST or descriptor.get('digest') != metadata['id'] or type(descriptor.get('size')) is not int or not 0 < descriptor['size'] <= LIMIT:
        raise ValueError('Only the reviewed single-platform OCI manifest is supported')
    if len(data) != descriptor['size'] or 'sha256:' + hashlib.sha256(data).hexdigest() != metadata['id']:
        raise ValueError('OCI manifest bytes differ from immutable engine identity')
    manifest = parse_json(data)
    if not isinstance(manifest, dict) or set(manifest) - {'schemaVersion', 'mediaType', 'config', 'layers', 'annotations'} or manifest.get('schemaVersion') != 2 or manifest.get('mediaType') != OCI_MANIFEST:
        raise ValueError('Unexpected OCI manifest schema/index/content')
    config = manifest.get('config')
    if not isinstance(config, dict) or set(config) != {'mediaType', 'digest', 'size'} or config != {'mediaType': OCI_CONFIG, 'digest': report['testedPlatformConfig'], 'size': report['configBytes']}:
        raise ValueError('OCI manifest does not bind the exact accepted config digest/size')
    layers = manifest.get('layers')
    if not isinstance(layers, list) or len(layers) != len(report['rootFsDiffIds']): raise ValueError('OCI layer count differs from accepted RootFS')
    for item, expected in zip(layers, report['archiveLayers']):
        if not isinstance(item, dict) or set(item) - {'mediaType', 'digest', 'size', 'annotations'} or item.get('mediaType') not in ('application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip', 'application/vnd.oci.image.layer.v1.tar+zstd') or type(item.get('size')) is not int or item['size'] < 0:
            raise ValueError('Unexpected OCI layer descriptor')
        digest(item.get('digest'))
        if {key: item[key] for key in ('mediaType', 'digest', 'size')} != expected:
            raise ValueError('OCI layer bytes/order differ from the verified archive')
    return metadata['id']


def prove(reference, report):
    """Read only. Tags are allowed once for discovery; returned runref is immutable."""
    validate_archive(report)
    expected_tag = 'ghcr.io/amirmo10/morphiume:' + report['sourceCommit']
    if reference != expected_tag: digest(reference)
    metadata = parse_json(read_command(['docker', 'image', 'inspect', '--platform', 'linux/amd64', reference, '--format', INSPECT]))
    validate_metadata(metadata, report)
    if reference != expected_tag and reference != metadata['id']: raise ValueError('Immutable run reference resolves to another engine identity')
    if metadata['descriptor'] is None:
        if metadata['id'] != report['testedPlatformConfig']: raise ValueError('Classic image ID must equal accepted config digest')
        store = 'classic-config-id'; manifest_digest = None
    else:
        # Never request the config blob. Check descriptor before ctr read, then
        # filter/hash only OCI manifest bytes internally; nothing raw is echoed.
        descriptor = metadata['descriptor']
        if not isinstance(descriptor, dict) or descriptor.get('mediaType') != OCI_MANIFEST or descriptor.get('digest') != metadata['id'] or metadata['id'] == report['testedPlatformConfig'] or type(descriptor.get('size')) is not int or not 0 < descriptor['size'] <= LIMIT:
            raise ValueError('Unsupported OCI image/index/config descriptor')
        info = parse_json(read_command(['docker', 'info', '--format', INFO]))
        validate_backend(info, read_command(['ctr', '--address', SOCKET, 'version']))
        manifest = read_command(['ctr', '--address', SOCKET, '--namespace', NAMESPACE, 'content', 'get', metadata['id']])
        manifest_digest = validate_manifest(manifest, metadata, report); store = 'containerd-oci-manifest'
    result = {'version': 1, 'store': store, 'runtimeImageId': metadata['id'], 'platformManifestDigest': manifest_digest,
              'configDigest': report['testedPlatformConfig'], 'configBytes': report['configBytes'],
              'rootFsDiffIds': report['rootFsDiffIds'], 'archiveLayers': report['archiveLayers'], 'sourceCommit': report['sourceCommit'],
              'platform': 'linux/amd64', 'user': '1001:1001', 'entrypoint': ENTRYPOINT, 'cmd': CMD}
    return result | {'engineProofSha256': fingerprint(result)}


def validate_proof(proof, report):
    validate_archive(report)
    if not isinstance(proof, dict) or set(proof) != {'version', 'store', 'runtimeImageId', 'platformManifestDigest', 'configDigest', 'configBytes', 'rootFsDiffIds', 'archiveLayers', 'sourceCommit', 'platform', 'user', 'entrypoint', 'cmd', 'engineProofSha256'}:
        raise ValueError('Incomplete or unexpected recorded engine proof')
    digest(proof['runtimeImageId'])
    if type(proof['version']) is not int or proof['version'] != 1 or proof['engineProofSha256'] != fingerprint({key: value for key, value in proof.items() if key != 'engineProofSha256'}): raise ValueError('Engine proof fingerprint changed')
    if (proof['configDigest'], proof['configBytes'], proof['rootFsDiffIds'], proof['archiveLayers'], proof['sourceCommit'], proof['platform'], proof['user'], proof['entrypoint'], proof['cmd']) != (report['testedPlatformConfig'], report['configBytes'], report['rootFsDiffIds'], report['archiveLayers'], report['sourceCommit'], 'linux/amd64', '1001:1001', ENTRYPOINT, CMD):
        raise ValueError('Recorded engine proof differs from the accepted archive/source')
    if proof['store'] == 'classic-config-id':
        if proof['runtimeImageId'] != report['testedPlatformConfig'] or proof['platformManifestDigest'] is not None: raise ValueError('Invalid classic mapping')
    elif proof['store'] == 'containerd-oci-manifest':
        if proof['runtimeImageId'] != proof['platformManifestDigest'] or proof['runtimeImageId'] == report['testedPlatformConfig']: raise ValueError('Invalid OCI mapping')
    else: raise ValueError('Unreviewed recorded image store')
    return proof


def mapped_report(report, proof):
    validate_proof(proof, report)
    return report | {'runtimeImageId': proof['runtimeImageId'], 'engineProofSha256': proof['engineProofSha256'], 'engineProof': proof}


def runtime_id(report):
    value = digest(report.get('runtimeImageId'))
    if not re.fullmatch('[a-f0-9]{64}', str(report.get('engineProofSha256', ''))): raise ValueError('Recorded cryptographic engine proof is required')
    return value
