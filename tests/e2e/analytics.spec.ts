import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { CheckoutDto } from "../../src/contracts/commerce";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { archiveFixtureProducts, assertPrivateOrderCounts } from "./next-acceptance-fixtures";
import { assertAnonymousEvent, assertCookieFreeCapture, assertUnchangedServerCounts, expectCaptureEnabled, expectDeniedAnalytics, expectNeutralCapture, observeBrowserCapture, readAnalyticsPeriod, tehranDates } from "./analytics-fixtures";
import { recordSafeHttpResponse } from "./safe-response";

test("T04/T06/T18: native analytics permissions return aggregate-only no-store reports and reject revoked access", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [];
  const contexts = await Promise.all([0, 1, 2, 3, 4].map(() => browser.newContext({ baseURL })));
  try {
    await expectCaptureEnabled(page.request);
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const { iso, jalali } = tehranDates(); await readAnalyticsPeriod(page.request, iso);
    const manager = await createAdmin(pool, "product_manager"); users.push(manager.userId);
    const managerPage = await contexts[0]!.newPage(); await loginAdmin(managerPage, manager); await readAnalyticsPeriod(managerPage.request, iso);
    const finance = await createAdmin(pool, "finance"); users.push(finance.userId);
    const financePage = await contexts[1]!.newPage(); await loginAdmin(financePage, finance); await readAnalyticsPeriod(financePage.request, iso);
    const support = await createAdmin(pool, "support"); users.push(support.userId);
    const supportPage = await contexts[2]!.newPage(); await loginAdmin(supportPage, support);
    await expectDeniedAnalytics(await supportPage.request.get(`/api/admin/analytics/period?from=${iso}&to=${iso}`), 403);
    await supportPage.goto("/admin/analytics");
    await expect(supportPage.getByText("اجازهٔ مشاهدهٔ آمار فعالیت را ندارید.", { exact: true })).toBeVisible();
    await expect(supportPage.locator(".metric")).toHaveCount(0);
    await expectDeniedAnalytics(await contexts[3]!.request.get("/api/admin/analytics/period"), 401);
    const customer = await loginCustomer(contexts[4]!, baseURL!); users.push(customer.userId);
    await expectDeniedAnalytics(await contexts[4]!.request.get("/api/admin/analytics/period"), 401);
    for (const query of ["from=2026-02-30&to=2026-03-01", "from=2025-01-01&to=2026-10-13", `from=${iso}&to=${iso}&userId=${owner.userId}`]) expect((await page.request.get(`/api/admin/analytics/period?${query}`)).status()).toBe(400);
    const shown = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/analytics/period");
    await page.goto(`/admin/analytics?from=${encodeURIComponent(jalali)}&to=${encodeURIComponent(jalali)}`); expect((await shown).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "آمار فعالیت فروشگاه", exact: true })).toBeVisible();
    for (const heading of ["مشاهده‌های بی‌نام مرورگر؛ آمار تقریبی", "فعالیت‌های ثبت‌شدهٔ سفارش در بازه", "سرانجام سفارش‌های آغازشده در بازه"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const changedDates = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/analytics/period" && new URL(response.url()).searchParams.get("from") === "2026-03-21");
    await page.getByLabel("از تاریخ", { exact: true }).fill("۱۴۰۵/۰۱/۰۱"); await page.getByLabel("تا پایان تاریخ", { exact: true }).fill("۱۴۰۵/۰۱/۰۱");
    await page.getByRole("button", { name: "نمایش آمار", exact: true }).click();
    const applied = await changedDates; expect(recordSafeHttpResponse(applied, "analytics-period").status).toBe(200);
    expect((await applied.json()).data.period).toEqual({ fromDate: "2026-03-21", toDate: "2026-03-21", timeZone: "Asia/Tehran" });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    const revoked = await page.request.post("/api/admin/roles", { headers: { Origin: baseURL! }, data: { userId: manager.userId, roles: ["support"], disabled: false, reason: "QA synthetic analytics permission withdrawal" } });
    expect(recordSafeHttpResponse(revoked, "role-revoke").status).toBe(200);
    expect((await pool.query("SELECT count(*)::int AS n FROM session WHERE user_id=$1", [manager.userId])).rows[0]!.n).toBe(0);
    await expectDeniedAnalytics(await managerPage.request.get(`/api/admin/analytics/period?from=${iso}&to=${iso}`), 401);
    // Subsequent fresh native-session denial, not an instrumented post-RR race.
  } finally { await disableUsers(pool, users); await Promise.all(contexts.map(context => context.close())); await pool.end(); }
});

