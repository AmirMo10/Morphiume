import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { expect, test, type APIResponse, type Page, type Response } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type pg from "pg";
import type { InAppNotificationDto, NotificationAudience, NotificationKind, NotificationPageDto, NotificationRequiredPermission } from "../../src/contracts/notifications";
import type { OrderDto } from "../../src/contracts/commerce";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export async function notificationStatus(response: APIResponse | Response, audience: NotificationAudience, stage: "list" | "get" | "read" | "denied", expected: number) {
  const requestId = response.headers()["x-request-id"];
  const safe = { audience, stage, status: response.status(), serverRequestId: typeof requestId === "string" && uuid.test(requestId) ? requestId.toLowerCase() : null };
  // Fixed status evidence only. Generic exporter intentionally ignores this new annotation until reviewed.
  console.info(`[notification-http-status] ${JSON.stringify(safe)}`);
  test.info().annotations.push({ type: "notification-http-status", description: JSON.stringify(safe) });
  expect(safe.status, `${audience} ${stage} actual HTTP status`).toBe(expected);
  expect(safe.serverRequestId !== null).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  return response;
}
export function assertNotificationDto(value: unknown): asserts value is InAppNotificationDto {
  expect(!!value && typeof value === "object" && !Array.isArray(value)).toBe(true);
  const item = value as InAppNotificationDto;
  expect(Object.keys(item).sort()).toEqual(["id", "kind", "title", "body", "orderId", "createdAt", "readAt"].sort());
  expect(typeof item.id === "string" && uuid.test(item.id)).toBe(true);
  expect(["legacy.order_update", "order.created", "payment.verified", "shipment.shipped", "shipment.delivered", "request.cancel", "request.return", "request.approved", "request.rejected", "request.received", "request.closed", "refund.pending", "refund.completed", "refund.failed", "payment.inventory_exception", "payment.extra_receipt"]).toContain(item.kind);
  expect(typeof item.title === "string" && typeof item.body === "string").toBe(true);
  expect(item.orderId === null || typeof item.orderId === "string" && uuid.test(item.orderId)).toBe(true);
  expect(Number.isFinite(Date.parse(item.createdAt))).toBe(true);
  expect(item.readAt === null || Number.isFinite(Date.parse(item.readAt))).toBe(true);
}
export async function readNotificationPage(response: APIResponse | Response, audience: NotificationAudience): Promise<NotificationPageDto> {
  await notificationStatus(response, audience, "list", 200);
  const payload = (await response.json()).data as NotificationPageDto;
  expect(Object.keys(payload).sort()).toEqual(["items", "page", "pageSize", "totalItems", "totalPages", "unreadCount"].sort());
  expect(Array.isArray(payload.items)).toBe(true); payload.items.forEach(assertNotificationDto);
  for (const key of ["page", "pageSize", "totalItems", "totalPages"] as const) expect(Number.isSafeInteger(payload[key]) && payload[key] >= 0).toBe(true);
  expect(payload.page).toBeGreaterThan(0); expect(payload.pageSize).toBeGreaterThan(0); expect(payload.pageSize).toBeLessThanOrEqual(100);
  expect(payload.unreadCount).toMatch(/^(?:0|[1-9]\d*)$/u);
  return payload;
}
/** Controlled persisted FEED rows, not worker-created delivery evidence. */
export async function seedLegacyCustomerFeed(pool: pg.Pool, userId: string, count: number, marker: string, label: string = "اعلان مصنوعی QA") {
  expect(Number.isSafeInteger(count) && count >= 1 && count <= 105).toBe(true);
  const items = Array.from({ length: count }, (_, index) => ({ id: randomUUID(), event_key: `qa-notification-feed:${marker}:${index}`, title: `${label} ${index + 1}`, body: "اعلان مصنوعی برای آزمون فهرست؛ پیامک ارسال نمی‌شود.", position: index, read: index % 2 === 1 }));
  await pool.query(`INSERT INTO notification_message(id,user_id,event_key,title,body,created_at,read_at)
    SELECT n.id,$2,n.event_key,n.title,n.body,clock_timestamp()-n.position*interval '1 second',CASE WHEN n.read THEN clock_timestamp() ELSE NULL END
    FROM jsonb_to_recordset($1::jsonb) AS n(id uuid,event_key text,title text,body text,position integer,read boolean)`, [JSON.stringify(items), userId]);
  return items;
}
export async function sourceNotificationEvent(pool: pg.Pool, orderId: string, kind: NotificationKind) {
  const events = await pool.query<{ id: string }>("SELECT id FROM order_event WHERE order_id=$1 AND type=$2 ORDER BY created_at,id", [orderId, kind]);
  expect(events.rows).toHaveLength(1); const eventId = events.rows[0]!.id;
  const jobs = await pool.query<{ payload: { eventId: string; orderId: string }; status: string }>("SELECT payload,status FROM outbox_job WHERE type='notification.event' AND dedupe_key=$1", [`notification:event:${eventId}`]);
  expect(jobs.rows).toHaveLength(1); expect(jobs.rows[0]!.payload).toEqual({ eventId, orderId });
  expect(["pending", "running", "completed"]).toContain(jobs.rows[0]!.status);
  return eventId;
}
/** Server-only maintained dispatcher/selected job handler; runtime DML only, no broad worker. */
export async function settleOwnedNotificationOrder(orderId: string, customerUserId: string, operatorUserIds: string[]) {
  // Child does not receive auth, bootstrap, provider-control or owner credentials.
  const environment: NodeJS.ProcessEnv = { NOTIFICATION_E2E_DELIVERY_GO: "true", NODE_ENV: process.env.NODE_ENV };
  for (const key of ["DATABASE_URL", "DEPLOYMENT_ENV", "PAYMENT_PROVIDER", "SMS_PROVIDER", "NODE_ENV", "PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "HOME", "USERPROFILE"]) if (process.env[key] !== undefined) environment[key] = process.env[key];
  const result = await new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/e2e/notification-owned-delivery.ts"], { env: environment, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"], shell: false });
    let stdout = "", bytes = 0, exceeded = false;
    const deadline = setTimeout(() => { exceeded = true; child.kill(); }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4096) { exceeded = true; child.kill(); } else stdout += chunk.toString("utf8"); });
    // Failure text is never forwarded; it has no reference/credential/body content.
    child.stderr.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 4096) { exceeded = true; child.kill(); } });
    child.on("error", () => { clearTimeout(deadline); reject(new Error("Owned notification child did not start")); });
    child.on("close", code => { clearTimeout(deadline); if (exceeded) reject(new Error("Owned notification child exceeded its bound")); else resolve({ code, stdout }); });
    child.stdin.end(JSON.stringify({ orderId, customerUserId, operatorUserIds }));
  });
  expect(result.code, "Own canonical notification jobs must complete without a privileged fallback").toBe(0);
  const value = JSON.parse(result.stdout) as { scope: string; completedJobs: number; processedJobs: number; financialStateUnchanged: boolean };
  expect(Object.keys(value).sort()).toEqual(["completedJobs", "financialStateUnchanged", "processedJobs", "scope"]);
  expect(value.scope).toBe("owned-canonical-notification-delivery"); expect(value.financialStateUnchanged).toBe(true);
  expect(Number.isSafeInteger(value.completedJobs) && value.completedJobs >= 2 && value.completedJobs <= 24).toBe(true);
  expect(Number.isSafeInteger(value.processedJobs) && value.processedJobs >= 0 && value.processedJobs <= value.completedJobs).toBe(true);
}
const operatorBody = "یک تغییر آزمایشی برای بررسی ثبت شد. جزئیات را در سفارش و صف‌های مجاز بررسی کنید.";
const operatorTitles: Partial<Record<NotificationKind, string>> = {
  "request.cancel": "درخواست لغو آزمایشی ثبت شد.", "request.return": "درخواست مرجوعی آزمایشی ثبت شد.",
  "request.approved": "بررسی درخواست آزمایشی به‌روز شد.", "request.rejected": "بررسی درخواست آزمایشی به‌روز شد.",
  "request.received": "دریافت کالای مرجوعی آزمایشی ثبت شد.", "request.closed": "درخواست آزمایشی بسته شد.",
  "refund.pending": "درخواست بازپرداخت آزمایشی ثبت شد.", "refund.completed": "بازپرداخت آزمایشی ثبت شد.",
  "refund.failed": "نتیجهٔ بررسی بازپرداخت آزمایشی به‌روز شد.",
  "payment.inventory_exception": "نتیجهٔ پرداخت آزمایشی نیازمند بررسی است.", "payment.extra_receipt": "نتیجهٔ پرداخت آزمایشی نیازمند بررسی است.",
};
/** Every returned row is independently checked; legitimate other-event rows are retained, never hidden. */
export async function assertCanonicalOperatorPage(pool: pg.Pool, userId: string, permissions: NotificationRequiredPermission[], page: NotificationPageDto, unreadOnly = false) {
  expect(page.page).toBe(1); expect(page.pageSize).toBeGreaterThanOrEqual(page.totalItems);
  expect(page.items).toHaveLength(page.totalItems);
  const ids = page.items.map(item => item.id); expect(new Set(ids).size).toBe(ids.length);
  // Independent current-permission count/read model; no unknown or omitted row
  // can disappear behind a response-ID-only query. The controlled cohort is bounded.
  const rows = (await pool.query("SELECT n.*,e.type AS event_kind,e.order_id AS event_order FROM notification_message n LEFT JOIN order_event e ON e.id=n.source_event_id WHERE n.user_id=$1 AND n.audience='operator' AND n.required_permission=ANY($2::text[]) ORDER BY n.created_at DESC,n.id DESC LIMIT 101", [userId, permissions])).rows;
  expect(rows.length).toBeLessThanOrEqual(100);
  expect(page.unreadCount).toBe(String(rows.filter(row => row.read_at === null).length));
  const visible = unreadOnly ? rows.filter(row => row.read_at === null) : rows;
  expect(page.totalItems).toBe(visible.length); expect(ids).toEqual(visible.map(row => row.id));
  const sourceIds: string[] = [];
  for (const row of rows) {
    expect(row.user_id).toBe(userId); expect(row.audience).toBe("operator"); expect(permissions).toContain(row.required_permission);
    expect(typeof row.source_event_id === "string" && uuid.test(row.source_event_id)).toBe(true);
    expect(row.event_order).toBe(row.order_id); expect(row.event_kind).toBe(row.kind);
    expect(row.required_permission).toBe(row.kind.startsWith("request.") ? "orders.fulfill" : "refunds.write");
    expect(row.event_key).toBe(`notification:v2:${createHash("sha256").update(JSON.stringify([row.source_event_id, "operator", userId])).digest("hex")}`);
    expect(operatorTitles[row.kind as NotificationKind]).toBeDefined(); expect(row.title).toBe(operatorTitles[row.kind as NotificationKind]); expect(row.body).toBe(operatorBody);
    const item = page.items.find(candidate => candidate.id === row.id);
    if (item) {
      expect(item.kind).toBe(row.kind); expect(item.orderId).toBe(row.order_id); expect(row.title).toBe(item.title); expect(row.body).toBe(item.body);
      expect(row.created_at.toISOString()).toBe(item.createdAt); expect(row.read_at?.toISOString() ?? null).toBe(item.readAt);
    } else { expect(unreadOnly).toBe(true); expect(row.read_at).not.toBeNull(); }
    sourceIds.push(row.source_event_id);
  }
  expect(new Set(sourceIds).size).toBe(sourceIds.length);
  return page;
}
export async function canonicalOperatorRow(pool: pg.Pool, userId: string, orderId: string, eventId: string, kind: NotificationKind, permission: NotificationRequiredPermission) {
  const rows = (await pool.query("SELECT * FROM notification_message WHERE source_event_id=$1 AND user_id=$2 AND audience='operator'", [eventId, userId])).rows;
  expect(rows).toHaveLength(1); const row = rows[0]!;
  expect(row.kind).toBe(kind); expect(row.order_id).toBe(orderId); expect(row.required_permission).toBe(permission);
  expect(row.title).toBe(operatorFixtureTitle(kind)); expect(row.body).toBe(operatorBody);
  expect(row.event_key).toBe(`notification:v2:${createHash("sha256").update(JSON.stringify([eventId, "operator", userId])).digest("hex")}`);
  return row.id as string;
}
/** Audited permission-reduction fixture after genuine MFA and canonical delivery, not native role editing. */
export async function reduceOwnedOperatorMembership(pool: pg.Pool, userId: string, role: "fulfillment" | "finance") {
  const q = await pool.connect();
  try {
    await q.query("BEGIN");
    const current = (await q.query("SELECT role FROM role_membership WHERE user_id=$1 FOR UPDATE", [userId])).rows;
    expect(current).toEqual([{ role: "owner" }]);
    await q.query("DELETE FROM role_membership WHERE user_id=$1 AND role='owner'", [userId]);
    await q.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)", [userId, role]);
    await q.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'qa.fixture.notification_permission_reduced','user',$2,$3)", [randomUUID(), userId, `Controlled QA membership fixture owner to ${role}; native login retained, not an admin role API claim`]);
    await q.query("COMMIT");
  } catch (error) { await q.query("ROLLBACK"); throw error; } finally { q.release(); }
}
/** Genuine owner API transitions on a synthetic paid order, never SQL delivery. */
export async function deliverOwnedNotificationOrder(page: Page, baseURL: string, orderId: string, marker: string) {
  for (const status of ["shipped", "delivered"] as const) {
    const response = await page.request.patch(`/api/admin/orders/${orderId}/shipment`, {
      headers: { Origin: baseURL },
      data: { carrier: "شرکت ارسال مصنوعی QA", trackingCode: `QA-NOTIFICATION-${marker}`, status },
    });
    expect(response.status(), `Owned synthetic shipment ${status} actual HTTP status`).toBe(200);
    const order = (await response.json()).data as OrderDto;
    expect(order.id).toBe(orderId);
    expect(order.shipment?.status).toBe(status);
  }
}
export function operatorFixtureTitle(kind: NotificationKind) { const title = operatorTitles[kind]; expect(title).toBeDefined(); return title!; }
export function notificationPanel(page: Page, audience: NotificationAudience) { return page.getByRole("region", { name: audience === "customer" ? "فهرست اعلان‌های حساب" : "فهرست اعلان‌های مدیریت", exact: true }); }
export function waitNotificationPage(page: Page, audience: NotificationAudience, current = 1, size = 20, unread = false) {
  const path = audience === "customer" ? "/api/notifications/page" : "/api/admin/notifications/page";
  return page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === path && response.request().method() === "GET" && url.searchParams.get("page") === String(current) && url.searchParams.get("pageSize") === String(size) && url.searchParams.get("unreadOnly") === String(unread);
  });
}
export async function openCustomerNotifications(page: Page) {
  const response = waitNotificationPage(page, "customer");
  await page.getByRole("navigation", { name: "بخش‌های حساب", exact: true }).getByRole("button", { name: "اعلان‌های حساب", exact: true }).click();
  const data = await readNotificationPage(await response, "customer");
  await expect(page.getByRole("heading", { name: "اعلان‌های حساب", exact: true })).toBeVisible();
  return data;
}
export async function expectNotificationUnread(page: Page, audience: NotificationAudience, count: string) {
  const formatted = new Intl.NumberFormat("fa-IR").format(BigInt(count));
  await expect(notificationPanel(page, audience).getByText(/اعلان‌های خوانده‌نشده در همهٔ صفحه‌ها:/u)).toHaveText(`اعلان‌های خوانده‌نشده در همهٔ صفحه‌ها: ${formatted}`);
}
export async function assertNotificationUiAccessible(page: Page, audience: NotificationAudience) {
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(notificationPanel(page, audience)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Tab"); expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
}
