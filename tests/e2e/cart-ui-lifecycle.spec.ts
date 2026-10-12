import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import type pg from "pg";
import type { AddressInput, CheckoutDto, CheckoutInput, QuoteDto } from "../../src/contracts/commerce";
import { controlledCustomerOtp, createAdmin, createProduct, disableUsers, isolatedPool, loginAdmin, loginCustomer } from "./acceptance-fixtures";
import { nativeAuthAction } from "./native-auth-actions";
import { readCurrentCart } from "./cart-fixtures";
import { archiveFixtureProducts, assertPrivateOrderCounts, payControlledCheckout } from "./next-acceptance-fixtures";
import { optionalCartLifecycleDiagnostics } from "./cart-lifecycle-diagnostics";

const draftKey = "morphiume-checkout-draft-v2", recoveryKey = "morphiume-checkout-recovery-v2";
const gift: AddressInput = { recipient: "گیرندهٔ هدیهٔ مصنوعی QA", phone: "09351234567", province: "تهران", city: "تهران", address: "نشانی هدیهٔ مصنوعی QA؛ برای ارسال واقعی معتبر نیست.", plaque: "12", unit: "", postalCode: "1234567890" };
async function fillGiftAddress(page: Page, value = gift) {
  for (const [label, key] of [["نام گیرنده", "recipient"], ["شمارهٔ تماس گیرنده", "phone"], ["استان", "province"], ["شهر", "city"], ["نشانی کامل", "address"], ["پلاک", "plaque"], ["کدپستی ده‌رقمی", "postalCode"]] as const) await page.getByLabel(label, { exact: true }).fill(value[key]);
}
async function addThroughProduct(page: Page, slug: string) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "افزودن به سبد خرید", exact: true }).click();
  await expect(page.getByText("محصول به سبد خرید افزوده شد.", { exact: false }).first()).toBeVisible();
}
async function loginCustomerThroughUi(page: Page, context: BrowserContext, baseURL: string, checkout = false) {
  let phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
  while (phone === "+989351234567") phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
  await page.getByLabel(checkout ? "شمارهٔ همراه خریدار" : "شمارهٔ همراه", { exact: true }).fill(phone);
  await nativeAuthAction(page, "customer-otp-send", () => page.getByRole("button", { name: "دریافت کد تأیید", exact: true }).click());
  await expect(page.getByLabel("کد تأیید را وارد کنید.", { exact: true })).toBeVisible();
  await nativeAuthAction(page, "customer-otp-verify", async () => {
    await page.getByLabel("کد تأیید را وارد کنید.", { exact: true }).fill(await controlledCustomerOtp(context, phone));
    await page.getByRole("button", { name: "تأیید شماره", exact: true }).click();
  });
  const session = await context.request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  const user = (await session.json()).user;
  expect(user.phoneNumber === phone && user.phoneNumberVerified === true, "The browser now has the genuinely verified native customer session").toBe(true);
  expect(typeof user.id === "string" && user.id.length > 0).toBe(true);
  return { userId: user.id as string, phone };
}
async function reviewVerified(page: Page) {
  const quoted = page.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout/quote" && response.request().method() === "POST");
  await page.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
  const response = await quoted;
  expect(response.status()).toBe(200);
  const quote = (await response.json()).data as QuoteDto;
  await expect(page.getByRole("button", { name: /^پرداخت / })).toBeDisabled();
  return quote;
}
async function storedPending(page: Page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) ?? "null") as { kind: string; ownerId: string; cartId: string; key: string; input: CheckoutInput } | null, recoveryKey);
}
async function cartState(pool: pg.Pool, id: string) {
  return (await pool.query("SELECT c.user_id,c.version,c.coupon_code,COALESCE((SELECT jsonb_agg(jsonb_build_object('variantId',i.variant_id,'quantity',i.quantity) ORDER BY i.variant_id) FROM cart_item i WHERE i.cart_id=c.id),'[]'::jsonb) AS items FROM cart c WHERE c.id=$1", [id])).rows[0]!;
}
async function assertNoPrivateAddress(page: Page, ownerId: string, addresses: AddressInput[]) {
  await expect.poll(() => page.evaluate(({ draftKey, recoveryKey, ownerId, addresses }) => {
    const draft = sessionStorage.getItem(draftKey), recovery = sessionStorage.getItem(recoveryKey);
    const privateValues = addresses.flatMap(address => [address.recipient, address.address, address.phone, address.phone.replace(/^0/u, "+98")]);
    const fields = ["address-recipient", "address-address", "address-phone"].map(id => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "");
    const consent = document.querySelector<HTMLInputElement>(".checkbox-row input[type=checkbox]");
    return recovery === null && !(draft?.includes(ownerId)) && !privateValues.some(value => document.body.textContent?.includes(value) || draft?.includes(value) || fields.includes(value)) && !consent?.checked;
  }, { draftKey, recoveryKey, ownerId, addresses })).toBe(true);
}

