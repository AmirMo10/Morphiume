"""Bounded clean-host package bootstrap. Default: print a plan, perform no IO.

This installs host packages only. It never transfers, restores, starts or seeds
Morphiume. Partial installation is retained for an operator to inspect.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


SOURCE_IP = "192.168.240.51"
PACKAGES = ("ca-certificates", "curl", "gnupg", "nginx", "ufw", "age", "git",
            "rsync", "python3", "jq", "tar", "gzip", "xz-utils", "util-linux",
            "iproute2", "procps", "openssh-server", "unattended-upgrades",
            "dnsutils", "iptables")
DOCKER_PACKAGES = ("docker-ce", "docker-ce-cli", "containerd.io",
                   "docker-buildx-plugin", "docker-compose-plugin")
CONFLICTS = ("docker.io", "docker-compose", "docker-compose-v2", "docker-doc",
             "docker-buildx", "podman-docker", "containerd", "runc")
FRESH_PATHS = ("/srv/morphiume", "/etc/morphiume", "/etc/morphiume-staging",
               "/etc/morphiume-staging-runtime", "/etc/morphiume-replica",
               "/opt/morphiume", "/var/lib/docker", "/var/lib/containerd",
               "/etc/apt/keyrings/docker.asc", "/etc/apt/sources.list.d/docker.sources",
               "/etc/apt/sources.list.d/docker.list", "/etc/nginx/sites-enabled")
VERSION = re.compile(r"[0-9][A-Za-z0-9.+:~_-]{0,120}\Z")


def installation_plan(pins=None):
    pins = pins or {}
    return {"mode": "unexecuted-package-plan", "serverMutation": False,
            "targetOs": "Ubuntu Server 24.04 LTS", "architecture": "amd64",
            "ubuntuPackages": list(PACKAGES), "dockerPackages": list(DOCKER_PACKAGES),
            "dockerPins": pins, "dockerAptOrigin": "https://download.docker.com/linux/ubuntu",
            "startsApplication": False, "restoresDatabase": False,
            "changesFirewallRules": False, "needsFreshTargetReview": True}


def validate_pins(pins):
    if set(pins) != set(DOCKER_PACKAGES):
        raise ValueError("Exactly five explicit Docker Apt package versions are required")
    if any(not isinstance(v, str) or not VERSION.fullmatch(v) for v in pins.values()):
        raise ValueError("Invalid exact Apt version")
    if pins["docker-ce"] != pins["docker-ce-cli"]:
        raise ValueError("Engine and CLI versions must match")


def validate_target_facts(facts, request):
    required = {"system", "uid", "osId", "osVersion", "architecture", "hostname", "machineId",
                "localIpv4", "cpuCount", "memoryBytes", "rootAvailableBytes", "existingPaths",
                "installedConflicts", "dockerInstalled", "nginxInstalled", "listenersOutsideSsh",
                "systemdFailed", "rebootRequired", "ntpSynchronized"}
    if not isinstance(facts, dict) or not required.issubset(facts):
        raise ValueError("Complete fresh host inspection is required")
    for key in ("uid", "cpuCount", "memoryBytes", "rootAvailableBytes"):
        if type(facts[key]) is not int or facts[key] < 0:
            raise ValueError("Host numeric facts must be nonnegative integers")
    for key in ("dockerInstalled", "nginxInstalled", "rebootRequired", "ntpSynchronized"):
        if type(facts[key]) is not bool:
            raise ValueError("Host safety flags must be explicit booleans")
    for key in ("localIpv4", "existingPaths", "installedConflicts", "listenersOutsideSsh", "systemdFailed"):
        if not isinstance(facts[key], list) or any(not isinstance(item, str) for item in facts[key]):
            raise ValueError("Host list facts must be explicit string arrays")
    if any(not isinstance(facts[key], str) or not facts[key] for key in ("system", "osId", "osVersion", "architecture", "hostname", "machineId")):
        raise ValueError("Host identity facts must be nonempty strings")
    for address in facts["localIpv4"]:
        ipaddress.IPv4Address(address)
    if SOURCE_IP in facts["localIpv4"]:
        raise ValueError("The source server is never a bootstrap target, including through an address alias")
    validate_pins(request.get("pins", {}))
    if not re.fullmatch(r"[a-f0-9]{32}", request.get("machineId", "")):
        raise ValueError("Bind the reviewed new host's machine ID")
    if not re.fullmatch(r"[a-f0-9]{64}", request.get("dockerKeySha256", "")):
        raise ValueError("Bind the reviewed official Docker signing-key bytes")
    target = ipaddress.IPv4Address(request.get("targetIp", "0.0.0.0"))
    if str(target) == SOURCE_IP or target.is_loopback or target.is_unspecified or target.is_multicast or target.is_link_local:
        raise ValueError("A new destination IPv4 address is required")
    network = ipaddress.ip_network(request.get("sshAllow", "0.0.0.0/0"), strict=False)
    if network.prefixlen < (24 if network.version == 4 else 64) or network.is_loopback or network.is_multicast or network.is_link_local:
        raise ValueError("Use an explicit restricted administrative SSH CIDR")
    if facts.get("system") != "Linux" or facts.get("uid") != 0:
        raise ValueError("Apply requires root on the reviewed Linux destination")
    if (facts.get("osId"), facts.get("osVersion"), facts.get("architecture")) != ("ubuntu", "24.04", "amd64"):
        raise ValueError("Only the reviewed Ubuntu 24.04 amd64 target is supported")
    if facts.get("hostname", "").lower() == "morphiume":
        raise ValueError("Use a distinct destination hostname, not the source hostname")
    if facts.get("machineId") != request["machineId"] or str(target) not in facts.get("localIpv4", []):
        raise ValueError("Target machine ID and local IPv4 binding do not match")
    if facts["cpuCount"] < 4 or facts["memoryBytes"] < 7 * 1024**3:
        raise ValueError("Target needs four vCPU and an 8 GiB VPS class (at least 7 GiB observed installed memory)")
    if facts.get("rootAvailableBytes", 0) < 60 * 1024**3:
        raise ValueError("Fresh root filesystem needs at least 60 GiB available; size data separately")
    if facts.get("existingPaths") or facts.get("installedConflicts") or facts.get("dockerInstalled") or facts.get("nginxInstalled"):
        raise ValueError("Target is not pristine; do not overwrite, uninstall or reset existing services/data")
    if facts.get("listenersOutsideSsh") or facts.get("systemdFailed") or facts.get("rebootRequired"):
        raise ValueError("Review listeners, failed services and required reboot before bootstrap")
    if not facts.get("ntpSynchronized"):
        raise ValueError("Synchronized time is required for TLS, sessions and MFA")
    return {"targetIp": str(target), "sshAllow": str(network), "freshTargetAccepted": True}


def command(args, timeout=30):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False,
                            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C",
                                 "DEBIAN_FRONTEND": "noninteractive"})
    if result.returncode or len(result.stdout) > 2 * 1024**2 or len(result.stderr) > 2 * 1024**2:
        raise ValueError("Bounded host command failed; inspect Apt/systemd locally before continuing")
    return result.stdout.decode("utf-8", errors="strict").strip()


def installed(name):
    result = subprocess.run(["dpkg-query", "-W", "-f=${db:Status-Status}", name],
                            capture_output=True, timeout=10, check=False)
    return result.returncode == 0 and result.stdout == b"installed"


def inspect_host():
    if platform.system() != "Linux":
        raise ValueError("Read-only target inspection requires Linux")
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    addresses = json.loads(command(["ip", "-j", "-4", "address", "show"]))
    listeners = command(["ss", "-H", "-lntup"]).splitlines()
    # Fresh server may have SSH and local DNS/NTP. Any other listener is reviewed manually.
    unexpected = [line for line in listeners if not re.search(r"(?:\]|\*|[0-9]):22\s", line)
                  and not re.search(r"\b(?:127\.[0-9.]+|\[?::1\]?):(?:53|123|323)\s", line)]
    memory = re.search(r"^MemTotal:\s+(\d+)\s+kB$", Path("/proc/meminfo").read_text(), re.M)
    return {"mode": "read-only-clean-host-observation", "system": "Linux", "uid": os.geteuid(),
            "osId": release.get("ID", "").strip('"'), "osVersion": release.get("VERSION_ID", "").strip('"'),
            "architecture": command(["dpkg", "--print-architecture"]), "hostname": platform.node(),
            "machineId": Path("/etc/machine-id").read_text().strip(),
            "localIpv4": [a["local"] for interface in addresses for a in interface.get("addr_info", []) if a.get("family") == "inet"],
            "cpuCount": os.cpu_count() or 0, "memoryBytes": int(memory.group(1)) * 1024 if memory else 0,
            "rootAvailableBytes": shutil.disk_usage("/").free,
            "existingPaths": [p for p in FRESH_PATHS if Path(p).exists() or Path(p).is_symlink()],
            "installedConflicts": [p for p in CONFLICTS if installed(p)],
            "dockerInstalled": installed("docker-ce") or shutil.which("docker") is not None,
            "nginxInstalled": installed("nginx"), "listenersOutsideSsh": unexpected,
            "systemdFailed": command(["systemctl", "--failed", "--no-legend", "--plain"]).splitlines(),
            "rebootRequired": Path("/var/run/reboot-required").exists(),
            "ntpSynchronized": command(["timedatectl", "show", "--property=NTPSynchronized", "--value"]) == "yes"}


def exclusive_file(path, value, mode):
    # Refuse pre-existing/symlink paths and retain partial state on failure.
    with path.open("xb") as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())


def apply_packages(facts, request):
    accepted = validate_target_facts(facts, request)
    command(["apt-get", "update"], timeout=300)
    command(["apt-get", "install", "--yes", "--no-install-recommends", *PACKAGES], timeout=600)
    with urllib.request.urlopen("https://download.docker.com/linux/ubuntu/gpg", timeout=30) as response:
        key = response.read(65537)
    if not key or len(key) > 65536 or hashlib.sha256(key).hexdigest() != request["dockerKeySha256"]:
        raise ValueError("Official Docker signing key differs from the reviewed bytes; partial Apt install retained")
    keyrings = Path("/etc/apt/keyrings")
    keyrings.mkdir(mode=0o755, exist_ok=True)
    if keyrings.is_symlink() or not keyrings.is_dir():
        raise ValueError("Apt keyring path must be a real directory")
    exclusive_file(keyrings / "docker.asc", key, 0o644)
    source = ("Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\n"
              "Components: stable\nArchitectures: amd64\nSigned-By: /etc/apt/keyrings/docker.asc\n")
    exclusive_file(Path("/etc/apt/sources.list.d/docker.sources"), source.encode(), 0o644)
    command(["apt-get", "update"], timeout=300)
    command(["apt-get", "install", "--yes", "--no-install-recommends",
             *[name + "=" + request["pins"][name] for name in DOCKER_PACKAGES]], timeout=600)
    actual = {name: command(["dpkg-query", "-W", "-f=${Version}", name]) for name in DOCKER_PACKAGES}
    if actual != request["pins"]:
        raise ValueError("Installed Docker package versions differ; application remains uninstalled")
    command(["systemctl", "enable", "--now", "docker"], timeout=60)
    command(["docker", "version", "--format", "{{.Server.Version}}"])
    command(["docker", "compose", "version", "--short"])
    return {"mode": "host-packages-installed", "target": accepted, "dockerPins": actual,
            "ubuntuPackageVersions": {name: command(["dpkg-query", "-W", "-f=${Version}", name]) for name in PACKAGES},
            "applicationDeployed": False, "databaseRestored": False, "firewallConfigured": False,
            "nextStep": "Review perimeter and migration manifest; nginx package may start its default site"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--inspect", action="store_true", help="Read target metadata; no network or mutation")
    mode.add_argument("--apply", action="store_true", help="Install host packages on an explicitly bound pristine destination")
    parser.add_argument("--machine-id")
    parser.add_argument("--target-ip")
    parser.add_argument("--ssh-allow")
    parser.add_argument("--docker-key-sha256")
    for name in DOCKER_PACKAGES:
        parser.add_argument("--" + name.replace(".", "-"))
    args = parser.parse_args(argv)
    if not args.inspect and not args.apply:
        return installation_plan()
    facts = inspect_host()
    if args.inspect:
        return facts
    request = {"machineId": args.machine_id or "", "targetIp": args.target_ip or "", "sshAllow": args.ssh_allow or "",
               "dockerKeySha256": args.docker_key_sha256 or "",
               "pins": {name: getattr(args, name.replace(".", "_").replace("-", "_")) or "" for name in DOCKER_PACKAGES}}
    return apply_packages(facts, request)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), indent=2))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print("Clean-host preparation stopped. Existing and partial state is retained; inspect before any continuation.", file=sys.stderr)
        raise SystemExit(1) from None
