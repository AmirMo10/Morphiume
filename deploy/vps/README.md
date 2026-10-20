# Clean-host staging replica

The OVF/OVA plan is canceled. Use a fresh **Ubuntu Server 24.04 LTS amd64** VPS and the accepted application image plus an encrypted logical database/media/config transfer. Git alone cannot reproduce the current catalog, orders, accounts, MFA, settings or uploaded images.

Start with [the ordered migration runbook](../../docs/ops/NEW_VPS_MIGRATION.md). Machine-readable package, resource, image and network requirements are in [requirements.json](requirements.json).

```bash
# These two defaults are inert; they work without Docker or a database.
python3 -B deploy/vps/bootstrap.py
python3 -B deploy/vps/restore_media.py

# Read-only metadata on the NEW Linux target only:
sudo python3 -B deploy/vps/bootstrap.py --inspect
```

`bootstrap.py --apply` installs host Apt packages only, after complete target identity/freshness/resource checks and explicit exact Docker package/key pins. It never deploys the application, restores data, removes conflicting packages or configures firewall policy. A partial install is retained and must be inspected before continuation; this is not an automatically replayed installer. Keep the provider firewall restricted before installing Nginx, since its package may start a default HTTP site.

`compose.replica.yaml` is a separate target-only staging project. The database has no published port, the app binds loopback, and app/worker are opt-in under the `application` profile. Its three immutable-image inputs/config files are operator-supplied after full release acceptance. `init-replica.sh` provisions only the distinct owner/runtime roles in a fresh PostgreSQL cluster. The actual application database is restored intact; no seed or migration service exists here.

`restore_media.py` validates bounded archive paths/types/checksums before writing into absent target paths. The old `.private-preview-access/config.json` is quarantined in protected configuration, outside the media mount. Normal owner login/MFA applies at the new origin. It does not decrypt data or take custody of recovery keys.

No destination VPS was supplied or deployed by preparing these files. Target Nginx/TLS/firewall, secret rebinding, source capture, release load/Engine proof, logical restore, acceptance and scheduler rebinding remain explicit runbook phases. The old server's origin, mount identities, approved operator markers, six stopped restore projects and timer approvals are source-specific and are not reusable target approvals.
