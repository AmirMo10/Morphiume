# Redesign private staging T25 — actual execution

Observed application source: `7feb4fe8e8254e917c53f9654b315ee7ef3fada1`.
Canonical origin: `http://192.168.240.51`. This is protected staging with
controlled payment/SMS adapters, not acceptance of public sales.

## Current result, 18 October 2026

The corrected transport completed the full native purchase path in Chromium,
Firefox and WebKit, with twenty required checks per case and an independent
read-only three-order audit. The first Chromium attempt failed at the address
perimeter; that failure remains preserved below. Across the two attempts, four
cases actually ran: three passed and one failed. The successful cases had zero
test retries, skips or flaky results. Fixture promotion and backup/restore are
separate coordinator/operations transitions.

The frozen Windows Node 24.21.0 / Playwright 1.64.0 client connected to the
reviewed Linux browser provider through the owned SSH forward. A separate
one-time `about:blank` transport probe succeeded in Chromium 156.0.8078.4,
Firefox 157.0 and WebKit 27.2. That probe made no app, authentication or database
calls and does not count as a purchase test.

The actual source-bound runtime export, eight-field identity, reviewed plan,
original Basic handoff and provider proof were bound successfully. The active
profile digest was
`89a1a439774490e966830bbd82f7cbbd412a7f58627c0c054a58ad30432f71d7`.
The detached 781-file source baseline, one approved private source-literal
overlay and frozen test assertions were unchanged.

## First attempt — preserved failure

The wrapper ran from `2026-10-18T06:28:16.960Z` to
`2026-10-18T06:28:43.359Z`. Its child took 24.945 seconds; the actual test case
took 14.847 seconds. The report duration, including setup/teardown, was
22.745595 seconds. Exactly one case ran: zero expected passes, one unexpected
failure, zero skipped/flaky cases and zero test retries.

The protected trace records the first canonical request:

| Request | Started UTC | Actual response | Request duration |
|---|---|---|---|
| `GET /admin/login` | `2026-10-18T06:28:28.933Z` | `403`, `text/html` | 50.979 ms |

The admin-email locator subsequently reached the unchanged ten-second action
timeout; the native-auth response waiter also timed out. No password sign-in or
other authentication POST was recorded. Operations subsequently correlated the
same request in Nginx's error log: access was forbidden by the address rule,
with client `192.168.240.51`. The accepted perimeter allowed only the existing
client address `192.168.240.46/32`, followed by `deny all`, with Basic authentication
also required. The host-network browser provider reached the server from its
own address, which this rule excluded. The Nginx/site bytes were unchanged.
This establishes the address-perimeter cause; Basic credential acceptance was
not reached or proved. The planned controlled UI `503` was not reached and was
not a real server response.

Finally cleanup succeeded: the sole newly created synthetic admin was disabled,
its sessions were removed, and no preexisting user was touched. All 4,742
preexisting rows in fourteen financial tables were preserved by primary key and
row digest. This comparison does not claim equality of all 53 database tables.
No product, buyer, order, payment, inventory commitment or shipment was created.
The personal owner account was not used.

Safe result SHA256:
`26584a0ef00d89ce282a6416e491dbd6f4cdf4826e1f1622d8865520bf5c6602`.
Private child-log SHA256:
`6167da4f4ef59de95ca017e82989a5e3084c6aa2e9d735aa783ace9e99a8ae09`.
Raw reports, trace, screenshots, fixture identifiers and protected inputs remain
in ignored Admin/SYSTEM-only storage. No raw failure media is published.

## Corrected transport — read-only acceptance

The official Playwright connection option
[`exposeNetwork`](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-option-expose-network)
allows a remote browser to reach an exact network destination through the
connecting client. The installed Playwright 1.64.0 implementation maps
`PW_TEST_CONNECT_EXPOSE_NETWORK` into that option. A separate reviewed transport
copy uses only the literal `192.168.240.51:80`, preserving the canonical origin,
original Basic handoff, application source, assertions and time budgets. It
does not change Nginx's address rules or application configuration.

One separately authorized read-only primitive ran from
`2026-10-18T06:42:46.679Z` to `2026-10-18T06:42:57.498Z`. Chromium 156.0.8078.4,
Firefox 157.0 and WebKit 27.2 each received actual HTTP `200` at `/admin/login`
and displayed the exact admin-email label. They issued 16, 17 and 16 GET/HEAD
requests respectively. The read-only route guard blocked zero requests; no
authentication POST, fixture actor or direct database client call was made.
Server-internal database reads were not measured. All engines reported Linux
x86_64. This establishes transport reachability, not a completed purchase.

Protected primitive proof SHA256:
`51abcb47276791fb15c15041c80e549d200f8becd1b3a0e5d56bd5968b49c30c`.
The first failed native result/log were moved without byte changes into an
exclusive private archive; its manifest SHA256 is
`0a9d4c9d7348dd9611e9007e0e43873aaf1d5e112b371af8d9088fc31c05e89c`.
Its report and fixture-output trees remain unchanged. Named private inputs and
new evidence now have two explicit protected Admin/SYSTEM full-control rules;
this local ACL normalization changed no file content or server configuration.

## Subsequent coordinator acceptance

