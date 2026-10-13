import { isDeepStrictEqual } from "node:util";
import type pg from "pg";
import type { Browser, BrowserContext, BrowserContextOptions, Page, TestInfo } from "@playwright/test";
import { controlledQaDatabase } from "../helpers/qa-target.mjs";

export const PREVIEW_ORIGIN = "http://192.168.240.51";
export const E4_SOURCE = "e4bed691dc938a9c0f79022696d24f063ad97724";
const SSH_PROFILE = "67f77b1636d0ae2b9b81df9e46f4a3c93087b01e0d4e6fdaa730b2604e60dd96";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export const previewCheckNames = ["nativeLogin", "adminMfa", "csrf", "cookies", "ownedOrder", "paymentReceiptDedup", "newT25", "mediaHashes", "perimeter", "headers"] as const;
export type PreviewCheck = typeof previewCheckNames[number];
export type PreviewSettings = { origin: typeof PREVIEW_ORIGIN; profileSha256: string; httpCredentials: { username: string; password: string; origin: typeof PREVIEW_ORIGIN; send: "always" } };
function requireProof(value: unknown, category: string): asserts value { if (!value) throw new Error(`Private preview stopped: ${category}. Private details withheld.`); }

// Root's protected launcher reads the actual Basic file and supplies these two
// values in memory. They never enter Playwright's serializable config/metadata.
export function privatePreviewSettings(env: Record<string, string | undefined>): PreviewSettings | undefined {
  if (env.E4_PRIVATE_PREVIEW === undefined) return undefined;
  requireProof(env.E4_PRIVATE_PREVIEW === "1", "mode");
  requireProof(!env.DEBUG && !env.PWDEBUG && !env.PLAYWRIGHT_DEBUG && !env.NODE_DEBUG, "debug-output");
  requireProof(env.APP_BASE_URL === PREVIEW_ORIGIN && env.E2E_BASE_URL === PREVIEW_ORIGIN && env.DEPLOYMENT_ENV === "staging" && env.PAYMENT_PROVIDER === "mock" && env.SMS_PROVIDER === "mock", "target");
  requireProof(!env.MIGRATION_DATABASE_URL && !env.BOOTSTRAP_ADMIN_PASSWORD && !env.BOOTSTRAP_ADMIN_EMAIL && !env.QA_RETAIN_RESTORE_FIXTURE, "owner-or-retention");
  let target: URL;
  try { target = controlledQaDatabase(env); } catch { throw new Error("Private preview stopped: database-target. Private details withheld."); }
  requireProof(target.hostname === "127.0.0.1" && target.port === "15434" && target.pathname === "/morphiume_staging_runtime" && decodeURIComponent(target.username) === "morphiume_runtime_app", "database-target");
  requireProof([env.AUTH_SECRET, env.ADMIN_AUTH_SECRET, env.MOCK_CONTROL_SECRET].every(value => typeof value === "string" && value.length >= 32) && env.AUTH_SECRET !== env.ADMIN_AUTH_SECRET && env.MEDIA_ROOT === "/app/media", "runtime-config");
  requireProof(typeof env.E4_PREVIEW_PROFILE_SHA256 === "string" && /^[a-f0-9]{64}$/u.test(env.E4_PREVIEW_PROFILE_SHA256) && env.E4_PREVIEW_PROFILE_SHA256 !== SSH_PROFILE, "profile");
  requireProof(!env.E4_PREVIEW_CREDENTIALS_PATH && !env.E4_PREVIEW_CREDENTIALS_SHA256, "credential-source");
  requireProof(typeof env.E4_PREVIEW_BASIC_USER === "string" && /^preview-[a-f0-9]{12}$/u.test(env.E4_PREVIEW_BASIC_USER) && typeof env.E4_PREVIEW_BASIC_PASSWORD === "string" && /^[a-f0-9]{64}$/u.test(env.E4_PREVIEW_BASIC_PASSWORD), "basic-config");
  return { origin: PREVIEW_ORIGIN, profileSha256: env.E4_PREVIEW_PROFILE_SHA256, httpCredentials: { username: env.E4_PREVIEW_BASIC_USER, password: env.E4_PREVIEW_BASIC_PASSWORD, origin: PREVIEW_ORIGIN, send: "always" } };
}
export function previewContextOptions(settings: PreviewSettings | undefined, options: BrowserContextOptions): BrowserContextOptions {
  if (!settings) return options;
  requireProof(options.baseURL === PREVIEW_ORIGIN && !options.httpCredentials, "context-target");
  return { ...options, httpCredentials: { ...settings.httpCredentials } };
}
export function configurePreviewContext(context: BrowserContext, settings: PreviewSettings | undefined) { if (settings) { context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(30_000); } }
export async function createPurchaseContext(browser: Browser, settings: PreviewSettings | undefined, options: BrowserContextOptions) {
  try { const context = await browser.newContext(previewContextOptions(settings, options)); configurePreviewContext(context, settings); return context; }
  catch (error) {
    if (settings) {
      // A browser transport cause may serialize Basic credentials into reports.
      // eslint-disable-next-line preserve-caught-error
      throw new Error("Private preview stopped: context-creation. Private details withheld.");
    }
    throw error;
  }
}

