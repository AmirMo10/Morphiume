#!/usr/bin/env python3
"""Verify a trusted CI ZIP offline; optionally extract into a fresh private cache.

No extractall, subprocess, downloader, browser or network operations. Python 3.12+.
The caller supplies independently authenticated identities, never identities read
from an untrusted manifest as their own trust anchors.
"""
import argparse
import gzip
import hashlib
import json
import os
import platform
import posixpath
import re
import stat
import sys
import tarfile
import zipfile
import zlib

ARCHIVE = "browser-toolchain-ubuntu24.04-x64-playwright1.64.0.tar.gz"
MANIFEST = "browser-toolchain.manifest.json"
SIDECAR = "browser-toolchain.sha256"
PLATFORM = "ubuntu24.04-x64"
VERSIONS = {"node": "24.21.0", "pnpm": "11.25.0", "playwright": "1.64.0"}
ROOTS = {
    "chromium": {"engine": "chromium", "directory": "chromium-1248", "revision": "1248", "browserVersion": "156.0.8078.4"},
    "chromium-headless-shell": {"engine": "chromium-headless-shell", "directory": "chromium_headless_shell-1248", "revision": "1248", "browserVersion": "156.0.8078.4"},
    "firefox": {"engine": "firefox", "directory": "firefox-1555", "revision": "1555", "browserVersion": "157.0"},
    "webkit": {"engine": "webkit", "directory": "webkit-2370", "revision": "2370", "browserVersion": "27.2"},
    "ffmpeg": {"engine": "ffmpeg", "directory": "ffmpeg-1013", "revision": "1013"},
}
LIMITS = {"members": 50000, "bytes": 4 * 1024**3, "fileBytes": 1024**3, "pathBytes": 1024, "depth": 32}
JSON_CAP = 128 * 1024**2
ZIP_CAP = LIMITS["bytes"] + JSON_CAP + 1024**2
CHUNK = 1024**2
ICON_DIR = "firefox-1555/firefox/browser/chrome/icons/default"
ICONS = {f"{ICON_DIR}/default{size}.png" for size in (16, 32, 48, 64, 128)}
PREF_DIR = "firefox-1555/firefox/browser/defaults/preferences"
PREFS = {f"{PREF_DIR}/{name}" for name in ("debugger.js", "firefox.js", "firefox-branding.js")}
AUTOMATION_PREF = PREF_DIR + "/00-playwright-prefs.js"
AUTOMATION_PREF_BYTES = 160
AUTOMATION_PREF_SHA256 = "8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084"
# Exact reviewed vendor paths only. New vendor members require source review and
# a new published importer hash; no directory-prefix or case-folded exceptions.
VENDOR_MEMBERS = {ICON_DIR: "directory", PREF_DIR: "directory", AUTOMATION_PREF: "file", **{path: "file" for path in ICONS | PREFS}}
VENDOR_SEGMENTS = {(5, "default"), (4, "preferences")}
PRIVATE = re.compile(r"^(?:Default|Profile(?:\s+.*)?|User Data|user_data|user-data|Cookies(?:-journal)?|History(?:-journal)?|Login Data|Web Data|Preferences|Local State|Session Storage|Local Storage|IndexedDB|GPUCache|Crash Reports|Cache|Network|SingletonCookie|SingletonLock|SingletonSocket|GITHUB_TOKEN|tokens?\.json|auth\.json|storage-state\.json|\.env(?:\..*)?|\.local|\.git|\.ssh|node_modules|id_rsa|id_ed25519|credentials(?:\.json)?|.*\.(?:pem|p12))$", re.I)
LICENSE = re.compile(r"^(?:ABOUT|LICENSE.*|LICENCE.*|COPYING.*|NOTICE.*|THIRD[-_ ]PARTY.*)$", re.I)
DIGEST = re.compile(r"^[a-f0-9]{64}$")


class Rejected(ValueError):
    """Fixed code only, never attacker-controlled archive text."""


def need(condition, code):
    if not condition:
        raise Rejected(code)


def keys(value, expected):
    need(type(value) is dict and set(value) == set(expected), "schema")


def integer(value, maximum):
    return type(value) is int and 0 <= value <= maximum


def sha(data):
    return hashlib.sha256(data).hexdigest()


def unique_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result, "json-duplicate")
            result[key] = value
        return result
    return json.loads(data.decode("utf-8"), object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(Rejected("json-number")))


