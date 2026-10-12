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
- SSH authentication is pending. `root` is the provisional bootstrap account until an authorized login is confirmed.
- SSH reported a changed server host key during setup. Confirm the host fingerprint through the server console before changing the local known-hosts entry or reconnecting.
- Keep private keys and passwords outside this repository. See `DEPLOYMENT.md` for connection details.