test("T07/T12/T25: native guest gift checkout keeps its recipient; a second-tab change requires a fresh quote and consent", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), users: string[] = [admin.userId], products: string[] = [];
  const customer = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const buyer = await customer.newPage(), peer = await customer.newPage();
  try {
    await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, randomUUID()); products.push(product.id);
    await addThroughProduct(buyer, product.slug);
    const guest = await readCurrentCart(customer);
    await buyer.goto("/checkout"); await fillGiftAddress(buyer);
    await buyer.getByRole("button", { name: "ادامه و انتخاب روش ارسال", exact: true }).click();
    // Observe the response across a sanctioned native429 wait without starting
    // an unrelated 10-second promise timeout before phone verification finishes.
    let firstQuote: Response | undefined;
    const captureQuote = (response: Response) => { if (!firstQuote && new URL(response.url()).pathname === "/api/checkout/quote" && response.request().method() === "POST") firstQuote = response; };
    buyer.on("response", captureQuote);
    const account = await loginCustomerThroughUi(buyer, customer, baseURL!, true); users.push(account.userId);
    await expect.poll(() => firstQuote?.status() ?? null).toBe(200);
    buyer.off("response", captureQuote);
    const quoteResponse = firstQuote!;
    const quote = (await quoteResponse.json()).data as QuoteDto;
    const claimed = await readCurrentCart(customer);
    expect(claimed).toMatchObject({ id: guest.id, version: guest.version + 1 });
    expect((await cartState(pool, claimed.id)).user_id === account.userId).toBe(true);
    await expect(buyer.getByText(gift.recipient, { exact: true })).toBeVisible();
    await expect(buyer.getByText("+989351234567", { exact: true })).toBeVisible();
    expect(account.phone === "+989351234567").toBe(false);
    await expect.poll(() => buyer.evaluate(({ key, ownerId }) => {
      const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return draft?.ownerId === ownerId && draft?.address?.recipient === "گیرندهٔ هدیهٔ مصنوعی QA" && draft?.address?.phone === "+989351234567";
    }, { key: draftKey, ownerId: account.userId })).toBe(true);
    const consent = buyer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ });
    await expect(consent).not.toBeChecked(); await consent.check();
    await peer.goto("/cart");
    const quantity = peer.getByRole("combobox", { name: `تعداد ${product.name}`, exact: true });
    await expect(quantity).toHaveValue("1");
    await buyer.route("**/api/checkout", async route => {
      try {
        expect((route.request().postDataJSON() as CheckoutInput).cartVersion).toBe(quote.cartVersion);
        const changed = peer.waitForResponse(response => new URL(response.url()).pathname === "/api/cart/items" && response.request().method() === "PUT");
        await quantity.selectOption("2");
        expect((await changed).status()).toBe(200);
        await expect(quantity).toHaveValue("2");
        await route.continue();
      } catch (error) { await route.abort().catch(() => {}); throw error; }
    }, { times: 1 });
    const stale = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST");
    await buyer.getByRole("button", { name: /^پرداخت / }).click();
    const rejection = await stale; expect(rejection.status()).toBe(409); expect((await rejection.json()).error.code).toBe("CART_CHANGED");
    await expect(buyer.getByLabel("نام گیرنده", { exact: true })).toHaveValue(gift.recipient);
    await expect(buyer.getByLabel("شمارهٔ تماس گیرنده", { exact: true })).toHaveValue("+989351234567");
    await expect.poll(() => storedPending(buyer)).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1", [account.userId])).rows[0]!.n).toBe(0);
    const fresh = await readCurrentCart(customer), refreshedQuote = await reviewVerified(buyer);
    expect(fresh.items[0]?.quantity).toBe(2); expect(refreshedQuote.cartVersion).toBe(fresh.version);
    expect(refreshedQuote.subtotal.amountIrr).toBe((2n * BigInt(product.variants[0]!.price.amountIrr)).toString());
    await expect(consent).not.toBeChecked(); await expect(buyer.getByRole("button", { name: /^پرداخت / })).toBeDisabled();
  } finally {
    await customer.close(); await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await pool.end();
  }
});

