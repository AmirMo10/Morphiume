---
name: morphiume-auth-security
description: Implement or review Morphiume auth, MFA, sessions, permissions, CSRF, uploads and trust boundaries; use targeted abuse tests rather than a generic security checklist.
---

Read the applicable [specification](../../../docs/spec/Morphiume_Codex_Master_Prompt.txt) sections16-18 and current auth/API/domain code. Use maintained library sessions/crypto; do not invent SMS-only admin auth, provider signatures or custom cryptography.

Check separate admin/customer cookies and grants, mandatory verified MFA, atomic single-use OTP, resend limits, fresh role/session reads and object ownership in endpoint plus data layer. Exercise direct routes as anonymous/customer/revoked admin, two-user IDOR, forged callback, CSRF and cache isolation. Private data and tokens never enter shared cache, NEXT_PUBLIC, analytics or browser storage.

Live startup rejects mocks/missing secrets; test controls require explicit test/staging plus authorization. Decode/re-encode raster uploads with resource limits and random storage paths; reject activeSVG and external fetch. Finish with reproduction evidence, fixes retested, unresolved findings and precise limitations; a scan is not an ASVS certificate.