async function readOnly<T>(pool: pg.Pool, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); await client.query("SET LOCAL statement_timeout='3s'"); await client.query("SET LOCAL lock_timeout='1s'"); return await operation(client); }
  finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
}
export function assertPreviewDatabaseIdentity(row: Record<string, unknown>) {
  requireProof(row.database === "morphiume_staging_runtime" && row.role === "morphiume_runtime_app" && row.safe === true && row.ddlDenied === true && row.readOnly === true && row.version === 180006 && row.migrations === 13 && row.tables === 53, "database-identity");
}
export async function provePreviewDatabase(pool: pg.Pool) {
  return readOnly(pool, async client => { const result = await client.query(`SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only')='on' AS "readOnly",current_setting('server_version_num')::int AS version,
    (SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname=current_user) AS safe,
    NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=current_user::regrole) AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relowner=current_user::regrole OR c.relkind IN('r','p') AND has_table_privilege(current_user,c.oid,'TRUNCATE'))) AS "ddlDenied",
    (SELECT count(*)::int FROM schema_migration) AS migrations,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p')) AS tables`); assertPreviewDatabaseIdentity(result.rows[0] as Record<string, unknown>); });
}
export type PaymentState = {
  order: { paymentStatus: string; status: string; userId: string; subtotal: string; discount: string; shipping: string; tax: string; total: string; committed: boolean };
  items: Array<{ id: string; quantity: number; price: string; total: string; productMatches: boolean }>;
  attempts: Array<{ id: string; authority: string; provider: string; status: string; amount: string }>;
  receipts: Array<{ id: string; amount: string; disposition: string }>;
  balances: Array<{ onHand: number; reserved: number }>; reservations: Array<{ id: string; status: string; quantity: number }>;
  commitments: number; commitmentDelta: number; commitmentReservedDelta: number; shipments: Array<{ id: string; status: string; carrier: string | null; trackingCode: string | null }>;
};
export async function capturePaymentState(pool: pg.Pool, orderId: string, productId: string): Promise<PaymentState> {
  requireProof(uuid.test(orderId) && uuid.test(productId), "payment-target");
  return readOnly(pool, async client => { const result = await client.query(`SELECT jsonb_build_object(
    'order',(SELECT jsonb_build_object('paymentStatus',payment_status,'status',status,'userId',user_id,'subtotal',subtotal_irr::text,'discount',discount_irr::text,'shipping',shipping_irr::text,'tax',tax_irr::text,'total',total_irr::text,'committed',committed_at IS NOT NULL) FROM orders WHERE id=$1),
    'items',(SELECT jsonb_agg(jsonb_build_object('id',i.id,'quantity',i.quantity,'price',i.unit_price_irr::text,'total',i.line_total_irr::text,'productMatches',v.product_id=$2) ORDER BY i.id) FROM order_item i JOIN variant v ON v.id=i.variant_id WHERE i.order_id=$1),
    'attempts',(SELECT jsonb_agg(jsonb_build_object('id',id,'authority',authority,'provider',provider,'status',status,'amount',amount_irr::text) ORDER BY id) FROM payment_attempt WHERE order_id=$1),
    'receipts',(SELECT jsonb_agg(jsonb_build_object('id',id,'amount',amount_irr::text,'disposition',disposition) ORDER BY id) FROM payment_receipt WHERE order_id=$1),
    'balances',(SELECT jsonb_agg(jsonb_build_object('onHand',b.on_hand,'reserved',b.reserved) ORDER BY b.variant_id) FROM inventory_balance b JOIN variant v ON v.id=b.variant_id WHERE v.product_id=$2),
    'reservations',(SELECT jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'status',status) ORDER BY id) FROM inventory_reservation WHERE order_id=$1),
    'commitments',(SELECT count(*) FROM inventory_ledger WHERE order_id=$1 AND reason='payment_commit'),
    'commitmentDelta',(SELECT coalesce(sum(on_hand_delta),0) FROM inventory_ledger WHERE order_id=$1 AND reason='payment_commit'),
    'commitmentReservedDelta',(SELECT coalesce(sum(reserved_delta),0) FROM inventory_ledger WHERE order_id=$1 AND reason='payment_commit'),
    'shipments',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'carrier',carrier,'trackingCode',tracking_code) ORDER BY id) FROM shipment WHERE order_id=$1)) AS state`, [orderId, productId]); return result.rows[0].state as PaymentState; });
}
export function assertPaymentReplay(before: PaymentState, after: PaymentState) {
  for (const state of [before, after]) {
    requireProof(state.order?.paymentStatus === "paid" && state.order.committed && typeof state.order.userId === "string", "payment-order");
    for (const field of ["subtotal", "discount", "shipping", "tax", "total"] as const) requireProof(typeof state.order[field] === "string" && /^(?:0|[1-9]\d{0,9})$/u.test(state.order[field]) && BigInt(state.order[field]) <= 1_000_000_000n, "payment-money");
    requireProof(BigInt(state.order.total) === BigInt(state.order.subtotal) - BigInt(state.order.discount) + BigInt(state.order.shipping) + BigInt(state.order.tax), "payment-money");
    requireProof(state.items?.length === 1 && state.items[0]?.quantity === 1 && state.items[0]?.price === "1234560" && state.items[0]?.total === "1234560" && state.items[0]?.productMatches === true, "payment-items");
    requireProof(state.attempts?.length === 1 && state.attempts[0]?.provider === "mock" && state.attempts[0]?.status === "succeeded" && state.attempts[0]?.amount === state.order.total && uuid.test(state.attempts[0]?.id ?? "") && state.attempts[0]?.authority.startsWith("MOCK-") && uuid.test(state.attempts[0]?.authority.slice(5) ?? ""), "payment-attempt");
    requireProof(state.receipts?.length === 1 && state.receipts[0]?.disposition === "primary" && state.receipts[0]?.amount === state.order.total && uuid.test(state.receipts[0]?.id ?? ""), "payment-receipt");
    requireProof(state.commitments === 1 && state.commitmentDelta === -1 && state.commitmentReservedDelta === -1 && state.reservations?.length === 1 && state.reservations[0]?.status === "consumed" && state.reservations[0]?.quantity === 1 && state.balances?.length === 1 && state.balances[0]?.onHand === 2 && state.balances[0]?.reserved === 0 && state.shipments?.length === 1, "payment-inventory");
  }
  requireProof(isDeepStrictEqual(before, after), "payment-replay");
}