test("T07/T18/T21: anonymous analytics rejects metadata and CSRF; replay never changes server financial counts", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], products: string[] = [];
  const visitor = await browser.newContext({ baseURL });
  try {
    await expectCaptureEnabled(visitor.request);
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const product = await createProduct(page, baseURL!, `analytics-wire-${randomUUID()}`); products.push(product.id);
    const { iso } = tehranDates(), before = await readAnalyticsPeriod(page.request, iso);
    const view = { eventId: randomUUID(), kind: "product_view", productId: product.id };
    const send = (data: unknown) => visitor.request.post("/api/analytics/events", { headers: { Origin: baseURL! }, data });
    for (const key of ["userId", "sessionId", "cartId", "orderId", "query", "email", "phone", "address", "amountIrr", "authority"]) expect((await send({ ...view, [key]: "QA forbidden metadata canary" })).status()).toBe(400);
    for (const data of [{ ...view, eventId: "invalid" }, { ...view, productId: "invalid" }, { ...view, kind: "checkout_started" }, { eventId: randomUUID(), kind: "search", hasQuery: "true", resultBucket: "zero" }, { eventId: randomUUID(), kind: "search", hasQuery: true, resultBucket: "invalid" }]) expect((await send(data)).status()).toBe(400);
    expect((await visitor.request.post("/api/analytics/events", { data: view })).status()).toBe(403);
    expect((await visitor.request.post("/api/analytics/events", { headers: { Origin: "https://qa-cross-site.invalid" }, data: view })).status()).toBe(403);
    expect((await visitor.request.post("/api/analytics/events", { headers: { Origin: baseURL!, "Content-Type": "text/plain" }, data: JSON.stringify(view) })).status()).toBe(415);
    expect((await visitor.request.post("/api/analytics/events", { headers: { Origin: baseURL!, "Content-Type": "application/json" }, data: JSON.stringify(view).padEnd(1025, " ") })).status()).toBe(413);
    await expectNeutralCapture(await send(view)); await expectNeutralCapture(await send(view));
    await expectNeutralCapture(await send({ eventId: view.eventId, kind: "search", hasQuery: true, resultBucket: "zero" }));
    const search = { eventId: randomUUID(), kind: "search", hasQuery: true, resultBucket: "zero" }, addition = { eventId: randomUUID(), kind: "add_to_cart", productId: product.id };
    await expectNeutralCapture(await send(search)); await expectNeutralCapture(await send(addition));
    const unknown = { ...view, eventId: randomUUID(), productId: randomUUID() }; await expectNeutralCapture(await send(unknown));
    const after = await readAnalyticsPeriod(page.request, iso);
    for (const key of ["productView", "search", "addToCart", "zeroResultSearch"] as const) expect(BigInt(after.observed[key]) - BigInt(before.observed[key])).toBe(1n);
    assertUnchangedServerCounts(before, after);
    expect((await pool.query("SELECT count(*)::int AS n FROM analytics_seen WHERE event_id=ANY($1::uuid[])", [[view.eventId, search.eventId, addition.eventId]])).rows[0]!.n).toBe(3);
    expect((await pool.query("SELECT count(*)::int AS n FROM analytics_seen WHERE event_id=$1", [unknown.eventId])).rows[0]!.n).toBe(0);
    expect((await visitor.cookies(baseURL!)).length).toBe(0);
  } finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await visitor.close(); await pool.end(); }
});

