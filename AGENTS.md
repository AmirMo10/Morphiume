# Morphiume — repository instructions

Read docs/PROJECT_BRIEF.md, docs/STATUS.md and the relevant section of docs/spec/Morphiume_Codex_Master_Prompt.txt. The specification defines requested behavior, not evidence of completed work. Preserve user changes.

## Workflow and ownership

- Commit completed, verified changes and push directly to GitHub main through origin unless the user requests otherwise. Never rewrite remote history.
- Use actual specialist subagents for this project. At most three run concurrently with the coordinator. Every task gets exclusive paths and an output/test contract; see docs/IMPLEMENTATION_PLAN.md.
- Coordinator owns root config, package/lockfile, auth, API integration and publishing. Commerce agent exclusively owns db, src/contracts, commerce/payments/jobs. Frontend owns app pages/components except src/app/api. Other roles use assigned paths; coordinate before touching another owner's file.
- Read relevant .agents/skills/morphiume-*/SKILL.md directly when needed. Existence/validation does not prove automatic discovery or completion.

## Commands

Pinned package manager pnpm. Commands: pnpm install --frozen-lockfile; pnpm dev; pnpm build; pnpm start; pnpm lint; pnpm typecheck; pnpm test; pnpm test:e2e; pnpm test:load; pnpm db:migrate; pnpm db:seed; pnpm worker; pnpm skills:validate. Record actual implementation/execution before claiming they work. Never seed live data.

## Commerce and security

- Spell the brand exactly Morphiume. Never invent product/legal/contact/shipping/tax/review facts. Samples are test-only and labeled.
- Money is integer BIGINT IRR in DB/server, JSON decimal strings, تومان in UI. Convert admin تومان exactly once. Only server calculates amounts; no floating-point finance.
- PostgreSQL governs price, stock, reservations and receipts. Fixed SKU lock order; no oversell; immutable order snapshots; one inventory/fulfillment commitment per order; distinct receipts recorded.
- Persist idempotency/order/attempt before network, bind keys to actor and payload, use transactional outbox and DB dedup. Callback browser status is not payment proof.
- Maintained auth library, separate customer/admin sessions, mandatory admin MFA, fresh operation/object permissions, CSRF and private-response no-store. DB/secrets are server-only; no auth tokens in browser storage.
- User-authorized exception: the private staging preview at http://192.168.240.51 may open the admin panel without browser login/MFA, only through the existing client IP restriction and explicit protected server capability. Attribute actions to a separate shared preview operator, preserve owner credentials and normal/default/restore/live authentication, and retain transactional permission checks. See docs/ops/PRIVATE_PREVIEW_ACCESS.md.
- DEPLOYMENT_ENV=test|staging|live differs from NODE_ENV. Live rejects mocks, sample/default credentials, missing required services and unsafe origins. Controlled test adapters use no live secrets/data.
- Root HTML lang=fa dir=rtl, logical CSS, bidi isolation, Persian/Arabic/Latin numeric input, UTC storage/Tehran business time, accessible labels/focus/errors and reduced motion.

## Deployment and completion

SSH morphiume-deploy is root@192.168.240.51 with a verified dedicated key outside Git. Host fingerprint SHA256:8CHT5tdzcOZb0udoponfH65bKCNtmGIIgng/Y+VUuAI; strict checking remains enabled. Server checkout /opt/morphiume tracks main. Preserve /srv/morphiume/postgres. Staging has separate storage, credentials, containers and access controls; see docs/ops and deploy/staging.

Done means working DB-connected behavior, independent relevant tests actually executed, confirmed blockers fixed, honest docs/TEST_REPORT.md and STATUS.md, current runbooks/owner prerequisites and verified integration pushed main. Never invent test results, capacity, ASVS certification or production readiness. Continue authorized independent work while external-service inputs are outstanding.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