def path_ok(path, roots, limits=LIMITS):
    need(type(path) is str and 0 < len(path.encode("utf-8")) <= limits["pathBytes"]
         and not re.search(r"[\\\x00-\x1f\x7f]", path), "path")
    parts = path.split("/")
    vendor = vendor_type(path, roots)
    need(len(parts) <= limits["depth"] and parts[0] in roots, "path")
    for index, part in enumerate(parts):
        need(part and part not in (".", "..") and not part.startswith("."), "path")
        need(not PRIVATE.fullmatch(part) or vendor and (index, part) in VENDOR_SEGMENTS, "private-path")
    return path


def vendor_type(path, roots):
    # validate_manifest first binds the roots to the complete pinned descriptor.
    return VENDOR_MEMBERS.get(path) if ROOTS["firefox"]["directory"] in roots else None


def link_destination(entry, roots, limits):
    target = entry["target"]
    need(type(target) is str and 0 < len(target.encode("utf-8")) <= limits["pathBytes"]
         and not target.startswith("/") and not re.search(r"[\\\x00-\x1f\x7f]", target), "link")
    need(len(target.split("/")) <= limits["depth"]
         and all(part and (part in (".", "..") or not part.startswith(".") and not PRIVATE.fullmatch(part))
             for part in target.split("/")), "link")
    destination = posixpath.normpath(posixpath.join(posixpath.dirname(entry["path"]), target))
    path_ok(destination, roots, limits)
    need(destination.split("/")[0] == entry["path"].split("/")[0]
         and not vendor_type(destination, roots), "link")
    return destination


def validate_manifest(manifest, trusted, limits=LIMITS):
    keys(manifest, ("schemaVersion", "sourceCommit", "platform", "versions", "lockfileSha256", "exporterSha256", "archive", "roots", "counts", "excludedRegistryLinks", "licenseFiles", "entries"))
    need(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1
         and manifest["platform"] == PLATFORM and manifest["versions"] == VERSIONS, "identity")
    keys(manifest["versions"], VERSIONS)
    for key in ("sourceCommit", "lockfileSha256", "exporterSha256"):
        need(type(manifest[key]) is str and manifest[key] == trusted[key], "identity")
    keys(manifest["archive"], ("file", "bytes", "sha256"))
    archive = manifest["archive"]
    need(archive["file"] == ARCHIVE and integer(archive["bytes"], limits["bytes"]) and archive["bytes"] > 0
         and archive["sha256"] == trusted["archiveSha256"], "archive-identity")
    need(type(manifest["excludedRegistryLinks"]) is bool, "schema")
    roots = manifest["roots"]
    need(type(roots) is list and 3 <= len(roots) <= 5, "roots")
    seen_engines = set()
    for root in roots:
        need(type(root) is dict and type(root.get("engine")) is str and root["engine"] in ROOTS and root == ROOTS[root["engine"]], "roots")
        need(root["engine"] not in seen_engines, "roots")
        seen_engines.add(root["engine"])
    need({"chromium", "firefox", "webkit"} <= seen_engines, "roots")
    names = {root["directory"] for root in roots}
    entries = manifest["entries"]
    need(type(entries) is list and 0 < len(entries) <= limits["members"], "member-cap")
    mapping, total, files, links = {}, 0, 0, 0
    for entry in entries:
        need(type(entry) is dict and entry.get("type") in ("file", "directory", "symlink"), "entry")
        expected = {"path", "type", "mode", "bytes"}
        expected |= {"sha256"} if entry["type"] == "file" else {"target"} if entry["type"] == "symlink" else set()
        keys(entry, expected)
        name = path_ok(entry["path"], names, limits)
        need(name not in mapping, "duplicate")
        mapping[name] = entry
        mode = entry["mode"]
        need(integer(mode, 0o777), "mode")
        if entry["type"] != "symlink":
            need(mode & 0o022 == 0 and mode & 0o400 != 0, "mode")
        else:
            need(mode == 0o777, "mode")
        required_vendor_type = vendor_type(name, names)
        if required_vendor_type:
            need(entry["type"] == required_vendor_type, "vendor-type")
        if entry["type"] == "file":
            need(integer(entry["bytes"], limits["fileBytes"]) and type(entry["sha256"]) is str and DIGEST.fullmatch(entry["sha256"]), "file")
            if name == AUTOMATION_PREF:
                need(entry["bytes"] == AUTOMATION_PREF_BYTES and entry["sha256"] == AUTOMATION_PREF_SHA256, "vendor-content")
            total += entry["bytes"]
            need(total <= limits["bytes"], "byte-cap")
            files += 1
        else:
            need(type(entry["bytes"]) is int and entry["bytes"] == 0, "entry")
            if entry["type"] == "directory":
                need(mode & 0o100 != 0, "mode")
            else:
                link_destination(entry, names, limits)
                links += 1
    for name, entry in mapping.items():
        parts = name.split("/")
        need(all(mapping.get("/".join(parts[:i]), {}).get("type") == "directory" for i in range(1, len(parts))), "parent")
        if entry["type"] == "symlink":
            current, visited = name, set()
            while mapping.get(current, {}).get("type") == "symlink":
                need(current not in visited, "link-cycle")
                visited.add(current)
                current = link_destination(mapping[current], names, limits)
            need(current in mapping, "link-missing")
    need(all(mapping.get(root, {}).get("type") == "directory" for root in names), "roots")
    counts = {"memberCount": len(entries), "totalBytes": total, "fileCount": files, "symlinkCount": links}
    keys(manifest["counts"], counts)
    need(all(type(manifest["counts"][key]) is int for key in counts) and manifest["counts"] == counts, "counts")
    licenses = [entry["path"] for entry in entries if entry["type"] == "file" and LICENSE.fullmatch(posixpath.basename(entry["path"]))]
    need(licenses and manifest["licenseFiles"] == licenses, "licenses")
    return mapping


