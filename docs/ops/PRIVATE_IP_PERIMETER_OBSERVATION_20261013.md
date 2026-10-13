# Private-IP preview perimeter: read-only observation, 2026-10-13

Observed at **2026-10-13T03:18:09.328571Z–03:18:09.524375Z** under Root's narrow metadata dispatch. The current origin remains SSH3100; this observation does not approve a client inventory or activate `http://192.168.240.51`. The accepted613 application and immutable591 Ops are the existing runtime references. Its active-profile pointer schema and recorded profile SHA256 matched the previously accepted SSH profile; no full profile/image/Ops reproof ran. No archive/image proof, direct SQL, native browser flow, writer/worker stop, health service, backup, credential, lease, approval, Nginx reload or server-file write was performed.

## Actual access and listener facts

| Observation | Actual result | Practical boundary |
| --- | --- | --- |
| Windows client GET `http://192.168.240.51/` | 503 | Current Nginx does not serve the runtime storefront |
| Windows client GET `http://192.168.240.51/healthz` | 200 | Infrastructure response; does not establish app/DB/business acceptance |
| Server-local GET `127.0.0.1:3001/api/health/ready` | 200 | The runtime readiness handler ran once; it performs its own DB probe. No direct PG command was issued by this task |
| TCP80 | One IPv4 wildcard and one IPv6 wildcard listener | Existing Nginx receives either address family; private addressing alone is not an access gate |
| TCP443 / TCP3000 / TCP3002 | No listeners at this observation | No TLS listener, legacy app listener or running restored-app listener was observed |
| TCP3001 / TCP5433 | One IPv4 loopback listener each; no IPv6/wildcard/non-loopback binding | Runtime app and shared staging PostgreSQL host ports are loopback-bound at this instant |
| Nginx sites | One enabled site; exact `sites-enabled/morphiume` link | One proxy directive targets legacy loopback3000, not runtime3001 |
| Existing site protection | No Basic-auth directive; `/healthz` has an early200 return | Existing infrastructure response is not proof of the proposed all-route preview gate |
| Nginx worker setting | Expanded configuration selects `www-data` | Actual future Basic-auth file access remains to be demonstrated against the scoped directory/file permissions |

The same root503/healthz200 statuses were observed from the server itself. HTTP observations retained statuses only, without bodies, cookies or control headers. Readiness is not a full scheduled-health or worker/business proof. No unexpected origin or unauthorized-client request was sent.

The address inventory contained13 interfaces,8 IPv4 addresses and13 IPv6 addresses, including loopback/container interfaces. The requested private IPv4 address was present. No globally routable IPv6 address or IPv6 default route was present; one IPv4 default route was present. No finite address-lifetime field was observed. These facts do not establish router/NAT/VPN policy or exclude reachable link-local IPv6 paths. Interface names, addresses and gateway details remain in the protected local capture.

The server saw one valid RFC1918 IPv4 SSH client. Its literal address is retained privately and can form a candidate `/32`; it is **not an approved browser client/device/network inventory**. WSL or another generator may produce a different source path/address, so do not inherit that candidate automatically.

## Firewall and configuration evidence

UFW was active, with default deny for incoming and routed traffic, and IPv6 enabled. Actual rule rows were3 IPv4 and3 IPv6: TCP22/80/443 each had one allowance per family from Anywhere. No firewall rule was changed. The initial helper's `ufwIpv6RuleCount=6` counted two `(v6)` markers per row; the preserved raw capture was subsequently decoded into the correct3-row derived summary. The original artifact remains unchanged.