export function assertPreviewCookies(cookies: Array<{ name: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: string }>, prefix: "morphiume-admin" | "morphiume-customer") {
  requireProof(cookies.some(cookie => cookie.name === `${prefix}.session_token` && cookie.domain === "192.168.240.51" && cookie.path === "/" && cookie.httpOnly && !cookie.secure && cookie.sameSite === "Lax"), "cookies");
}
export async function provePreviewAssertions(input: { settings: PreviewSettings; browser: Browser; admin: Page; customer: BrowserContext; orderId: string; mediaUrl: string; customerPhone: string; state: PaymentState }) {
  const { settings, browser, admin, customer, orderId, mediaUrl, customerPhone, state } = input;
  const session = await customer.request.get("/api/auth/get-session", { maxRetries: 0, maxRedirects: 0, timeout: 10_000 });
  requireProof(session.status() === 200, "native-session"); const identity = (await session.json()).user;
  requireProof(identity?.id === state.order.userId && identity.phoneNumber === customerPhone && identity.phoneNumberVerified === true, "native-session");
  const adminSession = await admin.request.get("/api/admin/session", { maxRetries: 0, maxRedirects: 0, timeout: 10_000 });
  requireProof(adminSession.status() === 200 && (await adminSession.json()).data?.mfaVerified === true, "admin-mfa");
  assertPreviewCookies(await customer.cookies(PREVIEW_ORIGIN), "morphiume-customer"); assertPreviewCookies(await admin.context().cookies(PREVIEW_ORIGIN), "morphiume-admin");
  const owned = await customer.request.get(`/api/orders/${orderId}`, { maxRetries: 0, maxRedirects: 0, timeout: 10_000 });
  requireProof(owned.status() === 200 && (await owned.json()).data?.id === orderId, "owned-order");
  requireProof(/no-store/u.test(owned.headers()["cache-control"] ?? "") && uuid.test(owned.headers()["x-request-id"] ?? ""), "private-headers");
  const document = await customer.request.get(`/orders/${orderId}`, { maxRetries: 0, maxRedirects: 0, timeout: 10_000 });
  const h = document.headers(); requireProof(document.status() === 200 && h["x-content-type-options"] === "nosniff" && h["x-frame-options"] === "DENY" && h["referrer-policy"] === "strict-origin-when-cross-origin" && /noindex/u.test(h["x-robots-tag"] ?? "") && /frame-ancestors 'none'/u.test(h["content-security-policy"] ?? "") && /no-store/u.test(h["cache-control"] ?? ""), "headers");
  const rejectedHeaders: Array<Record<string, string>> = [{}, { Origin: "https://preview-cross-site.invalid" }, { Origin: settings.origin, "Sec-Fetch-Site": "cross-site" }];
  for (const headers of rejectedHeaders) {
    const denied = await customer.request.post("/api/cart", { headers, data: {}, maxRetries: 0, maxRedirects: 0, timeout: 10_000 });
    requireProof(denied.status() === 403 && (await denied.json()).error?.code === "FORBIDDEN" && uuid.test(denied.headers()["x-request-id"] ?? ""), "csrf");
  }
  const unauthenticated = await browser.newContext({ baseURL: PREVIEW_ORIGIN });
  const wrongBasic = await browser.newContext({ baseURL: PREVIEW_ORIGIN, httpCredentials: { ...settings.httpCredentials, username: "preview-invalid", password: "invalid" } });
  try {
    for (const path of ["/", "/api/health/ready", "/api/auth/get-session", "/api/admin/session", "/api/test/otp", mediaUrl]) {
      const denied = await unauthenticated.request.get(path, { maxRetries: 0, maxRedirects: 0, timeout: 10_000 }); requireProof(denied.status() === 401 && /Basic/iu.test(denied.headers()["www-authenticate"] ?? ""), "perimeter");
    }
    requireProof((await wrongBasic.request.get("/api/health/ready", { maxRetries: 0, maxRedirects: 0, timeout: 10_000 })).status() === 401, "perimeter");
    requireProof((await customer.request.get("/api/health/ready", { headers: { Host: "preview-wrong-host.invalid" }, maxRetries: 0, maxRedirects: 0, timeout: 10_000 })).status() === 404, "perimeter");
  } finally { await unauthenticated.close(); await wrongBasic.close(); }
  return { nativeLogin: true, adminMfa: true, csrf: true, cookies: true, ownedOrder: true, perimeter: true, headers: true } as const;
}
export function recordPreviewProof(info: TestInfo, settings: PreviewSettings, checks: Record<PreviewCheck, boolean>) {
  requireProof(["chromium", "firefox", "webkit"].includes(info.project.name) && info.retry === 0 && previewCheckNames.every(name => checks[name] === true), "incomplete-proof");
  info.annotations.push({ type: "private-preview-proof", description: JSON.stringify({ engine: info.project.name, sourceCommit: E4_SOURCE, origin: PREVIEW_ORIGIN, accessProfileSha256: settings.profileSha256, acceptedUtc: new Date().toISOString(), checks, unexpected: 0, skipped: 0, testRetries: 0, controlledUi503Count: 1 }) });
}
