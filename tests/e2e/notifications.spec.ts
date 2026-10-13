import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { archiveFixtureProducts, assertPrivateOrderCounts, controlledCheckout, payControlledCheckout } from "./next-acceptance-fixtures";
import { assertNotificationDto, assertNotificationUiAccessible, deliverOwnedNotificationOrder, expectNotificationUnread, notificationPanel, notificationStatus, openCustomerNotifications, operatorFixtureTitle, readNotificationPage, seedLegacyCustomerFeed, canonicalOperatorRow, assertCanonicalOperatorPage, reduceOwnedOperatorMembership, settleOwnedNotificationOrder, sourceNotificationEvent, waitNotificationPage } from "./notification-fixtures";

test("T05/T18/T19: native customer notification paging and idempotent read never expose another actor or operator inbox", async ({ browser, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], marker = randomUUID();
  const customer = await browser.newContext({ baseURL }), foreign = await browser.newContext({ baseURL }), visitor = await browser.newContext({ baseURL });
  try {
    const account = await loginCustomer(customer, baseURL!); users.push(account.userId);
    const other = await loginCustomer(foreign, baseURL!); users.push(other.userId);
    const owned = await seedLegacyCustomerFeed(pool, account.userId, 105, marker), otherRows = await seedLegacyCustomerFeed(pool, other.userId, 2, randomUUID());
    const page = await readNotificationPage(await customer.request.get("/api/notifications/page?page=2&pageSize=40"), "customer");
    expect(page).toMatchObject({ page: 2, pageSize: 40, totalItems: 105, totalPages: 3, unreadCount: "53" });
    expect(page.items.map(item => item.id)).toEqual(owned.slice(40, 80).map(item => item.id));
    const last = await readNotificationPage(await customer.request.get("/api/notifications/page?page=3&pageSize=40"), "customer"); expect(last.items).toHaveLength(25);
    const unread = await readNotificationPage(await customer.request.get("/api/notifications/page?unreadOnly=true&pageSize=100"), "customer");
    expect(unread.totalItems).toBe(53); expect(unread.unreadCount).toBe("53"); expect(unread.items.every(item => item.readAt === null)).toBe(true);
    const legacy = await notificationStatus(await customer.request.get("/api/notifications"), "customer", "list", 200);
    const items = (await legacy.json()).data as unknown[]; expect(items).toHaveLength(100); items.forEach(assertNotificationDto);
    expect(items.map(item => { assertNotificationDto(item); return item.id; })).toEqual(owned.slice(0, 100).map(item => item.id));
    const id = owned[0]!.id;
    const first = await notificationStatus(await customer.request.get(`/api/notifications/${id}`), "customer", "get", 200); const dto = (await first.json()).data;
    assertNotificationDto(dto); expect(dto).toMatchObject({ id, kind: "legacy.order_update", orderId: null, readAt: null });
    for (const value of [otherRows[0]!.id, randomUUID()]) {
      await notificationStatus(await customer.request.get(`/api/notifications/${value}`), "customer", "denied", 404);
      await notificationStatus(await customer.request.patch(`/api/notifications/${value}`, { headers: { Origin: baseURL! }, data: {} }), "customer", "denied", 404);
    }
    await notificationStatus(await visitor.request.get("/api/notifications"), "customer", "denied", 401);
    await notificationStatus(await customer.request.get("/api/admin/notifications/page"), "operator", "denied", 401);
    for (const query of ["pageSize=101", "page=0", "unreadOnly=invalid"]) expect((await customer.request.get(`/api/notifications/page?${query}`)).status()).toBe(400);
    expect((await customer.request.patch(`/api/notifications/${id}`, { data: {} })).status()).toBe(403);
    expect((await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: "https://qa-foreign.invalid" }, data: {} })).status()).toBe(403);
    expect((await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: baseURL! }, data: { readAt: "2000-01-01T00:00:00Z" } })).status()).toBe(400);
    expect((await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: baseURL!, "Content-Type": "application/json" }, data: "{}".padEnd(257, " ") })).status()).toBe(413);
    const read = await notificationStatus(await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: baseURL! }, data: {} }), "customer", "read", 200);
    const saved = (await read.json()).data; expect(Object.keys(saved).sort()).toEqual(["id", "readAt"]); expect(saved.id).toBe(id); expect(Number.isFinite(Date.parse(saved.readAt))).toBe(true);
    const repeat = await notificationStatus(await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: baseURL! }, data: {} }), "customer", "read", 200); expect((await repeat.json()).data).toEqual(saved);
    const after = await readNotificationPage(await customer.request.get("/api/notifications/page?unreadOnly=true"), "customer"); expect(after.unreadCount).toBe("52"); expect(after.totalItems).toBe(52);
    expect((await (await foreign.request.get("/api/notifications/page")).json()).data.totalItems).toBe(2);
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [account.userId]);
    await notificationStatus(await customer.request.get("/api/notifications/page"), "customer", "denied", 403);
    await notificationStatus(await customer.request.patch(`/api/notifications/${id}`, { headers: { Origin: baseURL! }, data: {} }), "customer", "denied", 403);
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [id])).rows[0]!.read_at.toISOString()).toBe(saved.readAt);
  } finally { await disableUsers(pool, users); await customer.close(); await foreign.close(); await visitor.close(); await pool.end(); }
});

