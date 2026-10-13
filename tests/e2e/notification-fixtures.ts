import { randomUUID } from "node:crypto";
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
  expect(jobs.rows).toHaveLength(1); expect(jobs.rows[0]!.payload).toEqual({ eventId, orderId }); expect(jobs.rows[0]!.status).toBe("pending");
  return eventId;
}
export async function seedOperatorFeedRow(pool: pg.Pool, userId: string, orderId: string, eventId: string, kind: NotificationKind, permission: NotificationRequiredPermission, marker: string) {
  const id = randomUUID(), eventKey = `qa-notification-operator:${marker}:${userId}:${kind}`;
  await pool.query("INSERT INTO notification_message(id,user_id,event_key,title,body,audience,kind,order_id,source_event_id,required_permission) VALUES($1,$2,$3,$8,'متن عمومی مصنوعی QA؛ اطلاعات خصوصی سفارش در اعلان کپی نمی‌شود.','operator',$4,$5,$6,$7)", [id, userId, eventKey, kind, orderId, eventId, permission, operatorFixtureTitle(kind, marker)]);
  return id;
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
export function operatorFixtureTitle(kind: NotificationKind, marker: string) { return `اعلان مصنوعی QA ${kind} ${marker.slice(0, 8)}`; }
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
