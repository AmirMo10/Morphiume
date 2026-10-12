# Deployment server connection

The Morphiume deployment server is `192.168.240.51` on SSH port `22`.

## Current status

SSH port 22 is reachable. A dedicated Ed25519 key has been generated locally, but authenticated access has not yet been established. The provisional bootstrap username is `root`.

A later connection attempt reported a changed server host key. The newly presented Ed25519 fingerprint was `SHA256:8CHT5tdzcOZb0udoponfH65bKCNtmGIIgng/Y+VUuAI`. The original local known-hosts entry has been preserved. Verify the server identity from its console before updating that entry.

## Deployment key

- Private key, local only: `C:\Users\Admin\.ssh\morphiume_deploy_ed25519`
- Public key: [`deploy/ssh/morphiume_deploy_ed25519.pub`](deploy/ssh/morphiume_deploy_ed25519.pub)
- Fingerprint: `SHA256:zoywnDcMVL2C8DUl3kR41Ymx6FJlsgFuV0lPZNIeEyU`
- Server host keys, local only: `C:\Users\Admin\.ssh\morphiume_known_hosts`

The private key has no passphrase for unattended deployment and is protected by Windows file permissions. Keep it outside GitHub.

## Finish authentication

Using an existing server login or console, add the public key to the intended SSH user's `~/.ssh/authorized_keys`. For the provisional `root` account, this is `/root/.ssh/authorized_keys`. Preserve any keys already in that file. The SSH directory should have mode `700` and `authorized_keys` mode `600`, owned by that user.

On the server console, check the server's Ed25519 host fingerprint:

```sh
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Compare this trusted result with the presented fingerprint before replacing any local known-hosts entry. Keep strict host-key checking enabled.

Once the key is authorized, test the local SSH alias:

```powershell
ssh morphiume-deploy 'id; hostname'
```

The alias is configured in `C:\Users\Admin\.ssh\config`. If the server uses another account, update its `User` setting and this document after confirming access.

Application deployment commands will be defined when the application and deployment task are specified.