test("T05/T18/T19/T20: genuine customer inbox UI pages105 rows, preserves reads and removes private data after logout and account change", async ({ browser, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], marker = randomUUID();
  const customer = await browser.newContext({ baseURL }), buyer = await customer.newPage(), peer = await customer.newPage();
  try {
    const account = await loginCustomer(customer, baseURL!); users.push(account.userId);
    const labelA = `اعلان مصنوعی مشتری A ${marker.slice(0, 8)}`, owned = await seedLegacyCustomerFeed(pool, account.userId, 105, marker, labelA);
    await buyer.goto("/account"); const initial = await openCustomerNotifications(buyer); expect(initial.totalItems).toBe(105); expect(initial.unreadCount).toBe("53");
    const panel = notificationPanel(buyer, "customer"); await expect(panel.getByRole("article")).toHaveCount(20); await expectNotificationUnread(buyer, "customer", "53");
    const sized = waitNotificationPage(buyer, "customer", 1, 50); await panel.getByRole("combobox", { name: "اعلان در هر صفحه", exact: true }).selectOption("50");
    expect((await readNotificationPage(await sized, "customer")).pageSize).toBe(50); await expect(panel.getByRole("article")).toHaveCount(50);
    const second = waitNotificationPage(buyer, "customer", 2, 50); await panel.getByRole("navigation", { name: "صفحه‌های اعلان‌ها", exact: true }).getByRole("button", { name: "صفحهٔ بعد", exact: true }).click();
    expect((await readNotificationPage(await second, "customer")).items.map(item => item.id)).toEqual(owned.slice(50, 100).map(item => item.id));
    const final = waitNotificationPage(buyer, "customer", 3, 50); await panel.getByRole("button", { name: "صفحهٔ بعد", exact: true }).click();
    expect((await readNotificationPage(await final, "customer")).items).toHaveLength(5); await expect(panel.getByRole("article")).toHaveCount(5); await expectNotificationUnread(buyer, "customer", "53");
    const target = owned[100]!, row = panel.getByRole("article", { name: target.title, exact: true });
    const patch = buyer.waitForResponse(response => new URL(response.url()).pathname === `/api/notifications/${target.id}` && response.request().method() === "PATCH"), reloaded = waitNotificationPage(buyer, "customer", 3, 50);
    await row.getByRole("button", { name: "علامت‌گذاری به‌عنوان خوانده‌شده", exact: true }).click();
    const marked = await patch; await notificationStatus(marked, "customer", "read", 200); expect(marked.request().postData()).toBe("{}"); const saved = (await marked.json()).data;
    expect((await readNotificationPage(await reloaded, "customer")).unreadCount).toBe("52"); await expectNotificationUnread(buyer, "customer", "52");
    await expect(panel.getByText("اعلان به‌عنوان خوانده‌شده ثبت شد.", { exact: true })).toBeVisible(); await expect(row.getByRole("button", { name: "علامت‌گذاری به‌عنوان خوانده‌شده", exact: true })).toHaveCount(0);
    const repeat = await notificationStatus(await customer.request.patch(`/api/notifications/${target.id}`, { headers: { Origin: baseURL! }, data: {} }), "customer", "read", 200); expect((await repeat.json()).data).toEqual(saved);
    const filtered = waitNotificationPage(buyer, "customer", 1, 50, true); await panel.getByRole("checkbox", { name: "فقط خوانده‌نشده‌ها", exact: true }).check();
    const unseen = await readNotificationPage(await filtered, "customer"); expect(unseen.totalItems).toBe(52); expect(unseen.items).toHaveLength(50); await expect(panel.getByRole("article")).toHaveCount(50);
    const hundred = waitNotificationPage(buyer, "customer", 1, 100, true); await panel.getByRole("combobox", { name: "اعلان در هر صفحه", exact: true }).selectOption("100");
    expect((await readNotificationPage(await hundred, "customer")).items).toHaveLength(52); await expect(panel.getByRole("article")).toHaveCount(52); await expectNotificationUnread(buyer, "customer", "52");
    await assertNotificationUiAccessible(buyer, "customer");
    const keyboardRefresh = waitNotificationPage(buyer, "customer", 1, 100, true); await panel.getByRole("button", { name: "تازه‌سازی اعلان‌ها", exact: true }).focus(); await buyer.keyboard.press("Enter");
    expect((await readNotificationPage(await keyboardRefresh, "customer")).unreadCount).toBe("52");
    await peer.goto("/account"); await openCustomerNotifications(peer); await expect(notificationPanel(peer, "customer").getByText(owned[0]!.title, { exact: true })).toBeVisible();
    const signedOut = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-out" && response.request().method() === "POST");
    const documentCommit = buyer.waitForEvent("framenavigated", { predicate: frame => frame === buyer.mainFrame() && new URL(frame.url()).pathname === "/account" });
    await buyer.getByRole("button", { name: "خروج از حساب", exact: true }).click(); expect((await signedOut).status()).toBe(200); await documentCommit; await buyer.waitForLoadState("domcontentloaded");
    await expect(buyer.getByRole("heading", { name: "ورود با شمارهٔ همراه", exact: true })).toBeVisible(); await expect(notificationPanel(peer, "customer")).toHaveCount(0);
    await expect(buyer.getByText(labelA, { exact: false })).toHaveCount(0); await expect(peer.getByText(labelA, { exact: false })).toHaveCount(0);
    const next = await loginCustomer(customer, baseURL!); users.push(next.userId); const labelB = `اعلان مصنوعی مشتری B ${marker.slice(0, 8)}`, ownB = await seedLegacyCustomerFeed(pool, next.userId, 2, randomUUID(), labelB);
    await buyer.goto("/account"); const nextFeed = await openCustomerNotifications(buyer); expect(nextFeed.items.map(item => item.id)).toEqual(ownB.map(item => item.id)); await expect(panel.getByRole("article")).toHaveCount(2);
    await expect(buyer.getByText(labelA, { exact: false })).toHaveCount(0); await expectNotificationUnread(buyer, "customer", "1");
    await notificationStatus(await customer.request.get(`/api/notifications/${target.id}`), "customer", "denied", 404);
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [next.userId]);
    const denied = waitNotificationPage(buyer, "customer"); await panel.getByRole("button", { name: "تازه‌سازی اعلان‌ها", exact: true }).click(); await notificationStatus(await denied, "customer", "denied", 403);
    await expect(notificationPanel(buyer, "customer")).toHaveCount(0); await expect(buyer.getByText(labelB, { exact: false })).toHaveCount(0);
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [target.id])).rows[0]!.read_at.toISOString()).toBe(saved.readAt);
  } finally { await disableUsers(pool, users); await customer.close(); await pool.end(); }
});

