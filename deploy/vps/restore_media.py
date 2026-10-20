"""Validate a bounded media tar; explicit apply extracts only into fresh target paths.

Source preview capability is quarantined outside the application media mount.
No arguments returns an inert plan. Decryption and secret/key custody are external.
"""
import argparse
import hashlib
import json
import ipaddress
import os
import platform
import re
import stat
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath


DESTINATION = Path("/srv/morphiume/replica/media")
QUARANTINE = Path("/etc/morphiume-replica/quarantine")
MAX_FILES = 10000
MAX_BYTES = 8 * 1024**3
MAX_FILE_BYTES = 64 * 1024**2
CAPABILITY = ".private-preview-access/config.json"


def member_path(member):
    name = member.name[2:] if member.name.startswith("./") else member.name
    if not (member.isdir() or member.isfile()) or member.issym() or member.islnk() or member.size < 0 or member.size > MAX_FILE_BYTES:
        raise ValueError("Archive links, special entries and oversized files are refused")
    if member.isdir() and member.size != 0:
        raise ValueError("Directory entries must have zero data size")
    if name in ("", ".") and member.isdir():
        return None
    path = PurePosixPath(name)
    if not name or "\\" in name or "\0" in name or path.is_absolute() or any(part in (".", "..", "") for part in name.rstrip("/").split("/")):
        raise ValueError("Unsafe archive member path")
    if member.isfile() and name.endswith("/"):
        raise ValueError("Regular file names must not end in a slash")
    canonical = name.rstrip("/")
    if path.parts[0] == ".private-preview-access" and name.rstrip("/") not in (".private-preview-access", CAPABILITY):
        raise ValueError("Unknown preview authority member")
    if canonical == ".private-preview-access" and not member.isdir() or canonical == CAPABILITY and not member.isfile():
        raise ValueError("Preview authority parent/config types differ from the exact contract")
    return path


def validate_members(members):
    entries, files, total, count, root_seen = {}, 0, 0, 0, False
    for member in members:
        count += 1
        if count > MAX_FILES:
            raise ValueError("Excessive archive members, including root directories")
        path = member_path(member)
        if path is None:
            if root_seen:
                raise ValueError("Duplicate archive root directory")
            root_seen = True
            continue
        name = path.as_posix()
        if name in entries or len(entries) >= MAX_FILES:
            raise ValueError("Duplicate or excessive archive members")
        for parent in path.parents:
            if parent.as_posix() in entries and not entries[parent.as_posix()]:
                raise ValueError("File/directory archive conflict")
        if member.isfile() and any(other.startswith(name + "/") for other in entries):
            raise ValueError("File/directory archive conflict")
        entries[name] = member.isdir()
        files += int(member.isfile())
        total += member.size
        if total > MAX_BYTES:
            raise ValueError("Archive expansion bound exceeded")
    return {"entries": count, "files": files, "bytes": total,
            "previewCapabilityQuarantined": CAPABILITY in entries}


def fresh_directory(path, uid=0, gid=0):
    if path.exists() or path.is_symlink():
        raise ValueError("Existing target path must be retained, never overwritten")
    for parent in path.parents:
        if parent.is_symlink():
            raise ValueError("Target ancestors must not be symlinks")
    if not path.parent.is_dir():
        raise ValueError("Protected target parent must already exist")
    parent = path.parent.stat()
    if parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) != 0o700:
        raise ValueError("Target parent must be root-owned mode0700")
    path.mkdir(mode=0o700)
    os.chown(path, uid, gid)


def validate_destination_identity(facts, request):
    if not isinstance(request, dict) or not re.fullmatch(r"[a-f0-9]{32}", request.get("machineId", "")):
        raise ValueError("Bind the reviewed destination machine ID")
    if not isinstance(facts, dict) or set(facts) != {"system", "uid", "hostname", "machineId", "localIpv4"}:
        raise ValueError("Complete destination identity facts are required")
    if facts["system"] != "Linux" or type(facts["uid"]) is not int or facts["uid"] != 0:
        raise ValueError("Extraction requires root on the reviewed Linux target")
    if not isinstance(facts["hostname"], str) or not facts["hostname"] or facts["hostname"].lower() == "morphiume":
        raise ValueError("Destination hostname must differ from the source")
    if not isinstance(facts["localIpv4"], list) or not facts["localIpv4"] or any(not isinstance(a, str) for a in facts["localIpv4"]):
        raise ValueError("Explicit local destination IPv4 facts are required")
    for address in facts["localIpv4"]:
        ipaddress.IPv4Address(address)
    target = ipaddress.IPv4Address(request.get("targetIp", "0.0.0.0"))
    if "192.168.240.51" in facts["localIpv4"] or str(target) == "192.168.240.51" or target.is_unspecified or target.is_loopback or target.is_multicast or target.is_link_local:
        raise ValueError("Source addresses and non-target IPs are refused")
    if facts["machineId"] != request["machineId"] or str(target) not in facts["localIpv4"]:
        raise ValueError("Destination machine ID/IP differs from the reviewed target")


