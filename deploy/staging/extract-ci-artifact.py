"""Bound and materialize known CI ZIP files into ignored private local storage."""
import argparse
import hashlib
import json
import os
import stat
import zipfile
from pathlib import Path, PurePosixPath

ACCEPTED = {'accepted-image.tar.gz', 'accepted-image.sha256', 'image-identity.json'}
EVIDENCE = {'.local/image-scan.json', '.local/image-identity.json', '.local/native-audit.json', 'docs/qa/browser-summary.json'}


def extract(archive, destination, kind, allow_partial=False):
    allowed = ACCEPTED if kind == 'accepted' else EVIDENCE
    if allow_partial and kind != 'evidence':
        raise ValueError('Accepted runtime artifacts cannot be partial')
    private_roots = [Path.cwd() / '.local/ci', Path.cwd() / 'deploy/staging/.local']
    destination = destination.resolve()
    if not any(destination.is_relative_to(root.resolve()) and destination != root.resolve() for root in private_roots):
        raise ValueError('Artifact destination must be a separate ignored private directory')
    if destination.exists() and (destination.is_symlink() or any(destination.iterdir())):
        raise ValueError('Artifact destination must be fresh or empty')
    maximum = 4 * 1024 ** 3 + 4 * 1024 ** 2 if kind == 'accepted' else 32 * 1024 ** 2
    allowed_directories = {str(parent) + '/' for name in allowed for parent in PurePosixPath(name).parents if str(parent) != '.'}
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        if not 1 <= len(entries) <= 16 or len({entry.filename for entry in entries}) != len(entries):
            raise ValueError('Unexpected duplicate/excessive ZIP entries')
        files = []
        total = 0
        for entry in entries:
            name = entry.filename
            path = PurePosixPath(name)
            mode = stat.S_IFMT(entry.external_attr >> 16)
            if path.is_absolute() or '..' in path.parts or '\\' in name or entry.flag_bits & 1 or mode not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError('Unsafe/encrypted ZIP entry')
            if entry.is_dir():
                if name not in allowed_directories:
                    raise ValueError('Unexpected ZIP directory')
                continue
            if name not in allowed or entry.file_size < 0 or entry.file_size > maximum:
                raise ValueError('Unexpected ZIP filename/size')
            if kind == 'accepted' and name != 'accepted-image.tar.gz' and entry.file_size > 64 * 1024:
                raise ValueError('Image identity/checksum exceeds its metadata bound')
            total += entry.file_size
            if total > maximum or entry.file_size > max(entry.compress_size, 1) * 1000:
                raise ValueError('ZIP exceeds expansion bounds')
            files.append(entry)
        names = {entry.filename for entry in files}
        if not names or (not allow_partial and names != allowed):
            raise ValueError('Required CI artifact files are absent')
        destination.mkdir(parents=True, mode=0o700, exist_ok=True)
        written = []
        for entry in files:
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError('ZIP target escaped private destination')
            target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            size = 0
            checksum = hashlib.sha256()
            with package.open(entry) as source, os.fdopen(fd, 'wb') as output:
                while data := source.read(1024 * 1024):
                    size += len(data)
                    if size > entry.file_size:
                        raise ValueError('ZIP entry exceeds declared size')
                    output.write(data); checksum.update(data)
            if size != entry.file_size:
                raise ValueError('ZIP entry size mismatch')
            written.append({'name': entry.filename, 'bytes': size, 'sha256': checksum.hexdigest()})
    return {'kind': kind, 'partialEvidence': allow_partial, 'files': written, 'totalBytes': total,
            'executedEntries': False, 'dockerAccess': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('archive', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--kind', choices=['accepted', 'evidence'], required=True)
    parser.add_argument('--allow-partial', action='store_true', help='Only for diagnostics from a failed image job; never accepted-image proof')
    args = parser.parse_args()
    try:
        print(json.dumps(extract(args.archive, args.destination, args.kind, args.allow_partial)))
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f'CI artifact validation failed: {type(error).__name__}; no archive entry executed.')
        raise SystemExit(1)