test("T07/T12/T19: generic conflict retains the exact pending request; native logout clears its private input", async ({ browser, page, baseURL }) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), users: string[] = [admin.userId], products: string[] = [];
  const customer = await browser.newContext({ baseURL }), buyer = await customer.newPage();
  try {
    await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, randomUUID()); products.push(product.id);
    const account = await loginCustomer(customer, baseURL!); users.push(account.userId);
    await addThroughProduct(buyer, product.slug);
    await buyer.goto("/checkout"); await fillGiftAddress(buyer); await reviewVerified(buyer);
    await buyer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ }).check();
    let original: { key: string; input: CheckoutInput } | undefined, competing: CheckoutDto | undefined;
    await buyer.route("**/api/checkout", async route => {
      try {
        original = { key: route.request().headers()["idempotency-key"]!, input: route.request().postDataJSON() as CheckoutInput };
        const response = await customer.request.post("/api/checkout", { headers: { Origin: baseURL!, "Idempotency-Key": original.key }, data: { ...original.input, address: { ...original.input.address, plaque: "13" } } });
        expect(response.status()).toBe(201); competing = (await response.json()).data as CheckoutDto;
        await route.continue();
      } catch (error) { await route.abort().catch(() => {}); throw error; }
    }, { times: 1 });
    const denied = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST");
    await buyer.getByRole("button", { name: /^پرداخت / }).click();
    const conflict = await denied; expect(conflict.status()).toBe(409); expect((await conflict.json()).error.code).toBe("CONFLICT");
    expect(original !== undefined && competing !== undefined).toBe(true);
    const requested = original!, saved = await storedPending(buyer);
    expect(saved).toMatchObject({ kind: "pending", ownerId: account.userId, key: requested.key, input: requested.input });
    await expect(buyer.getByRole("heading", { name: "نتیجهٔ ثبت سفارش هنوز دریافت نشده است.", exact: true })).toBeVisible();
    await buyer.reload();
    await expect(buyer.getByRole("button", { name: "بررسی نتیجهٔ ثبت سفارش", exact: true })).toBeEnabled();
    expect(await storedPending(buyer)).toEqual(saved);
    const retry = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST");
    await buyer.getByRole("button", { name: "بررسی نتیجهٔ ثبت سفارش", exact: true }).click();
    const again = await retry; expect(again.status()).toBe(409); expect((await again.json()).error.code).toBe("CONFLICT");
    expect(again.request().headers()["idempotency-key"]).toBe(requested.key); expect(again.request().postDataJSON()).toEqual(requested.input);
    expect(await storedPending(buyer)).toEqual(saved);
    expect((await pool.query("SELECT count(*)::int AS n FROM orders WHERE user_id=$1", [account.userId])).rows[0]!.n).toBe(1);
    const recorded = competing!;
    expect(recorded.redirectUrl?.includes("/test/payments/MOCK-")).toBe(true);
    await payControlledCheckout(customer, baseURL!, recorded.redirectUrl!.split("/").at(-1)!, recorded.orderId);
    await assertPrivateOrderCounts(pool, recorded.orderId);
    expect(await storedPending(buyer)).toEqual(saved);
    const accountTab = await customer.newPage();
    await accountTab.goto("/account");
    const signedOut = accountTab.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-out" && response.request().method() === "POST");
    await accountTab.getByRole("button", { name: "خروج از حساب", exact: true }).click();
    expect((await signedOut).status()).toBe(200);
    await expect(accountTab.getByRole("heading", { name: "ورود با شمارهٔ همراه", exact: true })).toBeVisible();
    await assertNoPrivateAddress(buyer, account.userId, [gift]);
    await expect(buyer.getByRole("heading", { name: "نتیجهٔ ثبت سفارش هنوز دریافت نشده است.", exact: true })).toHaveCount(0);
  } finally {
    await customer.close(); await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await pool.end();
  }
});

