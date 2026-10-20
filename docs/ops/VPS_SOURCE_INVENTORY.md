# Source VPS inventory and replacement sizing

Observed by read-only, strict host-key-checked SSH at **2026-10-20T06:24:06.196477Z**. No package install, service restart, backup, export, source deployment or data mutation was performed. Raw private transport/inventory evidence remains outside Git; this is its allowlisted operational summary. See [migration procedure](NEW_VPS_MIGRATION.md) and [version matrix](VPS_DEPENDENCY_MATRIX.md).

| Item | Actual source observation |
| --- | --- |
| Source | `192.168.240.51`, Ubuntu 24.04.5 LTS noble, x86_64 |
| Kernel | `6.8.0-146-generic` |
| CPUs | 4 |
| RAM | 5,155,532,800 bytes, about 4.80 GiB |
| Available RAM at observation | 4,073,652,224 bytes, about 3.79 GiB |
| Swap | About 4 GiB; negligible use at observation |
| Root filesystem | 25,185,042,432 bytes total; 4,870,270,976 used; 19,009,507,328 available |
| Docker | Engine 29.9.0, API1.56, containerd2.4.1, runc1.5.2 |
| Compose / Buildx | 5.6.0 / 0.38.0 |
| Active app / worker / DB | All three healthy |
| Source app image | Source `32b89e13d31288fe4497f7419e170550baf5b293`; Engine ID `sha256:a72b341aaef4dc0006f3073015aac228cba692afca73ebbab49a1da9883b5391` |

The virtual block disk is larger than the root filesystem; do not equate provider disk size with usable allocated root/data space. Three short idle samples observed app75.63–75.64MiB, worker39.05MiB and database195.9MiB. This is an idle observation, not peak use or a capacity/load benchmark. Runtime ceilings are DB1280MiB/1.5CPU, app1536MiB/1.5CPU and worker384MiB/0.5CPU, totaling3200MiB and3.5CPU. Host/kernel/cache/proxy/backup/restore need room beyond those ceilings.

## Purchase recommendation

Buy **Ubuntu Server24.04 LTS amd64, 4vCPU, 8GiB RAM and100GB NVMe** for the initial replica, with builds/browser tests on separate runners and encrypted backups offsite. Choose **8vCPU/16GiB/160GB NVMe** for concurrent isolated recovery and growth. These are engineering recommendations based on the actual service ceilings and operating tasks, not a promised request rate. A4GiB host has too little comfortable headroom above the3.125GiB container ceilings. Optional2–4GiB swap is emergency margin, not replacement RAM.

The currently used root space is only about4.54GiB. The100GB recommendation budgets growth, retained accepted/fallback images, encrypted backups and restore working space; it is not a claim that the current store occupies100GB. At final capture, recompute allocated PG/media/backup/image bytes and preserve at least25% free headroom. Keep historical stopped restore archives separate from active services.

## Dated source Apt inventory

These are actual installed source versions, not unverified destination pins. Resolve signed-repository availability and current security updates on the fresh target; document any reviewed difference. Five Docker package versions must be explicitly bound by the bootstrap. Ubuntu host packages and Alpine image libraries are separate.

| Package | Installed version |
| --- | --- |
| `docker-ce` | `5:29.9.0-1~ubuntu.24.04~noble` |
| `docker-ce-cli` | `5:29.9.0-1~ubuntu.24.04~noble` |
| `containerd.io` | `2.4.1-2~ubuntu.24.04~noble` |
| `docker-compose-plugin` | `5.6.0-1~ubuntu.24.04~noble` |
| `docker-buildx-plugin` | `0.38.0-1~ubuntu.24.04~noble` |
| `nginx` | `1.24.0-2ubuntu7.18` |
| `age` | `1.1.1-1ubuntu0.24.04.3` |
| `python3` | `3.12.3-0ubuntu2.1` |
| `openssh-server` | `1:9.6p1-3ubuntu13.20` |
| `ufw` | `0.36.2-6` |
| `iptables` | `1.8.10-3ubuntu2` |
| `git` | `1:2.43.0-1ubuntu7.3` |
| `curl` | `8.5.0-2ubuntu10.16` |
| `jq` | `1.7.1-3ubuntu0.24.04.2` |
| `rsync` | `3.2.7-1ubuntu1.5` |
| `tar` | `1.35+dfsg-3ubuntu0.4` |
| `gzip` | `1.12-1ubuntu3.2` |
| `util-linux` | `2.39.3-9ubuntu6.6` |
| `ca-certificates` | `20260601~24.04.1` |
| `systemd-timesyncd` | `255.4-1ubuntu8.18` |

## Allocated directory bytes

Values overlap when a parent contains listed children; do not add them together. Docker database volumes and image layers need separate accounting in the final capture manifest.

| Path | Allocated bytes |
| --- | ---: |
| `/srv/morphiume/postgres` (reserved legacy path) | 20,480 |
| Active PostgreSQL cluster (separate read-only observation at 06:39:43.244326Z) | 185,417,728 |
| Full staging parent at that later observation | 1,708,163,072 |
| Runtime media | 2,863,104 |
| Runtime encrypted backups | 19,279,872 |
| Runtime stopped restore trees | 435,101,696 |
| Runtime release archives | 527,400,960 |
| Runtime incoming archives | 439,771,136 |
| Runtime parent tree | 1,436,418,048 |
| `/var/lib/docker` | 902,262,784 |

No destination has been supplied or provisioned. Actual target package installation, encrypted full DB/media restore, exact row/ACL comparison, target purchase/MFA/recovery/scheduling, IPv4/IPv6 perimeter and routing cutover remain target execution gates. The current application upgrade is accepted only by its own new CI evidence, separately from these source measurements.
