# Operational prerequisites

| Item | Owner | Status | Obtain | Verify |
| --- | --- | --- | --- | --- |
| Private host/SSH | Coordinator | Audited 2026-10-12 | Existing verified SSH alias/key | Strict-host-key SSH; host fingerprint through console if it changes |
| Build machine | Coordinator | Local daemon unavailable; first CI build passed, image scan failed | Off-server CI with minimal replacement image | Actual image commands, MFA/media, unchanged Grype gate and immutable digest |
| Staging DB/media storage | Ops | Isolated DB provisioned and healthy; app media path prepared | Existing separate staging paths/project | Runtime/owner auth, persistent recreation and reserved mount checks passed; actual server media fixture pending |
| Offsite encrypted backups | Business owner + Ops | Missing external destination and credential/key custody | Versioned object storage, distinct backup identity and offline recovery-key access | Upload/checksum/decrypt/restore from offsite; alert on failure |
| Domain/DNS/trusted TLS | Business owner + Ops | Not provided; private IP for now | Owner-owned domain and DNS control, valid certificate | DNS/chain/renewal checks; Iran access evidence |
| PSP merchant contract/sandbox | Business owner + Backend | Not provided | Actual provider account and official integration contract | Provider contract tests, amount/currency/callback/verify/reconciliation |
| SMS account/service template | Business owner + Backend | Not provided | Actual SMS provider and approved service template | Delivery/timeout/rate/cost and Iranian network checks |
| Shipping/returns/legal policies | Business owner | Not provided | Confirmed seller details and carrier/policy decisions | Owner review and real checkout/return scenarios |
| Owner admin/MFA | Business owner + Security | Bootstrap procedure required | Owner-controlled account and recovery method | Login, recovery, MFA, role revocation and audit trail |
| Real catalog/media | Business owner + Designer | Not provided | Product truth, rights-cleared assets, prices and stock | Draft-to-publish review; no sample product represented as real |
| Asset/font licenses | Designer + Business owner | Verification required | Actual license/provenance files | Source/license register and self-hosted assets |
| Monitoring/alert destination | Business owner + Ops | Missing recipient/channel and service owner | Approved alert recipient; connected monitored uptime/backup jobs | Synthetic failure triggers an actionable alert and receipt |
| 200-user capacity | QA + Ops | Not measured; server below proposed baseline | Separate generator and agreed test hardware/dataset | 20-minute 200-VU run plus independent RPS saturation test |
| Mobile/fixed-network Iran check | Business owner + QA | Not available from this environment | Two mobile networks and one fixed Internet connection in Iran | Timestamped route/images/login/SMS/payment evidence |

Live release additionally requires owner-confirmed sales identity, policies and verifiable actual licenses/approvals. Do not publish a fabricated trust badge, legal deadline, guarantee or tax claim. Unknown owner inputs do not prevent isolated staging implementation.
