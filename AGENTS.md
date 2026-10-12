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