Docker documents that published container traffic can bypass the UFW path; UFW status alone is insufficient evidence of container exposure. Here the selected live app/DB socket metadata was loopback-only, but external allow/deny and alternate-interface tests still remain required. See [Docker firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

| Exact observation input | SHA256 |
| --- | --- |
| `/etc/nginx/sites-available/morphiume` bytes | `e0d645b9313bb85f3778e47dea152a2c02eab691679a125b1117ee206856aec7` |
| Captured `nginx -T` stdout | `dccd02cfd48a039fd52058859d5dbc79023fba6d8c6bfa0a6f6e9eaf707d618c` |
| `ip -j address` stdout | `426dca7ec9150ff1bf2fda4fc5b10116df1618512ce887118ca7b18930b8a8cf` |
| `ip -j route` stdout | `2b9beb188e4d069f03faf0281ef91fd6b3cc7edd0d758c82d662ca0322007e35` |
| `ss -lntH` stdout | `0cdde127eac06338c77247645b632d0b25512c0540cf2a92c28655924d1e2d86` |
| `ufw status verbose` stdout | `6a4e243cd5ec3d3f7e667b31ffbf728101eb789777686e5b7ec572f18fbd13b4` |

The Nginx expanded configuration was bounded, captured and hashed inside the remote process; its plaintext was never printed or transmitted in the observation result. Network/rule metadata was saved only under `S:/Morphiume/.local/private-ip-observation-5cd4b006-aaae-45b0-8a02-cce1ae012310/`. The directory's inherited ACLs were disabled and its two allow entries were independently verified as only the operator and SYSTEM. The capture contains no plaintext application configuration, credentials, SSH connection ports, OTP, cookies or Basic password/hash. It is ignored by Git.

Private observation SHA256: `735b57bc95446165882ee454b1842678532c71e0cbbd02ec6704d50ef2152e67`; corrected sanitized derived-summary SHA256: `742f1992472d83a13f0d6ead85f1967c77a7acf3f2aabdf11c95d22552d75c00`. Remote read-only helper canonical SHA256: `865089acf28640af00cc0381805909c308df26aeb85df5409e40ccb3708006d5`. Helpers are ignored local observation tools, not runtime Ops or authorized actuators.

This is a dated factual snapshot. It cannot be copied unchanged into old591's approved `preview-inventory.json`: that schema requires all12 actual reviewed checks, a finite approved client list, and observations no older than one hour. Router/VPN policy, unauthorized-path denial, alternate routes, SSH management preservation through a change, worker access, insecure-origin application prerequisites and any active timer disposition remain incomplete. Re-observe and explicitly approve the exact inventory at dispatch.

## Available browser-generator inventory

Only `wsl.exe --list --verbose` was run. Microsoft documents this as listing installed distribution state/version; no distribution execution, install/update, Docker backend startup or browser installation was performed. See [Microsoft WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

| Existing option | Actual evidence | Unrun requirements before selection |
| --- | --- | --- |
| Desktop Ubuntu WSL2 | One installed Ubuntu WSL2 distribution, stopped | Root-reviewed local startup; Linux Node/package manager and exact Chromium/Firefox/WebKit/dependency inventory; approved direct route/source to192.168.240.51; isolated generator resources and private QA input |
| Docker Desktop | CLI executable exists; its WSL distribution is stopped | No daemon contact or backend launch occurred; this is not an available Linux browser worker yet |
| Existing managed SSH hosts | Four other concrete aliases are configured locally | No other host was contacted. OS, resources, installed browsers and approved private-network path remain unknown; select a specific existing host and obtain a separate bounded metadata dispatch rather than scanning |
| GitHub Linux CI | Coordinator reports three-engine acceptance of52 on the CI synthetic URL | No192.168.240.51 reachability/Basic-auth/native result follows from it. A private network path is separate infrastructure, not assumed; see [GitHub private-network runner documentation](https://docs.github.com/en/actions/how-tos/manage-runners/github-hosted-runners/connect-to-a-private-network) |

No Linux browser generator is presently confirmed ready by this inventory. Ubuntu WSL2 is the closest already installed candidate, but its Linux executables/browser binaries/network path were not queried because that would start its currently stopped environment. All browser work remains outside the deployment host's resource budget. No browser/package installation or test container on the deployment host is authorized by this report.

Root's reported Windows Firefox normal-launch failure remains separate from application correctness. The reported Windows WebKit `credentials: omit` privacy failure concerns only anonymous analytics in newer source; current old613 has no analytics, and newer staging capture defaults false. Neither report is an actual private-IP native-acceptance result. Do not broaden those findings into unsupported all-engine conclusions or disable native acceptance.

## Exact remaining activation gates

1. **Accepted application/profile compatibility:** source review of613 confirms six browser components directly call `crypto.randomUUID`. Its secure-context requirement is documented by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID). Newer source has the operation-ID fallback; this read-only task does not establish that it is in the currently running613 image or that the private-IP flow passes. Select a separately accepted compatible immutable image before cutover. An upgrade containing analytics/notifications needs the separate migration/consumer/rollback gate; it cannot inherit613/DB11 proof or silently adopt a future Ops bundle. Do not use a browser secure-context override to simulate success at the requested HTTP origin.
2. **Preserved real baseline and explicit normalization:** the actual3100 retained T25 and3101 six-check restore are complete. Old591 `validate_baselines` still requires restore `origin=http://localhost:3101`, `workerStarted=false` and `fixtureManifestSha256` exactly equal to the3100 retained baseline. Root's marker currently uses `fixtureSha256`. Root must verify that equality from the protected original fixture/results, retain the original marker bytes/hash and explicitly approve additive normalization. Never invent a check or alter timing/financial evidence. Any changed marker raw hash must be separately rebound in consumers that require it, including a future health request; old captures remain immutable history.
3. **Actual approved perimeter:** choose the actual private/VPN path and finite client inventory, preferably the verified device `/32` where appropriate; do not invent a broad LAN approval. Prove an authorized generator and an actually unauthorized path, IPv4/IPv6/unknown Host/443/direct upstream boundaries, and management SSH continuity. Recheck within the old591 one-hour inventory bound. The current port80/UFW metadata is not the proposed deny/auth policy.
4. **Private all-route Nginx protection:** syntax-check the exact candidate and snapshots; use the reviewed network gate AND Basic auth across pages, API/auth/test, assets/media and health. No `satisfy any`, early-return health bypass, Origin rewrite, multiple trusted origins or public media-root alias. Nginx's Basic-auth/access combination is described in its [official module documentation](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html). Generate preview-only credentials solely under a later apply dispatch, with separate root:www-data0750 directory and0640 hash file, without relaxing the root700 app-config parent. Prove actual worker readability and private delivery; preserve all app/DB/control/MFA keys and financial/media history.
5. **Frozen operator/generator and finite action:** Root must release the shared DB/native window, freeze the exact accepted app/Ops/profile/helper/data contract and issue a new expiring dispatch. The generator must use the actual canonical `http://192.168.240.51` origin and private browser Basic credentials; no localhost substitute or cookie copying. A fresh current runtime-only encrypted backup, shared release lock, exact immutable profile/config transition, generated lease syntax and closed-on-failure/config-only rollback readiness precede exposure. No such backup/lease/config action occurred in this observation.
6. **Actual critical flows in all three engines:** one bounded run, capped at20min, must cover Chromium, Firefox and WebKit with zero skipped acceptance rows. Run native customer OTP and admin MFA, wrong/replay/stale-factor denial, exact-origin/CSRF and cookie rules, retained owned-order/receipt/stock/shipment/media equality, a separate new T25, dedup/reconciliation, headers/private caching and actual perimeter negatives. Respect real429 intervals with the approved bounded retry; do not reset limiters. The10 named acceptance checks and exact engine/profile/source/timestamps must satisfy old591's accept contract. A timeout/failure withdraws the preview under the reviewed config/proxy-only rollback, preserving all resulting orders/schema/history; it does not extend the deadline or restore pre-cutover data automatically.

Current completion: **metadata observation and preparation only**. No approved inventory or dispatch was created; no Basic credentials, lease/unit, profile/origin/config, app/worker, schema, timer, scheduled measurement, browser native flow or load changed. The full private-IP matrix, Linux generator proof, actual activation and rollback remain unexecuted. Live PSP/SMS/domain/TLS, offsite/PITR, external alert delivery and200-user capacity are separate pending work.

Documentation lookup: `npx` was unavailable in the current shell, so the read-only lookup used the official sources linked above. The observation used only reviewed fixed command arguments, strict known-host SSH with the ProgramData-preserving OS allowlist, bounded private capture and Python bytecode disabled. Python AST/Node syntax and ignored-path checks passed before the single metadata invocation.
