import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { archiveFixtureProducts, controlledCheckout, payControlledCheckout } from "./next-acceptance-fixtures";
import type { StoreReportDto, ReportWorkQueueDto } from "../../src/contracts/reports";

function todayDates() {
  const now = new Date(), date = (locale: string, calendar: string, separator: string) => {
    const parts = new Intl.DateTimeFormat(locale, { calendar, numberingSystem: "latn", timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join(separator);
  };
  return { iso: date("en", "gregory", "-"), jalali: date("fa-IR", "persian", "/") };
}
test("T12/T19/T21: typed Tehran-period report follows real receipts/refunds and Jalali UI preserves read-only queues", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), marker = randomUUID(), users: string[] = [], products: string[] = [];
  const customer = await browser.newContext({ baseURL }), deniedContext = await browser.newContext({ baseURL });
  try {
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const { iso, jalali } = todayDates(), query = `from=${iso}&to=${iso}`;
    const readReport = async () => { const response = await page.request.get(`/api/admin/reports/period?${query}`); expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toContain("no-store"); return (await response.json()).data as StoreReportDto; };
    const before = await readReport(); expect(before.period).toEqual({ fromDate: iso, toDate: iso, timeZone: "Asia/Tehran" });
    const product = await createProduct(page, baseURL!, `reports-${marker}`); products.push(product.id);
    const buyer = await loginCustomer(customer, baseURL!); users.push(buyer.userId);
    const purchase = await controlledCheckout(customer, baseURL!, product.variants[0]!.id, `qa-report-checkout-${marker}`);
    await payControlledCheckout(customer, baseURL!, purchase.authority, purchase.checkout.orderId);
    const receipt = (await (await page.request.get(`/api/admin/orders/${purchase.checkout.orderId}/receipts`)).json()).data[0] as { id: string; amount: { amountIrr: string } };
    expect(receipt.amount.amountIrr).toBe(purchase.checkout.total.amountIrr);
    const requested = await page.request.post(`/api/admin/orders/${purchase.checkout.orderId}/refunds`, { headers: { Origin: baseURL! }, data: { receiptId: receipt.id, amountIrr: "10000", reason: `QA report partial refund ${marker}`, operationKey: `qa-report-refund-${marker}` } });
    expect(requested.status()).toBe(200); const refundId = (await requested.json()).data.id as string;
    const pending = await readReport(); expect(pending.cash.refundedIrr).toBe(before.cash.refundedIrr);
    const completed = await page.request.post(`/api/admin/refunds/${refundId}/complete`, { headers: { Origin: baseURL! }, data: { evidence: `Synthetic QA mock refund evidence ${marker}; no real transfer.` } }); expect(completed.status()).toBe(200);
    const after = await readReport();
    expect(BigInt(after.cash.receivedIrr) - BigInt(before.cash.receivedIrr)).toBe(BigInt(purchase.checkout.total.amountIrr));
    expect(BigInt(after.cash.refundedIrr) - BigInt(before.cash.refundedIrr)).toBe(10000n);
    expect(BigInt(after.cash.netIrr)).toBe(BigInt(after.cash.receivedIrr) - BigInt(after.cash.refundedIrr));
    expect(after.purchases.primaryOrders - before.purchases.primaryOrders).toBe(1); expect(after.activity.checkoutStarted - before.activity.checkoutStarted).toBe(1); expect(after.activity.paymentVerified - before.activity.paymentVerified).toBe(1);
    // Independent fixture ledger, not a copy of the report's aggregation SQL.
    expect((await pool.query("SELECT r.status,r.amount_irr::text AS amount,(SELECT count(*)::int FROM order_event e WHERE e.order_id=r.order_id AND e.event_key='refund-complete:'||r.id::text) AS completion_events FROM refund r WHERE r.id=$1", [refundId])).rows[0]).toEqual({ status: "succeeded", amount: "10000", completion_events: 1 });
    const queueBefore = (await pool.query("SELECT count(*)::int AS n,coalesce(sum(attempts),0)::int AS attempts FROM outbox_job")).rows[0];
    const queueResponse = await page.request.get("/api/admin/reports/queue?page=1&pageSize=1"); expect(queueResponse.status()).toBe(200); expect(queueResponse.headers()["cache-control"]).toContain("no-store");
    const queue = (await queueResponse.json()).data as ReportWorkQueueDto;
    expect(queue.receipts.items.length).toBeLessThanOrEqual(1); expect(queue.jobs.items.length).toBeLessThanOrEqual(1);
    for (const job of queue.jobs.items) { expect(["payment.initialize", "payment.reconcile", "domain.other"]).toContain(job.type); expect(Object.keys(job).sort()).toEqual(["id", "type", "status", "attempts", "availableAt"].sort()); }
    expect((await pool.query("SELECT count(*)::int AS n,coalesce(sum(attempts),0)::int AS attempts FROM outbox_job")).rows[0]).toEqual(queueBefore);
    expect((await page.request.get("/api/admin/reports/period?from=2026-02-30&to=2026-03-01")).status()).toBe(400);
    expect((await page.request.get("/api/admin/reports/period?from=2025-01-01&to=2026-10-12")).status()).toBe(400);
    expect((await page.request.get("/api/admin/reports/queue?pageSize=101")).status()).toBe(400);
    const initialReportResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/reports/period" && response.request().method() === "GET");
    await page.goto(`/admin/reports?from=${encodeURIComponent(jalali)}&to=${encodeURIComponent(jalali)}`);
    const initial = await initialReportResponse; expect(initial.status()).toBe(200); expect(new URL(initial.url()).searchParams.get("from")).toBe(iso); expect(new URL(initial.url()).searchParams.get("to")).toBe(iso);
    await expect(page.getByRole("heading", { name: "گزارش دریافت و بازپرداخت", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "وضعیت فعلی فروشگاه؛ مستقل از بازهٔ گزارش", exact: true })).toBeVisible();
    const periodResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/reports/period" && new URL(response.url()).searchParams.get("from") === "2026-03-21");
    await page.getByLabel("از تاریخ", { exact: true }).fill("۱۴۰۵/۰۱/۰۱"); await page.getByLabel("تا پایان تاریخ", { exact: true }).fill("۱۴۰۵/۰۱/۰۱"); await page.getByRole("button", { name: "نمایش گزارش", exact: true }).click();
    expect((await periodResponse).status()).toBe(200);
    // Signed rendering is an explicitly controlled DTO transport fixture;
    // it does not fabricate a historical payment/refund in PostgreSQL.
    const signed: StoreReportDto = { ...after, cash: { receivedIrr: "0", refundedIrr: "10", netIrr: "-10" } };
    await page.route("**/api/admin/reports/period?*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: signed }) }));
    await page.getByRole("button", { name: "دریافت دوبارهٔ گزارش و فهرست‌ها", exact: true }).click();
    await expect(page.locator(".metric").filter({ has: page.getByText("خالص دریافت وجه در بازه", { exact: true }) }).locator("strong")).toHaveText(/−۱ تومان/u);
    await page.unroute("**/api/admin/reports/period?*");
    await page.setViewportSize({ width: 320, height: 740 }); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    const manager = await createAdmin(pool, "product_manager"); users.push(manager.userId); const managerPage = await deniedContext.newPage(); await loginAdmin(managerPage, manager);
    for (const endpoint of ["period", "queue"]) { const denied = await managerPage.request.get(`/api/admin/reports/${endpoint}`); expect(denied.status()).toBe(403); expect(denied.headers()["cache-control"]).toContain("no-store"); }
  } finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await customer.close(); await deniedContext.close(); await pool.end(); }
});
