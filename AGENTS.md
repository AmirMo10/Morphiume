# Morphiume repository instructions

## Repository

- GitHub repository: https://github.com/AmirMo10/Morphiume
- Local workspace: `S:\Morphiume`

## User workflow preference

- For tasks in this repository, commit completed changes and push them directly to GitHub `main` unless the user explicitly requests otherwise.
- Use `origin` as the GitHub remote and keep local `main` tracking `origin/main`.
- Run checks appropriate to each change before committing and pushing.
- Preserve existing user work, fetch remote updates before pushing, and use ordinary pushes without rewriting remote history.
- If a push fails or requires access that is unavailable, report the specific blocker and the local commit state.

## Deployment connection

- Deployment server: `192.168.240.51`, SSH port `22`.
- Use the dedicated SSH key at `C:\Users\Admin\.ssh\morphiume_deploy_ed25519`; its public key is in `deploy/ssh/morphiume_deploy_ed25519.pub`.
- SSH alias: `morphiume-deploy`. SSH user: `root`. Public-key authentication was verified on 2026-10-12.
- Server hostname: `morphiume`; operating system verified as Ubuntu 24.04.5 LTS.
- Verified server Ed25519 host fingerprint: `SHA256:8CHT5tdzcOZb0udoponfH65bKCNtmGIIgng/Y+VUuAI`. Keep strict host-key checking enabled and verify any future host-key change through the server console before updating the saved key.
- Keep private keys and passwords outside this repository. See `DEPLOYMENT.md` for connection details.

## Prepared deployment environment

- Docker Engine, Docker Compose, and host Nginx are installed and enabled on boot.
- Server Git checkout: `/opt/morphiume`, branch `main`, remote `https://github.com/AmirMo10/Morphiume.git`.
- Use HTTP at `http://192.168.240.51` until a domain or trusted TLS certificate is specified.
- Nginx proxies application traffic to `127.0.0.1:3000`; publish application containers on loopback only.
- `/healthz` is the infrastructure health endpoint. It does not report application readiness.
- Installed Compose template: `/etc/morphiume/compose.yaml`. Deployment settings: `/etc/morphiume/deploy.env`. Application secrets: `/etc/morphiume/app.env`.
- The repository has no application code or production image yet. Set the actual image before starting the application stack.
- The existing 32 GB PostgreSQL volume is mounted at `/srv/morphiume/postgres`; preserve that mount and its contents. Database configuration remains part of the future application deployment.
- Reusable provisioning source: `deploy/provision.sh`. Run it as root on the server when server configuration changes are intended.