test("T12/T19/T21/T25: genuine product/search/cart capture omits private context and collector outage cannot block a paid purchase", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], products: string[] = [];
  const customer = await browser.newContext({ baseURL }), buyer = await customer.newPage(), wire = observeBrowserCapture(buyer);
  try {
    await expectCaptureEnabled(customer.request);
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const marker = randomUUID(), product = await createProduct(page, baseURL!, `analytics-ui-${marker}`); products.push(product.id);
    const account = await loginCustomer(customer, baseURL!); users.push(account.userId);
    expect((await customer.cookies(baseURL!)).some(cookie => cookie.httpOnly && cookie.name.startsWith("morphiume-customer"))).toBe(true);
    await buyer.goto(`/products/${product.id}`); await expect(buyer).toHaveURL(new RegExp(`/products/${product.slug}$`, "u"));
    await expect(buyer.getByRole("heading", { name: product.name, exact: true })).toBeVisible();
    const kindCount = async (kind: string) => (await wire.snapshot()).filter(record => record.kind === "event" && (record.body as { kind?: string }).kind === kind).length;
    await expect.poll(() => kindCount("product_view")).toBe(1);
    await buyer.goto("/products");
    await buyer.getByRole("searchbox", { name: "جست‌وجوی عطر", exact: true }).fill(marker);
    await buyer.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(buyer.getByRole("heading", { name: product.name, exact: true })).toBeVisible(); await expect.poll(() => kindCount("search")).toBe(1);
    const canary = `QA nonexistent ${randomUUID()} 09120000000 qa-canary@fixture.invalid`;
    await buyer.getByRole("searchbox", { name: "جست‌وجوی عطر", exact: true }).fill(canary);
    await buyer.getByRole("button", { name: "جست‌وجو", exact: true }).click();
    await expect(buyer.getByRole("heading", { name: "محصولی با این انتخاب پیدا نشد.", exact: true })).toBeVisible(); await expect.poll(() => kindCount("search")).toBe(2);
    const captured = await wire.snapshot(); assertCookieFreeCapture(captured, baseURL!);
    const searches = captured.filter(record => record.kind === "event" && (record.body as { kind?: string }).kind === "search");
    expect(searches.map(record => { assertAnonymousEvent(record.body); return record.body; })).toEqual([expect.objectContaining({ kind: "search", hasQuery: true, resultBucket: "1_10" }), expect.objectContaining({ kind: "search", hasQuery: true, resultBucket: "zero" })]);
    for (const record of captured.filter(record => record.kind === "event")) expect(record.status).toBe(202);
    expect(JSON.stringify(captured.map(record => record.body)).includes(canary)).toBe(false);
    await buyer.goto(`/products/${product.slug}`); await expect.poll(() => kindCount("product_view")).toBe(2);
    const { iso } = tehranDates(), before = await readAnalyticsPeriod(page.request, iso);
    let dropped = 0;
    // Only advisory collector delivery is interrupted; native/session/cart/checkout stay real.
    await buyer.route("**/api/analytics/events", async route => { dropped++; await route.abort("failed"); });
    await buyer.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
    await expect(buyer.getByText("محصول به سبد خرید افزوده شد.", { exact: false }).first()).toBeVisible(); await expect.poll(() => dropped).toBe(1);
    const allCapture = await wire.snapshot(); assertCookieFreeCapture(allCapture, baseURL!);
    const additions = allCapture.filter(record => record.kind === "event" && (record.body as { kind?: string }).kind === "add_to_cart");
    expect(additions).toHaveLength(1); assertAnonymousEvent(additions[0]!.body);
    expect(additions[0]!.body).toMatchObject({ kind: "add_to_cart", productId: product.id }); expect(additions[0]!.status).toBeNull();
    await buyer.goto("/checkout");
    for (const [label, value] of [["نام گیرنده", "گیرندهٔ مصنوعی QA"], ["شمارهٔ تماس گیرنده", "09121234567"], ["استان", "تهران"], ["شهر", "تهران"], ["نشانی کامل", "نشانی مصنوعی QA؛ ارسال واقعی انجام نشود."], ["پلاک", "1"], ["کدپستی ده‌رقمی", "1234567890"]] as const) await buyer.getByLabel(label, { exact: true }).fill(value);
    const quoted = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout/quote" && response.request().method() === "POST");
    await buyer.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click(); expect((await quoted).status()).toBe(200);
    await buyer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/u }).check();
    const started = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST"); await buyer.getByRole("button", { name: /^پرداخت /u }).click();
    const response = await started; expect(response.status()).toBe(201); const checkout = (await response.json()).data as CheckoutDto;
    await expect(buyer).toHaveURL(/\/test\/payments\/MOCK-/u); const authority = buyer.url().split("/").at(-1)!;
    await buyer.getByRole("button", { name: "ثبت نتیجهٔ موفق آزمایشی", exact: true }).click();
    await expect(buyer).toHaveURL(new RegExp(`/orders/${checkout.orderId}$`, "u")); await expect(buyer.getByText("پرداخت تأیید شد.", { exact: true })).toBeVisible();
    for (let replay = 0; replay < 2; replay++) expect((await customer.request.post(`/api/test/payments/${authority}`, { headers: { Origin: baseURL! }, data: { outcome: "succeeded" } })).status()).toBe(200);
    expect((await customer.request.get(`/api/payments/mock/callback?Authority=${encodeURIComponent(authority)}`, { maxRedirects: 0 })).status()).toBe(303);
    await assertPrivateOrderCounts(pool, checkout.orderId);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [product.variants[0]!.id])).rows[0]).toEqual({ on_hand: 3, reserved: 0 });
    const paid = await readAnalyticsPeriod(page.request, iso); expect(paid.observed).toEqual(before.observed);
    for (const key of ["checkoutStarted", "verifiedReceipts", "primaryPaidOrders"] as const) expect(BigInt(paid.server[key]) - BigInt(before.server[key])).toBe(1n);
    expect(paid.server.completedOrders).toBe(before.server.completedOrders);
    for (const status of ["shipped", "delivered"] as const) expect((await page.request.patch(`/api/admin/orders/${checkout.orderId}/shipment`, { headers: { Origin: baseURL! }, data: { carrier: "شرکت ارسال مصنوعی QA", trackingCode: `QA-ANALYTICS-${marker}`, status } })).status()).toBe(200);
    const delivered = await readAnalyticsPeriod(page.request, iso);
    expect(BigInt(delivered.server.completedOrders) - BigInt(before.server.completedOrders)).toBe(1n);
    for (const key of ["started", "primaryPaid", "delivered"] as const) expect(BigInt(delivered.cohort[key]) - BigInt(before.cohort[key])).toBe(1n);
    expect(delivered.observed).toEqual(before.observed);
  } finally { wire.stop(); await customer.close(); await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await pool.end(); }
});