def read_exact(stream, amount):
    data = stream.read(amount)
    need(len(data) == amount, "truncated")
    return data


def pax_values(data):
    values, offset = {}, 0
    while offset < len(data):
        space = data.find(b" ", offset)
        need(space > offset and space - offset <= 8 and data[offset:space].isdigit(), "pax")
        length = int(data[offset:space])
        need(length > space - offset + 2 and offset + length <= len(data), "pax")
        record = data[space + 1:offset + length]
        need(record.endswith(b"\n") and b"=" in record, "pax")
        key, value = record[:-1].split(b"=", 1)
        need(key in (b"path", b"linkpath") and key.decode() not in values, "pax")
        values[key.decode()] = value.decode("utf-8")
        offset += length
    need(values, "pax")
    return values


def tar_walk(stream, mapping, writer=None, limits=LIMITS):
    """Inspect raw headers too: tarfile iteration would hide PAX/global records."""
    seen, pending, pax_total = set(), None, 0
    names = {path.split("/")[0] for path in mapping}
    while True:
        header = read_exact(stream, 512)
        if header == bytes(512):
            need(pending is None and read_exact(stream, 512) == bytes(512), "tar-end")
            tail = 0
            while chunk := stream.read(CHUNK):
                tail += len(chunk)
                need(tail <= 1024**2 and not any(chunk), "tar-tail")
            break
        info = tarfile.TarInfo.frombuf(header, "utf-8", "strict")
        def field(start, length):
            data = header[start:start + length]
            prefix, separator, suffix = data.partition(b"\x00")
            need(not separator or not any(suffix), "tar-field")
            return prefix.decode("utf-8")
        raw_name, prefix = field(0, 100), field(345, 155)
        raw_name = prefix + "/" + raw_name if prefix else raw_name
        raw_target = field(157, 100)
        need(header[257:263] == b"ustar\x00" and header[263:265] == b"00", "tar-format")
        need(info.uid == info.gid == info.mtime == 0 and info.uname == info.gname == ""
             and not any(header[265:329]) and info.devmajor == info.devminor == 0, "tar-owner")
        need(integer(info.mode, 0o777), "mode")
        if info.type == tarfile.XHDTYPE:
            need(pending is None and 0 < info.size <= 4096, "pax")
            # Metadata helper names are never extracted. Still refuse escapes.
            helper = raw_name.split("/")
            need(helper[0] in names and len(helper) <= limits["depth"]
                 and all(part and not part.startswith(".") and not PRIVATE.fullmatch(part) for part in helper)
                 and not re.search(r"[\\\x00-\x1f\x7f]", raw_name) and len(raw_name.encode()) <= limits["pathBytes"]
                 and not raw_target and not info.mode & 0o022, "pax")
            pax_total += info.size
            need(pax_total <= 128 * 1024**2, "pax")
            pending = pax_values(read_exact(stream, info.size))
            need(not any(read_exact(stream, (-info.size) % 512)), "tar-padding")
            continue
        type_name = {tarfile.REGTYPE: "file", tarfile.AREGTYPE: "file", tarfile.DIRTYPE: "directory", tarfile.SYMTYPE: "symlink"}.get(info.type)
        need(type_name is not None, "tar-type")
        normalized_raw = raw_name[:-1] if type_name == "directory" and raw_name.endswith("/") else raw_name
        path_ok(normalized_raw, names, limits)
        name = pending.get("path", raw_name) if pending else raw_name
        target = pending.get("linkpath", raw_target) if pending else raw_target
        if pending and "linkpath" in pending:
            need(type_name == "symlink", "pax")
        pending = None
        # GNU tar appends one slash to directories; no other normalization.
        if type_name == "directory" and name.endswith("/"):
            name = name[:-1]
        path_ok(name, names, limits)
        need(name.split("/")[0] == normalized_raw.split("/")[0], "pax")
        if raw_target and type_name == "symlink":
            link_destination({"path": normalized_raw, "target": raw_target}, names, limits)
        need(name in mapping and name not in seen and len(seen) < limits["members"], "tar-member")
        entry = mapping[name]
        need(type_name == entry["type"] and info.mode == entry["mode"] and info.size == entry["bytes"], "tar-identity")
        need(target == entry.get("target", ""), "tar-link")
        seen.add(name)
        output = writer(entry) if writer and type_name == "file" else None
        try:
            remaining, hash_value = info.size, hashlib.sha256()
            while remaining:
                chunk = read_exact(stream, min(CHUNK, remaining))
                remaining -= len(chunk)
                hash_value.update(chunk)
                if output:
                    output.write(chunk)
            if type_name == "file":
                need(hash_value.hexdigest() == entry["sha256"], "tar-hash")
        finally:
            if output:
                output.close()
        need(not any(read_exact(stream, (-info.size) % 512)), "tar-padding")
    need(seen == set(mapping), "tar-members")