def inspect_destination_identity():
    if platform.system() != "Linux":
        raise ValueError("Destination extraction requires Linux")
    result = subprocess.run(["ip", "-j", "-4", "address", "show"], stdin=subprocess.DEVNULL,
                            capture_output=True, timeout=10, check=False,
                            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"})
    if result.returncode or len(result.stdout) > 65536:
        raise ValueError("Destination address observation failed")
    addresses = json.loads(result.stdout)
    return {"system": "Linux", "uid": os.geteuid(), "hostname": platform.node(),
            "machineId": Path("/etc/machine-id").read_text().strip(),
            "localIpv4": [a["local"] for interface in addresses for a in interface.get("addr_info", []) if a.get("family") == "inet"]}


def restore(archive, expected_sha256, apply=False, identity=None):
    if apply:
        validate_destination_identity(inspect_destination_identity(), identity)
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("An explicit plaintext archive SHA-256 is required")
    if os.name != "posix" or not archive.is_absolute() or archive.is_symlink():
        raise ValueError("Use a protected absolute archive on the reviewed Linux target")
    if not re.fullmatch(r"/dev/shm/morphiume-replica-[A-Za-z0-9_-]+/media\.tar\.gz", archive.as_posix()):
        raise ValueError("Plaintext media archive must remain in the reviewed temporary RAM directory")
    info = archive.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 1024**3:
        raise ValueError("Archive must be a protected root-owned regular file, at most 1 GiB compressed")
    parent = archive.parent.stat()
    if archive.parent.is_symlink() or not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) != 0o700 or archive.resolve() != archive:
        raise ValueError("Plaintext archive parent must be a real protected directory")
    with archive.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected_sha256:
        raise ValueError("Archive checksum differs")
    with tarfile.open(archive, "r:gz") as tar:
        summary = validate_members(tar)
    if not apply:
        return summary | {"mode": "validated-not-extracted", "serverMutation": False}
    if os.geteuid() != 0:
        raise ValueError("Extraction requires root on the reviewed target")
    # The target and quarantine must BOTH be absent before the first write.
    if any(p.exists() or p.is_symlink() for p in (DESTINATION, QUARANTINE)):
        raise ValueError("Existing/partial target data is retained; no replay or merge")
    fresh_directory(QUARANTINE)
    # Keep the entire unfinished tree inaccessible to the app UID until the last step.
    fresh_directory(DESTINATION)
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            relative = member_path(member)
            if relative is None:
                continue
            private = relative.parts[0] == ".private-preview-access"
            target = (QUARANTINE if private else DESTINATION).joinpath(*relative.parts)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if member.isdir():
                target.mkdir(mode=0o700, exist_ok=True)
            else:
                source = tar.extractfile(member)
                with source, target.open("xb") as output:
                    remaining = member.size
                    while remaining:
                        data = source.read(min(remaining, 1024**2))
                        if not data:
                            raise ValueError("Truncated archive entry; partial data retained")
                        output.write(data)
                        remaining -= len(data)
                target.chmod(0o600)
            # Parents are private until all files are safely extracted.
    for root, dirs, files in os.walk(DESTINATION, topdown=False):
        os.chown(root, 1001, 1001)
        os.chmod(root, 0o750)
        for name in files:
            os.chown(Path(root) / name, 1001, 1001)
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected_sha256:
            raise ValueError("Archive changed during extraction; do not start application")
    return summary | {"mode": "media-extracted-preview-authority-quarantined",
                      "serverMutation": True, "applicationStarted": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--machine-id")
    parser.add_argument("--target-ip")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--inspect", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    if not args.inspect and not args.apply:
        return {"mode": "unexecuted-media-plan", "serverMutation": False,
                "destination": DESTINATION.as_posix(), "quarantine": QUARANTINE.as_posix()}
    if args.archive is None or args.expected_sha256 is None:
        raise ValueError("Explicit archive and checksum are required")
    return restore(args.archive, args.expected_sha256, args.apply,
                   {"machineId": args.machine_id or "", "targetIp": args.target_ip or ""})


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2))
    except (OSError, ValueError, tarfile.TarError):
        print("Media restore stopped. Partial data is retained; never replay or merge before review.", file=sys.stderr)
        raise SystemExit(1) from None
