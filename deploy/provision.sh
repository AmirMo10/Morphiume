#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run this script as root on the Morphiume deployment server." >&2
    exit 1
fi

source /etc/os-release
if [[ $ID != ubuntu || ${VERSION_CODENAME:-} != noble ]]; then
    echo "This provisioning script supports Ubuntu 24.04 (noble)." >&2
    exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for config in nginx/morphiume.conf docker/daemon.json compose.yaml deploy.env.example; do
    test -f "$script_dir/$config"
done

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt_get=(apt-get -o DPkg::Lock::Timeout=300 -o Acquire::Retries=3)
"${apt_get[@]}" update
"${apt_get[@]}" install -y --no-install-recommends \
    ca-certificates curl git nginx ufw unattended-upgrades python3

# Refuse to replace a different Docker installation or its container runtime.
for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null | grep -qx installed; then
        echo "Conflicting package $package is installed; review it before provisioning Docker CE." >&2
        exit 1
    fi
done

install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --retry 3 \
    https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
"${apt_get[@]}" update
"${apt_get[@]}" install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

backup_dir="/var/backups/morphiume/provision-$(date -u +%Y%m%dT%H%M%S)-$$"
install -d -m 0700 "$backup_dir"
install_config() {
    local source_file=$1 destination=$2 mode=${3:-0644}
    if [[ -f $destination ]] && cmp -s "$source_file" "$destination"; then
        return
    fi
    if [[ -e $destination ]]; then
        cp -a -- "$destination" "$backup_dir/$(basename -- "$destination")"
    fi
    install -m "$mode" -- "$source_file" "$destination"
}

install -d -m 0755 /etc/docker
docker_config=$(mktemp)
trap 'rm -f -- "$docker_config"' EXIT
python3 - "$script_dir/docker/daemon.json" /etc/docker/daemon.json "$docker_config" <<'PY'
import json
import pathlib
import sys

desired_path, existing_path, output_path = map(pathlib.Path, sys.argv[1:])
existing = json.loads(existing_path.read_text()) if existing_path.exists() else {}
existing.update(json.loads(desired_path.read_text()))
output_path.write_text(json.dumps(existing, indent=2) + "\n")
PY
dockerd --validate --config-file "$docker_config"
docker_changed=false
if ! cmp -s "$docker_config" /etc/docker/daemon.json; then
    install_config "$docker_config" /etc/docker/daemon.json
    docker_changed=true
fi
systemctl enable --now docker
if [[ $docker_changed == true ]]; then
    systemctl restart docker
fi

install -d -m 0700 /etc/morphiume /srv/morphiume/backups /srv/morphiume/shared
install_config "$script_dir/compose.yaml" /etc/morphiume/compose.yaml
if [[ ! -e /etc/morphiume/deploy.env ]]; then
    install -m 0600 "$script_dir/deploy.env.example" /etc/morphiume/deploy.env
fi
if [[ ! -e /etc/morphiume/app.env ]]; then
    install -m 0600 /dev/null /etc/morphiume/app.env
fi

repo_dir=/opt/morphiume
repo_url=https://github.com/AmirMo10/Morphiume.git
if [[ ! -e $repo_dir ]]; then
    git clone --branch main "$repo_url" "$repo_dir"
elif [[ -d $repo_dir/.git ]]; then
    test "$(git -C "$repo_dir" remote get-url origin)" = "$repo_url"
    test "$(git -C "$repo_dir" branch --show-current)" = main
    if [[ -n $(git -C "$repo_dir" status --porcelain) ]]; then
        echo "Existing server checkout contains changes; preserving them." >&2
        exit 1
    fi
    git -C "$repo_dir" pull --ff-only origin main
else
    echo "$repo_dir already exists and is not the expected Git checkout." >&2
    exit 1
fi

install_config "$script_dir/nginx/morphiume.conf" /etc/nginx/sites-available/morphiume
ln -sfn /etc/nginx/sites-available/morphiume /etc/nginx/sites-enabled/morphiume
if [[ -L /etc/nginx/sites-enabled/default ]] && \
   [[ $(readlink -f /etc/nginx/sites-enabled/default) == /etc/nginx/sites-available/default ]]; then
    cp -a /etc/nginx/sites-enabled/default "$backup_dir/default-site-link"
    rm -- /etc/nginx/sites-enabled/default
fi
nginx -t
systemctl enable --now nginx
systemctl reload nginx

periodic_config=$(mktemp)
cat > "$periodic_config" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
install_config "$periodic_config" /etc/apt/apt.conf.d/52morphiume-periodic
rm -- "$periodic_config"
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer

# Allow SSH before activating the firewall so the deployment session remains usable.
ufw allow 22/tcp comment 'Morphiume SSH'
ufw allow 80/tcp comment 'Morphiume HTTP'
ufw allow 443/tcp comment 'Morphiume future HTTPS'
ufw default deny incoming
ufw default allow outgoing
ufw --force enable

MORPHIUME_IMAGE=hello-world:latest docker compose \
    --env-file /etc/morphiume/deploy.env -f /etc/morphiume/compose.yaml config --quiet
systemctl is-active docker nginx
curl --fail --silent --show-error http://127.0.0.1/healthz
echo "Morphiume server provisioning completed."