The coordinator promoted the retained fixture from the actual successful
native evidence. The fresh encrypted backup, isolated six-check business
recovery and gallery verification, accepted cleanup/healthy source resume,
measured health/backup services and recurring timer activation subsequently
passed. See [actual recovery](REDESIGN_RECOVERY_EXECUTION.md) and
[deployment/scheduling](../ops/REDESIGN_STAGING_EXECUTION.md) for their separate
identities, results and final observations. QA did not fabricate those server
markers or infer operations acceptance from the browser cases.
The evidence here covers controlled staging, remote Linux desktop engines and
synthetic products. It does not establish live PSP/SMS, public TLS, real mobile
hardware, screen-reader compatibility, offsite/PITR or broad production capacity.

## Successful native purchase cases

The fresh Chromium wrapper ran from `2026-10-18T06:43:45.284Z` to
`2026-10-18T06:44:26.458Z` (child 38.470 seconds, report 37.162120 seconds).
After independent coordinator acceptance of that result, Firefox and WebKit ran
once from `2026-10-18T06:45:37.629Z` to `2026-10-18T06:47:34.598Z` (child
112.846 seconds, report 111.446759 seconds).

| Native engine | Actual case duration | Required checks | Preexisting financial rows preserved |
|---|---|---|---|
| Chromium 156.0.8078.4 | 35.707 s | 20/20 | 4,742 in 14 tables |
| Firefox 157.0 | 46.779 s | 20/20 | 4,758 in 14 tables |
| WebKit 27.2 | 58.421 s | 20/20 | 4,774 in 14 tables |

All twenty exact flags were true in every successful case: native login, admin
MFA, CSRF, cookies, owned order, perimeter, headers, new T25, payment/receipt
deduplication, media hashes, product creation through the UI, publication through
the UI, checkout creation, server mock-payment verification, a single inventory
commitment, shipment recording, owned tracking, foreign-order denial, callback
replay stability and UI-uploaded gallery linkage.

Each case created and published its product through the actual admin form with
a UI-uploaded raster image, verified the guest phone, created checkout with HTTP
201, and exercised the uncertain-payment state before successful server verify.
Stock moved from three available units to two, with zero reserved afterward.
The paid order had exactly one primary receipt and one inventory commitment;
callback replay preserved that state. Admin shipment entry appeared in owned
customer tracking, and another native customer received 404 for that order.
The image displayed and decoded from the independently uploaded gallery entry.
The assertions also retained RTL, 320-pixel layout, keyboard/focus and scoped axe
checks. These are browser checks, not real-device certification.

The native-auth status ledger across the successful cases records 21 real HTTP
200 responses and three intentional wrong-OTP 400 responses. Each case also
contains one deliberately UI-injected 503 to check recovery; those three are not
server failures. There were zero actual 429 responses, Retry-After waits or
transport retries. Native one-worker, ten-second action, 120-second case and
25-minute global budgets were unchanged.

## Final independent read-only audit

The separate audit succeeded at `2026-10-18T06:48:08.761Z`, using the runtime app
role inside a read-only repeatable-read transaction, with thirteen migrations
and 53 tables. It independently checked all three scoped paid orders: each had
one primary receipt, one shipped shipment, one payment inventory commitment,
one consumed reservation, on-hand two and reserved zero.

The successful test window created nine synthetic users. Eight were disabled
and had zero remaining sessions; only the Chromium customer/product/order was
retained for recovery acceptance. Firefox/WebKit products were archived. All
synthetic admins were disabled. The earlier failed attempt's one disabled admin
is separate historical cleanup. The personal owner account was not used, and
preexisting authentication-row equality was not measured. Financial history was
retained; the per-case comparison covers prior rows of fourteen financial tables,
not global equality after authorized worker activity.

The 781-file source baseline and one approved private source-literal overlay
were unchanged. Two explicit protected Admin/SYSTEM rules protect raw reports,
screenshots, trace, retained pending records and new native transport provenance.
No private identifiers, auth values or raw failure media are published.

| Evidence | SHA256 |
|---|---|
| Retained native safe record | `7fe03a1ccead89c5ae286f6f42fa3cd0aa5ac5753b33a0c40196e75b875ce78a` |
| Firefox/WebKit native safe record | `1166368b00b4434a77922274923d40f586375fe51688bac9021ec8b0ef1e3ce9` |
| Retained transport provenance | `02ea51fe296b060313af2a32f9bbd7691c50307261fca4bb49d3718993deacc4` |
| Firefox/WebKit transport provenance | `02f288e63c263933133e327e6975586851a15917bc9d2ed2f5ec4066a1cc09b6` |
| Independent read-only final audit | `6dc33dfc5e2d9d3ac51007c5bc9662b7d36bc27814c70e30686eac66beb2aff6` |
| Per-engine financial/cleanup audits | `469e8cce76390f3791f7159e8155644fc4ae91edec8eee7866367c533acfc209` |
| Retained pending fixture | `ae705b2c5964c7859d4dfcfb0576453ac5f1bd55cef6ad58d20fb0c746f608ed` |
| Retained pending UI-gallery companion | `c21706e3baf6449e96aa1f52f99d8ce88c6727aad804a6ea6b40cef0e6bee105` |
