# Deployment server connection

The Morphiume deployment server is `192.168.240.51` on SSH port `22`.

## Current status

SSH public-key authentication was verified as `root` on 2026-10-12. The server hostname is `morphiume`, running Ubuntu 24.04.5 LTS.

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

Application deployment commands will be defined when the application and deployment task are specified.