test("T04/T06/T18/T20/T21: genuine operator inbox UI uses permission-scoped rows and masks data on factor and role withdrawal", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], products: string[] = [], marker = randomUUID();
  const stock = await browser.newContext({ baseURL }), financeContext = await browser.newContext({ baseURL }), customer = await browser.newContext({ baseURL });
  const stockPage = await stock.newPage(), financePage = await financeContext.newPage();
  try {
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const worker = await createAdmin(pool); users.push(worker.userId); await loginAdmin(stockPage, worker);
    const finance = await createAdmin(pool); users.push(finance.userId); await loginAdmin(financePage, finance);
    const buyer = await loginCustomer(customer, baseURL!); users.push(buyer.userId);
    const product = await createProduct(page, baseURL!, `notifications-ui-${marker}`); products.push(product.id);
    const purchase = await controlledCheckout(customer, baseURL!, product.variants[0]!.id, `qa-notifications-ui-${marker}`); await payControlledCheckout(customer, baseURL!, purchase.authority, purchase.checkout.orderId);
    await deliverOwnedNotificationOrder(page, baseURL!, purchase.checkout.orderId, marker);
    expect((await customer.request.post(`/api/orders/${purchase.checkout.orderId}/returns`, { headers: { Origin: baseURL! }, data: { kind: "return", reason: "درخواست مصنوعی QA برای آزمون اعلان؛ ارسال واقعی ندارد." } })).status()).toBe(201);
    const receiptResponse = await page.request.get(`/api/admin/orders/${purchase.checkout.orderId}/receipts`); expect(receiptResponse.status()).toBe(200); const receiptId = (await receiptResponse.json()).data[0].id as string;
    expect((await page.request.post(`/api/admin/orders/${purchase.checkout.orderId}/refunds`, { headers: { Origin: baseURL! }, data: { receiptId, amountIrr: "10000", reason: "بازپرداخت مصنوعی QA؛ انتقال واقعی انجام نشود.", operationKey: `qa-notification-ui-refund-${marker}` } })).status()).toBe(200);
    const requestEvent = await sourceNotificationEvent(pool, purchase.checkout.orderId, "request.return"), refundEvent = await sourceNotificationEvent(pool, purchase.checkout.orderId, "refund.pending");
    await settleOwnedNotificationOrder(purchase.checkout.orderId, buyer.userId, [owner.userId, worker.userId, finance.userId]);
    const requestId = await canonicalOperatorRow(pool, worker.userId, purchase.checkout.orderId, requestEvent, "request.return", "orders.fulfill"), refundId = await canonicalOperatorRow(pool, finance.userId, purchase.checkout.orderId, refundEvent, "refund.pending", "refunds.write");
    await reduceOwnedOperatorMembership(pool, worker.userId, "fulfillment"); await reduceOwnedOperatorMembership(pool, finance.userId, "finance");
    const requestTitle = operatorFixtureTitle("request.return"), refundTitle = operatorFixtureTitle("refund.pending");
    const stockLoaded = waitNotificationPage(stockPage, "operator"); await stockPage.goto("/admin/notifications"); await readNotificationPage(await stockLoaded, "operator");
    const financeLoaded = waitNotificationPage(financePage, "operator"); await financePage.goto("/admin/notifications"); await readNotificationPage(await financeLoaded, "operator");
    await expect(stockPage.getByRole("heading", { name: "اعلان‌های مدیریت", exact: true })).toBeVisible(); await expect(financePage.getByRole("heading", { name: "اعلان‌های مدیریت", exact: true })).toBeVisible();
    const panel = notificationPanel(stockPage, "operator"), financePanel = notificationPanel(financePage, "operator");
    const stockSized = waitNotificationPage(stockPage, "operator", 1, 100); await panel.getByRole("combobox", { name: "اعلان در هر صفحه", exact: true }).selectOption("100");
    const stockData = await assertCanonicalOperatorPage(pool, worker.userId, ["orders.fulfill"], await readNotificationPage(await stockSized, "operator"));
    const financeSized = waitNotificationPage(financePage, "operator", 1, 100); await financePanel.getByRole("combobox", { name: "اعلان در هر صفحه", exact: true }).selectOption("100");
    const financeData = await assertCanonicalOperatorPage(pool, finance.userId, ["refunds.write"], await readNotificationPage(await financeSized, "operator"));
    expect(stockData.items.find(item => item.id === requestId)?.readAt).toBeNull(); expect(financeData.items.find(item => item.id === refundId)?.readAt).toBeNull();
    const requestRow = panel.getByRole("article", { name: requestTitle, exact: true }).filter({ has: stockPage.locator(`a[href="/admin/orders/${purchase.checkout.orderId}"]`) });
    const refundRow = financePanel.getByRole("article", { name: refundTitle, exact: true }).filter({ has: financePage.locator(`a[href="/admin/orders/${purchase.checkout.orderId}"]`) });
    await expect(requestRow).toHaveCount(1); await expect(refundRow).toHaveCount(1);
    await expect(panel.getByText(refundTitle, { exact: true })).toHaveCount(0); await expect(financePanel.getByText(requestTitle, { exact: true })).toHaveCount(0);
    for (const row of [requestRow, refundRow]) await expect(row.getByRole("link", { name: "مشاهدهٔ سفارش", exact: true })).toHaveAttribute("href", `/admin/orders/${purchase.checkout.orderId}`);
    // Every actual visible row, including prior events, has a checked canonical source/template/permission.
    await expectNotificationUnread(stockPage, "operator", stockData.unreadCount); await expectNotificationUnread(financePage, "operator", financeData.unreadCount);
    const patch = stockPage.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/notifications/${requestId}` && response.request().method() === "PATCH"), reloaded = waitNotificationPage(stockPage, "operator", 1, 100);
    await requestRow.getByRole("button", { name: "علامت‌گذاری به‌عنوان خوانده‌شده", exact: true }).click(); const marked = await patch; await notificationStatus(marked, "operator", "read", 200); expect(marked.request().postData()).toBe("{}"); const saved = (await marked.json()).data;
    const readData = await assertCanonicalOperatorPage(pool, worker.userId, ["orders.fulfill"], await readNotificationPage(await reloaded, "operator"));
    expect(readData.unreadCount).toBe(String(BigInt(stockData.unreadCount) - 1n)); await expectNotificationUnread(stockPage, "operator", readData.unreadCount);
    const repeated = await notificationStatus(await stock.request.patch(`/api/admin/notifications/${requestId}`, { headers: { Origin: baseURL! }, data: {} }), "operator", "read", 200); expect((await repeated.json()).data).toEqual(saved);
    const unread = waitNotificationPage(stockPage, "operator", 1, 100, true); await panel.getByRole("checkbox", { name: "فقط خوانده‌نشده‌ها", exact: true }).check();
    const unreadData = await assertCanonicalOperatorPage(pool, worker.userId, ["orders.fulfill"], await readNotificationPage(await unread, "operator"), true);
    expect(unreadData.unreadCount).toBe(readData.unreadCount); expect(unreadData.items.some(item => item.id === requestId)).toBe(false);
    expect(unreadData.items.every(item => item.readAt === null)).toBe(true); await expect(panel.getByRole("article")).toHaveCount(unreadData.totalItems);
    if (unreadData.totalItems === 0) await expect(panel.getByRole("heading", { name: "اعلان خوانده‌نشده‌ای در این صفحه ندارید.", exact: true })).toBeVisible();
    else await expect(panel.getByRole("heading", { name: "اعلان خوانده‌نشده‌ای در این صفحه ندارید.", exact: true })).toHaveCount(0);
    await assertNotificationUiAccessible(stockPage, "operator"); await assertNotificationUiAccessible(financePage, "operator");
    await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1', [worker.userId]);
    const factorDenied = waitNotificationPage(stockPage, "operator", 1, 100, true); await panel.getByRole("button", { name: "تازه‌سازی اعلان‌ها", exact: true }).click(); await notificationStatus(await factorDenied, "operator", "denied", 403);
    await expect(notificationPanel(stockPage, "operator")).toHaveCount(0); await expect(stockPage.getByText(requestTitle, { exact: true })).toHaveCount(0); await expect.poll(() => new URL(stockPage.url()).pathname).toBe("/admin/login");
    const revoked = await page.request.post("/api/admin/roles", { headers: { Origin: baseURL! }, data: { userId: finance.userId, roles: ["support"], disabled: true, reason: "QA native operator inbox role/session withdrawal" } }); expect(revoked.status()).toBe(200);
    const roleDenied = waitNotificationPage(financePage, "operator", 1, 100); await financePanel.getByRole("button", { name: "تازه‌سازی اعلان‌ها", exact: true }).click(); await notificationStatus(await roleDenied, "operator", "denied", 401);
    await expect(notificationPanel(financePage, "operator")).toHaveCount(0); await expect(financePage.getByText(refundTitle, { exact: true })).toHaveCount(0); await expect.poll(() => new URL(financePage.url()).pathname).toBe("/admin/login");
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [requestId])).rows[0]!.read_at.toISOString()).toBe(saved.readAt);
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [refundId])).rows[0]!.read_at).toBeNull(); await assertPrivateOrderCounts(pool, purchase.checkout.orderId);
  } finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await stock.close(); await financeContext.close(); await customer.close(); await pool.end(); }
});

test("T04/T06/T18/T21: genuine operator MFA scopes notification reads by current permission and preserves financial history", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), users: string[] = [], products: string[] = [], marker = randomUUID();
  const contexts = await Promise.all([0, 1, 2, 3, 4].map(() => browser.newContext({ baseURL })));
  try {
    const owner = await createAdmin(pool); users.push(owner.userId); await loginAdmin(page, owner);
    const fulfillment = await createAdmin(pool); users.push(fulfillment.userId); const stockPage = await contexts[0]!.newPage(); await loginAdmin(stockPage, fulfillment);
    const finance = await createAdmin(pool); users.push(finance.userId); const financePage = await contexts[1]!.newPage(); await loginAdmin(financePage, finance);
    for (const [index, role] of [[2, "support"], [3, "product_manager"]] as const) {
      const denied = await createAdmin(pool, role); users.push(denied.userId); const deniedPage = await contexts[index]!.newPage(); await loginAdmin(deniedPage, denied);
      await notificationStatus(await deniedPage.request.get("/api/admin/notifications/page"), "operator", "denied", 403);
      await deniedPage.goto("/admin/notifications");
      await expect(deniedPage.getByText("اجازهٔ مشاهدهٔ اعلان‌های مدیریت را ندارید.", { exact: true })).toBeVisible();
      await expect(notificationPanel(deniedPage, "operator")).toHaveCount(0);
    }
    const buyer = await loginCustomer(contexts[4]!, baseURL!); users.push(buyer.userId);
    const product = await createProduct(page, baseURL!, `notifications-${marker}`); products.push(product.id);
    const purchase = await controlledCheckout(contexts[4]!, baseURL!, product.variants[0]!.id, `qa-notifications-${marker}`);
    await payControlledCheckout(contexts[4]!, baseURL!, purchase.authority, purchase.checkout.orderId);
    await deliverOwnedNotificationOrder(page, baseURL!, purchase.checkout.orderId, marker);
    const requested = await contexts[4]!.request.post(`/api/orders/${purchase.checkout.orderId}/returns`, { headers: { Origin: baseURL! }, data: { kind: "return", reason: "درخواست مصنوعی QA؛ تحویل فیزیکی یا اطلاعات تماس واقعی ندارد." } }); expect(requested.status()).toBe(201);
    const receipts = await page.request.get(`/api/admin/orders/${purchase.checkout.orderId}/receipts`); expect(receipts.status()).toBe(200); const receiptId = (await receipts.json()).data[0].id as string;
    const refund = await page.request.post(`/api/admin/orders/${purchase.checkout.orderId}/refunds`, { headers: { Origin: baseURL! }, data: { receiptId, amountIrr: "10000", reason: "درخواست مصنوعی QA؛ انتقال واقعی انجام نشود.", operationKey: `qa-notifications-refund-${marker}` } }); expect(refund.status()).toBe(200);
    const requestEvent = await sourceNotificationEvent(pool, purchase.checkout.orderId, "request.return"), refundEvent = await sourceNotificationEvent(pool, purchase.checkout.orderId, "refund.pending");
    await settleOwnedNotificationOrder(purchase.checkout.orderId, buyer.userId, [owner.userId, fulfillment.userId, finance.userId]);
    const rows = new Map<string, { request: string; refund: string }>();
    for (const userId of [owner.userId, fulfillment.userId, finance.userId]) rows.set(userId, { request: await canonicalOperatorRow(pool, userId, purchase.checkout.orderId, requestEvent, "request.return", "orders.fulfill"), refund: await canonicalOperatorRow(pool, userId, purchase.checkout.orderId, refundEvent, "refund.pending", "refunds.write") });
    await reduceOwnedOperatorMembership(pool, fulfillment.userId, "fulfillment"); await reduceOwnedOperatorMembership(pool, finance.userId, "finance");
    const ownerFeed = await assertCanonicalOperatorPage(pool, owner.userId, ["orders.fulfill", "refunds.write"], await readNotificationPage(await page.request.get("/api/admin/notifications?pageSize=100"), "operator"));
    const ownRows = rows.get(owner.userId)!; expect(ownerFeed.items.filter(item => item.orderId === purchase.checkout.orderId).map(item => item.id).sort()).toEqual([ownRows.request, ownRows.refund].sort());
    const stockFeed = await assertCanonicalOperatorPage(pool, fulfillment.userId, ["orders.fulfill"], await readNotificationPage(await stockPage.request.get("/api/admin/notifications/page?pageSize=100"), "operator"));
    expect(stockFeed.items.filter(item => item.orderId === purchase.checkout.orderId).map(item => item.kind)).toEqual(["request.return"]);
    const financeFeed = await assertCanonicalOperatorPage(pool, finance.userId, ["refunds.write"], await readNotificationPage(await financePage.request.get("/api/admin/notifications/page?pageSize=100"), "operator"));
    expect(financeFeed.items.filter(item => item.orderId === purchase.checkout.orderId).map(item => item.kind)).toEqual(["refund.pending"]);
    const stockRows = rows.get(fulfillment.userId)!, financeRows = rows.get(finance.userId)!;
    for (const id of [stockRows.refund, financeRows.request, randomUUID()]) await notificationStatus(await stockPage.request.get(`/api/admin/notifications/${id}`), "operator", "denied", 404);
    await notificationStatus(await financePage.request.get(`/api/admin/notifications/${stockRows.request}`), "operator", "denied", 404);
    await notificationStatus(await stockPage.request.get("/api/notifications/page"), "customer", "denied", 401);
    const marked = await notificationStatus(await stockPage.request.patch(`/api/admin/notifications/${stockRows.request}`, { headers: { Origin: baseURL! }, data: {} }), "operator", "read", 200); const readAt = (await marked.json()).data.readAt as string;
    const replay = await notificationStatus(await stockPage.request.patch(`/api/admin/notifications/${stockRows.request}`, { headers: { Origin: baseURL! }, data: {} }), "operator", "read", 200); expect((await replay.json()).data.readAt).toBe(readAt);
    expect((await stockPage.request.patch(`/api/admin/notifications/${stockRows.refund}`, { headers: { Origin: baseURL! }, data: {} })).status()).toBe(404);
    expect((await financePage.request.patch(`/api/admin/notifications/${financeRows.refund}`, { headers: { Origin: baseURL! }, data: { userId: owner.userId } })).status()).toBe(400);
    await pool.query('UPDATE "user" SET two_factor_enabled=false WHERE id=$1', [fulfillment.userId]);
    // Negative current-factor fixture after genuine MFA, not a claimed native disable-button workflow.
    await notificationStatus(await stockPage.request.get("/api/admin/notifications/page"), "operator", "denied", 403);
    await notificationStatus(await stockPage.request.patch(`/api/admin/notifications/${stockRows.request}`, { headers: { Origin: baseURL! }, data: {} }), "operator", "denied", 403);
    const revoked = await page.request.post("/api/admin/roles", { headers: { Origin: baseURL! }, data: { userId: finance.userId, roles: ["support"], disabled: true, reason: "QA owned notification role/session withdrawal" } }); expect(revoked.status()).toBe(200);
    await notificationStatus(await financePage.request.get("/api/admin/notifications/page"), "operator", "denied", 401);
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [stockRows.request])).rows[0]!.read_at.toISOString()).toBe(readAt);
    expect((await pool.query("SELECT read_at FROM notification_message WHERE id=$1", [financeRows.refund])).rows[0]!.read_at).toBeNull();
    await assertPrivateOrderCounts(pool, purchase.checkout.orderId);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [product.variants[0]!.id])).rows[0]).toEqual({ on_hand: 3, reserved: 0 });
  } finally { await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await Promise.all(contexts.map(context => context.close())); await pool.end(); }
});