test("T07/T12/T19/T25: UI recovers a committed response loss; native logout and account switch clear private state across tabs", async ({ browser, page, baseURL }, info) => {
  const pool = isolatedPool(), admin = await createAdmin(pool), users: string[] = [admin.userId], products: string[] = [];
  const customer = await browser.newContext({ baseURL });
  const diagnostics = await optionalCartLifecycleDiagnostics(customer, info.project.name);
  const buyer = await customer.newPage();
  try {
    await loginAdmin(page, admin);
    const product = await createProduct(page, baseURL!, randomUUID()); products.push(product.id);
    const account = await loginCustomer(customer, baseURL!); users.push(account.userId);
    await addThroughProduct(buyer, product.slug);
    const cart = await readCurrentCart(customer), originalCookie = (await customer.cookies(baseURL!)).find(cookie => cookie.name === "morphiume-cart");
    expect(originalCookie !== undefined).toBe(true);
    await buyer.goto("/checkout"); await fillGiftAddress(buyer); const quote = await reviewVerified(buyer);
    await buyer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ }).check();
    let committed: CheckoutDto | undefined, original: { key: string; input: CheckoutInput } | undefined;
    await buyer.route("**/api/checkout", async route => {
      original = { key: route.request().headers()["idempotency-key"]!, input: route.request().postDataJSON() as CheckoutInput };
      const response = await route.fetch(); expect(response.status()).toBe(201);
      committed = (await response.json()).data as CheckoutDto; await route.abort("failed");
    }, { times: 1 });
    await buyer.getByRole("button", { name: /^پرداخت / }).click();
    await expect(buyer.getByText("پاسخ ثبت سفارش دریافت نشد. نتیجه را با همان درخواست بررسی کنید.", { exact: true })).toBeVisible();
    await expect(buyer.getByRole("button", { name: "بررسی نتیجهٔ ثبت سفارش", exact: true })).toBeEnabled();
    expect(committed !== undefined && original !== undefined).toBe(true);
    const checkout = committed!, requested = original!, saved = await storedPending(buyer);
    expect(saved).toMatchObject({ kind: "pending", ownerId: account.userId, key: requested.key, input: requested.input });
    expect(await readCurrentCart(customer)).toMatchObject({ id: cart.id, version: cart.version + 1, items: [], couponCode: null });
    await buyer.goto("/cart");
    await expect(buyer.getByRole("heading", { name: "سبد خرید شما خالی است.", exact: true })).toBeVisible();
    await addThroughProduct(buyer, product.slug); await buyer.goto("/cart");
    const quantity = buyer.getByRole("combobox", { name: `تعداد ${product.name}`, exact: true });
    await quantity.selectOption("2"); await expect(quantity).toHaveValue("2");
    const selection = await cartState(pool, cart.id);
    expect(selection.items).toEqual([{ variantId: product.variants[0]!.id, quantity: 2 }]);
    await customer.clearCookies({ name: "morphiume-cart" }); // Native customer auth cookies remain genuine.
    const replacementClaim = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/cart/claim" && response.request().method() === "POST");
    await buyer.goto("/checkout");
    await expect(buyer.getByRole("heading", { name: "نتیجهٔ ثبت سفارش هنوز دریافت نشده است.", exact: true })).toBeVisible();
    const claimed = await replacementClaim; expect(claimed.status()).toBe(200);
    const replacement = (await claimed.json()).data as { id: string; version: number; items: unknown[] };
    expect(replacement.id === cart.id).toBe(false); expect(replacement.items).toEqual([]);
    expect(await storedPending(buyer)).toEqual(saved);
    const cartCount = Number((await pool.query("SELECT count(*)::text AS n FROM cart")).rows[0]!.n);
    const recovered = buyer.waitForResponse(response => new URL(response.url()).pathname === "/api/checkout" && response.request().method() === "POST");
    await buyer.getByRole("button", { name: "بررسی نتیجهٔ ثبت سفارش", exact: true }).click();
    const replay = await recovered; expect(replay.status()).toBe(201);
    expect(replay.request().headers()["idempotency-key"]).toBe(requested.key); expect(replay.request().postDataJSON()).toEqual(requested.input);
    expect((await replay.json()).data).toMatchObject({ orderId: checkout.orderId, paymentAttemptId: checkout.paymentAttemptId, total: quote.total });
    await expect(buyer).toHaveURL(/\/test\/payments\/MOCK-/);
    await buyer.getByRole("button", { name: "ثبت نتیجهٔ موفق آزمایشی", exact: true }).click();
    await expect(buyer).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    const addressPanel = buyer.locator(".order-panel").filter({ has: buyer.getByRole("heading", { name: "گیرنده و نشانی", exact: true }) });
    await expect(addressPanel).toContainText(gift.recipient);
    await expect(addressPanel).toContainText("+989351234567");
    expect(Number((await pool.query("SELECT count(*)::text AS n FROM cart")).rows[0]!.n)).toBe(cartCount);
    expect(await cartState(pool, cart.id)).toEqual(selection);
    await assertPrivateOrderCounts(pool, checkout.orderId);
    expect((await pool.query("SELECT count(*)::int AS n FROM inventory_ledger WHERE order_id=$1 AND reason='payment_commit'", [checkout.orderId])).rows[0]!.n).toBe(1);
    expect((await pool.query("SELECT on_hand,reserved FROM inventory_balance WHERE variant_id=$1", [product.variants[0]!.id])).rows[0]).toEqual({ on_hand: 3, reserved: 0 });
    expect((await pool.query("SELECT quantity,unit_price_irr::text AS price FROM order_item WHERE order_id=$1", [checkout.orderId])).rows).toEqual([{ quantity: 1, price: product.variants[0]!.price.amountIrr }]);
    await expect.poll(() => buyer.evaluate(key => { const record = JSON.parse(sessionStorage.getItem(key) ?? "null"); return record?.kind === "known" && record?.input === undefined; }, recoveryKey)).toBe(true);

    await customer.addCookies([originalCookie!]); // Reopen this native owner's retained, real cart selection.
    const peer = await customer.newPage(), accountTab = await customer.newPage();
    const peerGift = { ...gift, recipient: "گیرندهٔ خصوصی تب دوم QA", address: "نشانی خصوصی تب دوم QA؛ ارسال واقعی انجام نشود." };
    await peer.goto("/checkout"); await fillGiftAddress(peer, peerGift); await reviewVerified(peer);
    await peer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ }).check();
    await expect(peer.getByRole("checkbox", { name: /مبلغ و.*شرایط خرید/ })).toBeChecked();
    await expect.poll(() => peer.evaluate(({ key, ownerId, recipient }) => {
      const draft = JSON.parse(sessionStorage.getItem(key) ?? "null");
      return draft?.ownerId === ownerId && draft?.address?.recipient === recipient;
    }, { key: draftKey, ownerId: account.userId, recipient: peerGift.recipient })).toBe(true);
    await accountTab.goto("/account");
    const signedOut = accountTab.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/sign-out" && response.request().method() === "POST");
    await accountTab.getByRole("button", { name: "خروج از حساب", exact: true }).click();
    expect((await signedOut).status()).toBe(200);
    await expect(accountTab.getByRole("heading", { name: "ورود با شمارهٔ همراه", exact: true })).toBeVisible();
    await assertNoPrivateAddress(peer, account.userId, [gift, peerGift]);
    await assertNoPrivateAddress(buyer, account.userId, [gift, peerGift]);
    const other = await loginCustomerThroughUi(accountTab, customer, baseURL!); users.push(other.userId);
    await expect(accountTab.getByRole("button", { name: "خروج از حساب", exact: true })).toBeVisible();
    await assertNoPrivateAddress(peer, account.userId, [gift, peerGift]);
    await assertNoPrivateAddress(buyer, account.userId, [gift, peerGift]);
    const otherCart = await readCurrentCart(customer);
    expect(otherCart.id === cart.id).toBe(false); expect(otherCart.items).toEqual([]);
    expect((await cartState(pool, otherCart.id)).user_id === other.userId).toBe(true);
    expect((await (await customer.request.get("/api/orders")).json()).data).toEqual([]);
    expect((await customer.request.get(`/api/orders/${checkout.orderId}`)).status()).toBe(404);
    expect(await cartState(pool, cart.id)).toEqual(selection);
  } finally {
    await diagnostics?.finish();
    await customer.close(); await archiveFixtureProducts(pool, products); await disableUsers(pool, users); await pool.end();
  }
});