def fingerprint(file):
    info = os.fstat(file.fileno())
    need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and 0 < info.st_size <= ZIP_CAP, "zip-file")
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def file_digest(file):
    file.seek(0)
    digest = hashlib.sha256()
    while chunk := file.read(CHUNK):
        digest.update(chunk)
    file.seek(0)
    return digest.hexdigest()


def inspect_zip(archive, trusted, limits=LIMITS):
    infos = archive.infolist()
    need(len(infos) == 3 and {info.filename for info in infos} == {ARCHIVE, MANIFEST, SIDECAR}, "zip-members")
    for info in infos:
        mode = info.external_attr >> 16
        need(not info.is_dir() and not info.flag_bits & 1 and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
             and (stat.S_IFMT(mode) in (0, stat.S_IFREG)) and not mode & 0o7022, "zip-type")
        cap = limits["bytes"] if info.filename == ARCHIVE else JSON_CAP if info.filename == MANIFEST else 512
        need(integer(info.file_size, cap) and info.file_size > 0 and 0 <= info.compress_size <= ZIP_CAP, "zip-cap")
    data = archive.read(MANIFEST)
    need(sha(data) == trusted["manifestSha256"], "manifest-digest")
    manifest = unique_json(data)
    mapping = validate_manifest(manifest, trusted, limits)
    need(archive.getinfo(ARCHIVE).file_size == manifest["archive"]["bytes"], "archive-identity")
    need(archive.read(SIDECAR) == f"{trusted['archiveSha256']}  {ARCHIVE}\n".encode(), "sidecar")
    digest = hashlib.sha256()
    with archive.open(ARCHIVE) as stream:
        while chunk := stream.read(CHUNK):
            digest.update(chunk)
    need(digest.hexdigest() == trusted["archiveSha256"], "archive-digest")
    with archive.open(ARCHIVE) as zipped, gzip.GzipFile(fileobj=zipped) as stream:
        tar_walk(stream, mapping, limits=limits)
    return manifest, mapping


def real_directory(path, private=False):
    need(type(path) is str and os.path.isabs(path) and os.path.normpath(path) == path, "destination")
    current = "/"
    for part in path.split("/")[1:]:
        current = os.path.join(current, part)
        info = os.lstat(current)
        need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode), "destination")
    if private:
        need(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700, "destination-private")
    return os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)


