# Private preview access

The user explicitly authorized removing both HTTP Basic and browser admin login/MFA for the private preview at `http://192.168.240.51` on 18 October 2026. This exception is limited to the existing allowed client IP, `192.168.240.46/32`.

The default application still requires native admin authentication. Preview mode additionally requires an operator-installed `MEDIA_ROOT/.private-preview-access/config.json`, owned by the application UID, with file mode0600 and parent0700. It activates only for staging, the exact private-IP origin and both mock providers. Other origins, including isolated restores, ignore this capability before reading it. Malformed or insufficiently protected active configuration fails closed. The file is outside the UUID-only public media route and must never be committed, printed or included in public artifacts.

The operator command is bundled as `/app/runtime/private-preview-operator.mjs`. Run it through the staging image launcher as UID1001 with the normal application configuration and media mount:

```text
node /app/deploy/staging/runtime.mjs node --conditions=react-server /app/runtime/private-preview-operator.mjs enable
node /app/deploy/staging/runtime.mjs node --conditions=react-server /app/runtime/private-preview-operator.mjs status
node /app/deploy/staging/runtime.mjs node --conditions=react-server /app/runtime/private-preview-operator.mjs disable
```

Enable creates a separate, visibly named shared test operator with native password/TOTP enrollment. Native credentials, cookies and factor verification remain on the server. No shared admin cookie is sent to the browser. The application's ordinary session, current-role and grant checks, including fresh-factor checks inside inventory/order transactions, remain in force. The owner account is not reused or changed. Preview mutations are attributed to the shared operator and remain real changes to the staging database. Customer authentication and order ownership remain separate.

Disable first removes the active capability, then disables only that operator and revokes its sessions. Normal authorization explicitly rejects the reserved preview identity outside preview mode. A disabled identity or removed role is never automatically repaired. Re-enabling an existing reserved identity requires an explicit operator review; startup does not provision or reset accounts.

The full media tree, including this protected capability, is included in encrypted staging backups. An isolated restore uses a different origin and therefore keeps normal authentication, even though the frozen media extractor changes restored file modes. Any future public migration must exclude `.private-preview-access` and confirm normal authentication with an empty browser context. Preserve historical deployment, backup and restore evidence.

At `2026-10-18T08:50:11Z`, the versioned Basic-only transition completed with exit0. Its client check at `08:50:18.924681Z` observed anonymous home200 with no Basic challenge and unknown Host404, with no cookies or Authorization header. Nginx still permits only `192.168.240.46/32`. The previous authfile bytes, inode and modification time were unchanged. Server evidence: `metrics/private-preview-basic-d708ca74-6d0b-45a3-a925-65a36ef53b4d/03-reloaded.json`, SHA256 `e6c78fe3b7d1ed02ececf919885b6400e9ab64ffa510c682776dcafffc1b468e`.

The application/admin exception is deployed and accepted for source `3b62c340cbcb9becec3b1a9552eedeecb4837be2`. Both source/image CI jobs passed; the actual clean browser review passed 12 routes and eight boundary checks and the native purchase passed 17 checks. Fresh fifth recovery passed six checks; it is stopped/preserved, its temporary RAM key removed and source app/worker healthy. New one-time health/backup measurements and recurring activation passed. Final read-only observation is `2026-10-18T12:27:06.374753+00:00`; fresh headed Chrome storefront/admin/products/orders tabs were accepted at `2026-10-18T12:27:53.817Z` with four 200 responses and zero admin cookies, and left open for review. [Full execution, exact identities and limits](../qa/PRIVATE_PREVIEW_EXECUTION.md).
