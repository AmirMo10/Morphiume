# Deployment server connection

The Morphiume deployment server is `192.168.240.51` on SSH port `22`.

## Current status

The server was prepared and verified on 2026-10-12. SSH public-key authentication works as `root`. The server hostname is `morphiume`, running Ubuntu 24.04.5 LTS.

The server's Ed25519 host fingerprint, confirmed through its console, is `SHA256:8CHT5tdzcOZb0udoponfH65bKCNtmGIIgng/Y+VUuAI`. The local known-hosts entry matches this fingerprint, and strict host-key checking is enabled.

## Deployment key

- Private key, local only: `C:\Users\Admin\.ssh\morphiume_deploy_ed25519`
- Public key: [`deploy/ssh/morphiume_deploy_ed25519.pub`](deploy/ssh/morphiume_deploy_ed25519.pub)
- Fingerprint: `SHA256:zoywnDcMVL2C8DUl3kR41Ymx6FJlsgFuV0lPZNIeEyU`
- Server host keys, local only: `C:\Users\Admin\.ssh\morphiume_known_hosts`

The private key has no passphrase for unattended deployment and is protected by Windows file permissions. Keep it outside GitHub.

## Connect

The deployment public key is authorized for `root`. From this computer, open an SSH session with:

```powershell
ssh morphiume-deploy
```

For a command without an interactive session:

```powershell
ssh morphiume-deploy 'id; hostname'
```

The alias is configured in `C:\Users\Admin\.ssh\config` and uses the dedicated deployment key, user `root`, port `22`, and the verified known-hosts file. Password prompts and agent forwarding are disabled.

If the server's host key changes in the future, confirm its fingerprint through the server console before updating the saved host key:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

## Prepared server

| Component | Verified configuration |
| --- | --- |
| CPU and RAM | 4 CPU cores; approximately 4.8 GiB RAM; 4 GiB swap |
| Docker Engine | 29.9.0; enabled on boot |
| Docker Compose | 5.6.0 |
| Docker Buildx | 0.38.0 |
| Nginx | Ubuntu package 1.24.0-2ubuntu7.18; enabled on boot |
| Firewall | UFW active; incoming TCP 22, 80, and 443 allowed |
| Updates | Daily package-list and unattended-upgrade timers enabled; automatic reboot disabled |
| Clock | NTP synchronized; server timezone UTC |
| Source checkout | `/opt/morphiume`, GitHub `main` |
| Container storage | `/var/lib/docker`, on the separate 40 GB `/var` volume |
| Reserved database storage | Existing 32 GB volume at `/srv/morphiume/postgres` |

Docker is installed through its [official Ubuntu Apt repository](https://docs.docker.com/engine/install/ubuntu/). Container logs use the [local logging driver](https://docs.docker.com/engine/logging/drivers/local/), with a maximum of five 10 MB files per container. Nginx logs use Ubuntu's installed log rotation.

Nginx serves HTTP on port 80 and proxies application requests to `127.0.0.1:3000`, including WebSocket upgrade headers. The application port is bound to loopback in the Compose template. HTTPS port 443 is allowed by the firewall but has no listener or certificate yet; access currently uses the private IP over HTTP.

The repository contains deployment configuration only. No application container or database service is running yet. The existing PostgreSQL mount has been preserved for a future database. `/srv/morphiume/shared` and `/srv/morphiume/backups` are available for future application data and backups; backup jobs will be defined with the application and database.

## Health and verification

The infrastructure endpoint is [http://192.168.240.51/healthz](http://192.168.240.51/healthz). It returns HTTP 200 and `morphiume server ready`. The root URL returns HTTP 503 with an application-unavailable message until the application is deployed.

Completed checks:

- SSH still works after firewall activation.
- Docker pulled and ran `hello-world` successfully.
- The installed Compose template started a temporary Nginx container, with its application port bound to `127.0.0.1:3000`.
- Host Nginx successfully proxied requests to that container. The temporary container and its network were removed afterward.
- The health endpoint returns HTTP 200 from the deployment computer, while port 3000 is unavailable from the network.
- Nginx configuration validation, Docker daemon configuration validation, and Compose configuration validation pass.
- Docker and Nginx are active and enabled on boot; systemd reports no failed units.

## Provisioning source

The committed configuration is in `deploy/`. The root provisioning script installs packages, backs up replaced configuration files, configures Docker and Nginx, creates deployment directories, enables update timers, and activates the firewall after allowing SSH.

To intentionally reapply the server configuration from the server checkout:

```sh
git -C /opt/morphiume pull --ff-only origin main
bash /opt/morphiume/deploy/provision.sh
```

Configuration backups are written to `/var/backups/morphiume/provision-*`. The provisioning log for the initial setup is `/var/log/morphiume-provision.log`. The script preserves existing deployment environment files and refuses to replace another Docker installation or a server checkout with uncommitted changes.

## Deploy the future application

Build and publish the application image before starting this stack. Configure it to listen on `0.0.0.0` inside the container, using port 3000 or the port selected below. Include an image health check so Compose can verify application readiness.

The prepared files are:

- `/etc/morphiume/compose.yaml`: installed application container template.
- `/etc/morphiume/deploy.env`: set `MORPHIUME_IMAGE` to the actual image, preferably pinned by digest. Set `MORPHIUME_CONTAINER_PORT` if the image uses a port other than 3000.
- `/etc/morphiume/app.env`: server-only application environment variables and secrets.

Both environment files are owned by root with mode `600`. Their current application-image value and application environment are empty. Default application limits are 2 GiB RAM and 2 CPU cores, configurable through `MORPHIUME_MEMORY_LIMIT` and `MORPHIUME_CPUS`.

After configuring the actual image and required application variables, run as root:

```sh
git -C /opt/morphiume pull --ff-only origin main
install -m 0644 /opt/morphiume/deploy/compose.yaml /etc/morphiume/compose.yaml
docker compose --env-file /etc/morphiume/deploy.env -f /etc/morphiume/compose.yaml config --quiet
docker compose --env-file /etc/morphiume/deploy.env -f /etc/morphiume/compose.yaml pull
docker compose --env-file /etc/morphiume/deploy.env -f /etc/morphiume/compose.yaml up --wait --wait-timeout 120
```

The [Compose `--wait` option](https://docs.docker.com/reference/cli/docker/compose/up/) waits for services to be running or healthy. Verify the application's own health endpoint after startup. Docker's restart policy starts deployed containers again when the daemon restarts.

For application logs:

```sh
docker compose --env-file /etc/morphiume/deploy.env -f /etc/morphiume/compose.yaml logs --tail 100
```