def parent_fd(base, name):
    fd = os.dup(base)
    try:
        for part in name.split("/")[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def extract_fresh(archive, mapping, parent, destination, stability, limits=LIMITS):
    need(os.path.isabs(destination) and os.path.normpath(destination) == destination
         and os.path.dirname(destination) == parent and os.path.basename(destination) not in ("", ".", ".."), "destination")
    parent_handle = real_directory(parent, private=True)
    base = None
    try:
        os.mkdir(os.path.basename(destination), 0o700, dir_fd=parent_handle)  # EEXIST is fatal, never overwrite.
        base = os.open(os.path.basename(destination), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_handle)
        need(stat.S_IMODE(os.fstat(base).st_mode) == 0o700, "destination-private")
        directories = sorted((entry for entry in mapping.values() if entry["type"] == "directory"), key=lambda entry: entry["path"].count("/"))
        for entry in directories:
            handle = parent_fd(base, entry["path"])
            try:
                os.mkdir(entry["path"].split("/")[-1], 0o700, dir_fd=handle)
            finally:
                os.close(handle)
        def writer(entry):
            handle = parent_fd(base, entry["path"])
            try:
                fd = os.open(entry["path"].split("/")[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=handle)
                try:
                    need(stat.S_ISREG(os.fstat(fd).st_mode) and os.fstat(fd).st_nlink == 1, "output-file")
                    os.fchmod(fd, entry["mode"])
                    return os.fdopen(fd, "wb")
                except BaseException:
                    os.close(fd)
                    raise
            finally:
                os.close(handle)
        with archive.open(ARCHIVE) as zipped, gzip.GzipFile(fileobj=zipped) as stream:
            tar_walk(stream, mapping, writer, limits)
        stability()  # All content verified again, input unchanged, before any symlink.
        for entry in mapping.values():
            if entry["type"] == "symlink":
                handle = parent_fd(base, entry["path"])
                try:
                    os.symlink(entry["target"], entry["path"].split("/")[-1], dir_fd=handle)
                finally:
                    os.close(handle)
        for entry in reversed(directories):
            handle = parent_fd(base, entry["path"] + "/placeholder")
            try:
                os.fchmod(handle, entry["mode"])
            finally:
                os.close(handle)
    finally:
        if base is not None:
            os.close(base)
        os.close(parent_handle)


def import_zip(path, trusted, parent=None, destination=None, limits=LIMITS):
    keys(trusted, ("zipSha256", "sourceCommit", "exporterSha256", "lockfileSha256", "manifestSha256", "archiveSha256"))
    need(type(trusted["sourceCommit"]) is str and re.fullmatch(r"[a-f0-9]{40}", trusted["sourceCommit"]), "trusted-identity")
    need(all(type(value) is str and DIGEST.fullmatch(value) for key, value in trusted.items() if key != "sourceCommit"), "trusted-identity")
    need((parent is None) == (destination is None), "destination")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as file:
        before = fingerprint(file)
        def stable():
            need(fingerprint(file) == before and file_digest(file) == trusted["zipSha256"] and fingerprint(file) == before, "zip-stability")
        stable()
        with zipfile.ZipFile(file) as archive:
            manifest, mapping = inspect_zip(archive, trusted, limits)
            stable()  # Full read-only pass completed before destination creation.
            if destination is not None:
                extract_fresh(archive, mapping, parent, destination, stable, limits)
            stable()
        return {"state": "imported" if destination is not None else "verified", "sourceCommit": trusted["sourceCommit"], "platform": PLATFORM,
                "versions": VERSIONS, "zipSha256": trusted["zipSha256"], "manifestSha256": trusted["manifestSha256"],
                "archiveSha256": trusted["archiveSha256"], **manifest["counts"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", required=True)
    for option in ("zip-sha256", "source-commit", "exporter-sha256", "lockfile-sha256", "manifest-sha256", "archive-sha256"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--private-parent")
    parser.add_argument("--cache-dir")
    args = parser.parse_args()
    try:
        need(sys.version_info >= (3, 12) and sys.platform == "linux" and platform.machine() == "x86_64", "runtime")
        with open("/etc/os-release", encoding="utf-8") as file:
            release = dict(line.rstrip().split("=", 1) for line in file if "=" in line)
        need(release.get("ID") == "ubuntu" and release.get("VERSION_ID") == '"24.04"', "runtime")
        trusted = {"zipSha256": args.zip_sha256, "sourceCommit": args.source_commit, "exporterSha256": args.exporter_sha256,
                   "lockfileSha256": args.lockfile_sha256, "manifestSha256": args.manifest_sha256, "archiveSha256": args.archive_sha256}
        print(json.dumps(import_zip(args.zip, trusted, args.private_parent, args.cache_dir), sort_keys=True))
        return 0
    except (Rejected, OSError, ValueError, TypeError, UnicodeError, EOFError, tarfile.TarError, zipfile.BadZipFile, gzip.BadGzipFile, zlib.error, RuntimeError):
        print(json.dumps({"state": "rejected", "code": "browser-toolchain-contract-rejected", "partialMayExist": args.cache_dir is not None}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
