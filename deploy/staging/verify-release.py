"""Verify a trusted CI Docker-save archive without extracting it. Load is opt-in."""
import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

MAX_ARCHIVE = 4 * 1024 ** 3
MAX_LAYERS = 16 * 1024 ** 3


def digest(stream, maximum):
    result = hashlib.sha256()
    total = 0
    while data := stream.read(1024 * 1024):
        total += len(data)
        if total > maximum:
            raise ValueError('Release stream exceeds the reviewed size boundary')
        result.update(data)
    return result.hexdigest(), total


def verify(archive, identity_path, source, config_id, manifest_digest, archive_hash):
    if not re.fullmatch('[0-9a-f]{40}', source) or not all(re.fullmatch('sha256:[0-9a-f]{64}', value) for value in (config_id, manifest_digest)) or not re.fullmatch('[0-9a-f]{64}', archive_hash):
        raise ValueError('Trusted source/config/manifest/archive identities are required')
    if archive.name != 'accepted-image.tar.gz' or identity_path.name != 'image-identity.json' or archive.parent != identity_path.parent:
        raise ValueError('Use the exact accepted artifact filenames in one directory')
    if archive.stat().st_size > MAX_ARCHIVE:
        raise ValueError('Compressed archive exceeds the reviewed size boundary')
    checksum = archive.with_name('accepted-image.sha256').read_text().strip()
    if checksum != f'{archive_hash}  accepted-image.tar.gz':
        raise ValueError('Artifact checksum file differs from the trusted archive hash')
    with archive.open('rb') as stream:
        actual, _ = digest(stream, MAX_ARCHIVE)
    if actual != archive_hash:
        raise ValueError('Compressed archive checksum mismatch')
    identity = json.loads(identity_path.read_text())
    expected_tag = f'ghcr.io/amirmo10/morphiume:{source}'
    expected = {'sourceCommit': source, 'testedPlatformConfig': config_id, 'candidateManifestDigest': manifest_digest, 'image': expected_tag}
    if identity != expected:
        raise ValueError('Artifact identity differs from the explicitly trusted CI identity')
    with tarfile.open(archive, 'r:gz') as package:
        members = package.getmembers()
        if len(members) > 1024 or len({item.name for item in members}) != len(members):
            raise ValueError('Unexpected duplicate or excessive Docker-save archive entries')
        for item in members:
            path = PurePosixPath(item.name)
            if path.is_absolute() or '..' in path.parts or '\\' in item.name or not (item.isfile() or item.isdir()):
                raise ValueError('Unsafe Docker-save archive member path/type')
        def read_small(name):
            item = package.getmember(name)
            if not item.isfile() or item.size > 4 * 1024 ** 2:
                raise ValueError('Unexpected image metadata size/type')
            return package.extractfile(item).read()
        manifests = json.loads(read_small('manifest.json'))
        if not isinstance(manifests, list) or len(manifests) != 1:
            raise ValueError('Expected exactly one tested platform image')
        manifest = manifests[0]
        if manifest.get('RepoTags') != [expected_tag]:
            raise ValueError('Archive tag differs from the accepted source tag')
        config_bytes = read_small(manifest['Config'])
        if 'sha256:' + hashlib.sha256(config_bytes).hexdigest() != config_id:
            raise ValueError('Archive config bytes differ from the tested image config')
        config = json.loads(config_bytes)
        runtime = config['config']
        if config.get('os') != 'linux' or config.get('architecture') != 'amd64' or runtime.get('User') != '1001:1001':
            raise ValueError('Archive platform/user differs from the reviewed runtime')
        if runtime.get('Labels', {}).get('org.opencontainers.image.revision') != source or runtime.get('Labels', {}).get('org.opencontainers.image.source') != 'https://github.com/AmirMo10/Morphiume':
            raise ValueError('Archive source/revision labels differ from reviewed source')
        if runtime.get('Entrypoint') != ['node', '/app/deploy/staging/runtime.mjs'] or runtime.get('Cmd') != ['node', 'server.js']:
            raise ValueError('Archive entrypoint differs from the reviewed staging runtime')
        if any(re.search('SECRET|PASSWORD|TOKEN|DATABASE_URL', entry.split('=', 1)[0]) for entry in runtime.get('Env', [])):
            raise ValueError('Runtime credential material must not be baked into image environment')
        diff_ids = config['rootfs']['diff_ids']
        layers = manifest['Layers']
        if len(diff_ids) != len(layers) or not 1 <= len(layers) <= 100:
            raise ValueError('Invalid image layer/diff-ID count')
        layer_bytes = 0
        for name, expected_diff in zip(layers, diff_ids):
            if not re.fullmatch('sha256:[0-9a-f]{64}', expected_diff):
                raise ValueError('Invalid layer diff-ID')
            item = package.getmember(name)
            if not item.isfile():
                raise ValueError('Invalid layer archive type')
            raw = package.extractfile(item)
            prefix = raw.read(2)
            raw.seek(0)
            stream = gzip.GzipFile(fileobj=raw) if prefix == b'\x1f\x8b' else raw
            actual_diff, size = digest(stream, MAX_LAYERS - layer_bytes)
            layer_bytes += size
            if 'sha256:' + actual_diff != expected_diff:
                raise ValueError('Image layer bytes differ from the tested config diff-ID')
    return expected | {'archiveSha256': archive_hash, 'archiveBytes': archive.stat().st_size, 'uncompressedLayerBytes': layer_bytes,
                       'platform': 'linux/amd64', 'user': '1001:1001', 'mode': 'verified-without-extraction'}


