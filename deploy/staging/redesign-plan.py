#!/usr/bin/env python3
"""Reviewed identity plan shared by the new redesign tools; no server actions."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path('/srv/morphiume/staging/runtime')
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
MIGRATIONS = '4d4c96b6c3c04e9ee6807d57b419dfe0c7760df13925298754dfeba0957f1119'
PREVIOUS_PROFILE = '22d97cc5fa1f80a11fd87f5db0ac4316765651f0aafb2ed79e516a773396916f'
PREVIOUS = {
 'sourceCommit': 'acf8e96ee348c487df0fcefe89d568f2bf93367a',
 'testedPlatformConfig': 'sha256:15e209e3dd9057c3a391a07488437fb44af52b9d552322649b719c2a3c8a157f',
 'candidateManifestDigest': 'sha256:54dd109de5f64912d376693114031a91dd9c6f4934d93bca05d7193d4b546308',
 'archiveSha256': '202151aeab7cc6e8e55a1b95d52f411119135c70eceba034d4039d0e79d28606',
 'opsSha256': OPS,
 'runtimeImageId': 'sha256:5bf00e2bc40523dd9eaf85d7ef50eecc320bd2c40baf6d10cc38e65e66e2b482',
 'engineProofSha256': '6a19a424730c629febab18ebaffafbb5722e6cc0b23ac1d8c279fae09949f239',
}
IDENTITY_KEYS = set(PREVIOUS)
HASH = re.compile('[a-f0-9]{64}')
COMMIT = re.compile('[a-f0-9]{40}')


def need(value):
    if not value:
        raise ValueError('Reviewed redesign identity plan rejected')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def parse(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result)
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def validate(value, source):
    """Source/identity acceptance is supplied by Root, never inferred from main."""
    need(isinstance(source, str) and COMMIT.fullmatch(source))
    keys = {'formatVersion', 'mode', 'candidate', 'previous', 'previousAccessProfileSha256',
            'canonicalOrigin', 'migrationManifestSha256', 'migrationCount', 'tableCount'}
    need(type(value) is dict and set(value) == keys)
    need(type(value['formatVersion']) is int and value['formatVersion'] == 1)
    need(value['mode'] == 'reviewed-redesign-image-only-release')
    need(value['previous'] == PREVIOUS and value['previousAccessProfileSha256'] == PREVIOUS_PROFILE)
    need(value['canonicalOrigin'] == 'http://192.168.240.51')
    need(value['migrationManifestSha256'] == MIGRATIONS)
    need(type(value['migrationCount']) is int and value['migrationCount'] == 13)
    need(type(value['tableCount']) is int and value['tableCount'] == 53)
    candidate = value['candidate']
    need(type(candidate) is dict and set(candidate) == IDENTITY_KEYS)
    need(candidate['sourceCommit'] == source and source != PREVIOUS['sourceCommit'])
    need(candidate['opsSha256'] == OPS)
    for key in ('testedPlatformConfig', 'candidateManifestDigest', 'runtimeImageId'):
        need(isinstance(candidate[key], str) and re.fullmatch('sha256:[a-f0-9]{64}', candidate[key]))
    for key in ('archiveSha256', 'engineProofSha256'):
        need(isinstance(candidate[key], str) and HASH.fullmatch(candidate[key]))
    need(candidate['testedPlatformConfig'] != PREVIOUS['testedPlatformConfig'])
    need(candidate['runtimeImageId'] != PREVIOUS['runtimeImageId'])
    for key in ('candidateManifestDigest', 'archiveSha256', 'engineProofSha256'):
        need(candidate[key] != PREVIOUS[key])
    return value


def metadata(path, mode=0o600, directory=False):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == 0 and info.st_mode & 0o777 == mode)
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and info.st_size <= 1024**2)
    return path


def read(args):
    need(isinstance(args.plan_sha256, str) and HASH.fullmatch(args.plan_sha256))
    need(isinstance(args.source, str) and COMMIT.fullmatch(args.source))
    path = ROOT / 'releases' / args.source / 'plans' / args.plan_sha256 / 'plan.json'
    need(Path(args.plan) == path)
    for parent in (path.parent, path.parent.parent, path.parent.parent.parent):
        metadata(parent, 0o700, True)
    raw = metadata(path).read_bytes()
    need(sha(raw) == args.plan_sha256)
    return validate(parse(raw), args.source)


def add_arguments(parser):
    for name in ('plan', 'plan-sha256', 'plan-companion-sha256'):
        parser.add_argument('--' + name, required=True)