def load(archive, identity_path, report, namespace='integration'):
    if os.name != 'posix' or os.getuid() != 0:
        raise ValueError('Image loading requires the authorized Linux staging root session')
    if namespace not in ('integration', 'runtime'):
        raise ValueError('Unknown reviewed release namespace')
    root = Path('/srv/morphiume/staging/runtime') if namespace == 'runtime' else Path('/srv/morphiume/staging')
    if root.resolve() != root or any(item.is_symlink() for item in (root, *root.parents)):
        raise ValueError('Reviewed release root resolves through an unexpected path')
    directory = root / 'releases' / report['sourceCommit']
    if archive.parent != directory or identity_path.parent != directory or directory.is_symlink():
        raise ValueError('Server archive must be in its protected staging release/source directory')
    if directory.stat().st_uid != 0 or directory.stat().st_mode & 0o077:
        raise ValueError('Server release directory must be root-owned and private')
    for file in (archive, identity_path, archive.with_name('accepted-image.sha256')):
        metadata = file.stat()
        if metadata.st_uid != 0 or metadata.st_mode & 0o077:
            raise ValueError('Server release files must be root-owned and private')
    subprocess.run(['bash', '/opt/morphiume/deploy/staging/assert-boundaries.sh'], check=True, capture_output=True)
    if subprocess.check_output(['git', '-C', '/opt/morphiume', 'rev-parse', 'HEAD'], text=True).strip() != report['sourceCommit'] or subprocess.check_output(['git', '-C', '/opt/morphiume', 'status', '--porcelain'], text=True).strip():
        raise ValueError('Server checkout must be clean at the explicitly accepted source')
    free = os.statvfs('/var/lib/docker')
    required = 2 * report['uncompressedLayerBytes'] + 1024 ** 3
    if free.f_bavail * free.f_frsize < required:
        raise ValueError('Docker storage lacks the reviewed load headroom')
    import fcntl
    os.umask(0o077)
    # The same lock serializes namespace creation/deployment and archive loads.
    lock_path = Path('/srv/morphiume/staging/deploy.lock')
    if lock_path.is_symlink() or (lock_path.exists() and (lock_path.stat().st_uid != 0 or lock_path.stat().st_mode & 0o077)):
        raise ValueError('Release lock ownership or permissions changed')
    with lock_path.open('a') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        subprocess.run(['docker', 'image', 'load', '--platform', 'linux/amd64', '--input', str(archive), '--quiet'], check=True, capture_output=True)
        template = '{{json .Id}}|{{json .Os}}|{{json .Architecture}}|{{json .Config.User}}|{{json (index .Config.Labels "org.opencontainers.image.revision")}}'
        actual = subprocess.check_output(['docker', 'image', 'inspect', report['testedPlatformConfig'], '--format', template], text=True).strip()
        values = [json.loads(item) for item in actual.split('|')]
        if values != [report['testedPlatformConfig'], 'linux', 'amd64', '1001:1001', report['sourceCommit']]:
            raise ValueError('Loaded runtime differs from accepted source/config/platform/user')
        report = report | {'mode': 'loaded-and-identity-verified', 'applicationStarted': False, 'namespace': namespace}
        (directory / 'loaded-release.json').write_text(json.dumps(report, indent=2) + '\n')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('identity', type=Path)
    parser.add_argument('--source', required=True)
    parser.add_argument('--config-id', required=True)
    parser.add_argument('--manifest-digest', required=True)
    parser.add_argument('--archive-sha256', required=True)
    parser.add_argument('--load', action='store_true', help='Only after explicit accepted-image dispatch; creates Docker image state but starts no app')
    parser.add_argument('--namespace', choices=('integration', 'runtime'), default='integration', help='Fixed reviewed server release directory; used only with --load')
    args = parser.parse_args()
    try:
        archive, identity = args.archive.resolve(strict=True), args.identity.resolve(strict=True)
        report = verify(archive, identity, args.source, args.config_id, args.manifest_digest, args.archive_sha256)
        if args.load:
            report = load(archive, identity, report, args.namespace)
        print(json.dumps(report))
    except (OSError, ValueError, KeyError, tarfile.TarError, subprocess.SubprocessError) as error:
        message = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(f'Release archive verification/load failed: {message}. No application was started.')
        raise SystemExit(1)
