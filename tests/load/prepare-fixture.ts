import { randomUUID, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const base = process.env.LOAD_BASE_URL ?? process.env.APP_BASE_URL;
const database = process.env.DATABASE_URL;
if (!base || !database || !process.env.MOCK_CONTROL_SECRET || !["test", "staging"].includes(process.env.DEPLOYMENT_ENV ?? "") || process.env.PAYMENT_PROVIDER !== "mock" || process.env.SMS_PROVIDER !== "mock") throw new Error("Load fixtures require controlled isolated test/staging configuration");
if (!new URL(database).pathname.endsWith("morphiume_staging")) throw new Error("Load fixtures refuse a different database");
const pool = new pg.Pool({ connectionString: database, max: 2 });
const { customerAuth } = await import("../../src/server/auth/index");
const { readMockOtp } = await import("../../src/server/auth/otp");
const { pool: authPool } = await import("../../src/server/db");
const nativeBase = process.env.APP_BASE_URL!;
const nativeRequest = (path: string, body: object) => customerAuth.handler(new Request(`${nativeBase}/api/auth${path}`, { method: "POST", headers: { Origin: new URL(nativeBase).origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const fixtureId = randomUUID(), productId = randomUUID(), variantId = randomUUID(), productIds: string[] = [], users: { userId: string; cookies: { name: string; value: string }[] }[] = [];
try {
  const health = await fetch(`${base}/api/health/live`);
  const environment = (await health.json()).data?.environment;
  if (!health.ok || !["test", "staging"].includes(environment)) throw new Error("Target does not identify itself as test/staging");
  // Explicitly synthetic data for load testing, not a commercial product.
  for (let i = 0; i < 200; i++) {
    const product = i === 0 ? productId : randomUUID(), variant = i === 0 ? variantId : randomUUID(), stock = i === 0 ? 100000 : 1000;
    productIds.push(product);
    await pool.query("INSERT INTO product(id,name,slug,description,concentration,family,image_url,status,search_key) VALUES($1,$2,$3,$4,'QA','آزمایشی','/assets/sample-perfume.svg','published','آزمون ظرفیت qa')", [product, `آزمون ظرفیت QA ${fixtureId.slice(0, 8)} ${i + 1}`, `load-${fixtureId}-${i}`, "دادهٔ مصنوعی آزمون ظرفیت؛ برای فروش واقعی معتبر نیست."]);
    await pool.query("INSERT INTO variant(id,product_id,sku,volume_ml,price_irr) VALUES($1,$2,$3,50,10000)", [variant, product, `LOAD-${fixtureId}-${i}`]);
    await pool.query("INSERT INTO inventory_balance(variant_id,on_hand,reserved) VALUES($1,$2,0)", [variant, stock]);
    await pool.query("INSERT INTO inventory_ledger(id,variant_id,operation_key,on_hand_delta,reserved_delta,reason) VALUES($1,$2,$3,$4,0,'QA synthetic load dataset')", [randomUUID(), variant, `load-seed:${fixtureId}:${i}`, stock]);
  }
  for (let i = 0; i < 200; i++) {
    const phone = `+989${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    // Native library handler is used in the fixture process without network-IP
    // metadata. Runtime HTTP limits remain enabled; no forwarded IP is invented.
    const sent = await nativeRequest("/phone-number/send-otp", { phoneNumber: phone });
    if (!sent.ok) throw new Error(`Fixture OTP send failed at account ${i + 1} with HTTP ${sent.status}`);
    const code = await readMockOtp(phone);
    if (!code || !/^\d{6}$/.test(code)) throw new Error(`Fixture inbox failed at account ${i + 1}`);
    const verified = await nativeRequest("/phone-number/verify", { phoneNumber: phone, code });
    if (!verified.ok) throw new Error(`Fixture verification failed at account ${i + 1} with HTTP ${verified.status}`);
    const response = await verified.json();
    const cookies = verified.headers.getSetCookie().filter(c => c.startsWith("morphiume-customer.")).map(line => { const pair = line.split(";", 1)[0]!, offset = pair.indexOf("="); return { name: pair.slice(0, offset), value: pair.slice(offset + 1) }; });
    if (!response.user?.id || !cookies.length) throw new Error("Native fixture session was not issued");
    users.push({ userId: response.user.id, cookies });
    if (i === 0) {
      const preflight = await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ") } });
      const actualSession = await preflight.json();
      if (!preflight.ok || actualSession?.user?.id !== response.user.id) throw new Error("Native fixture auth keys do not match the target staging app; no load test can proceed");
    }
  }
  await mkdir(".local", { recursive: true });
  await writeFile(".local/load-fixture.json", JSON.stringify({ fixtureId, createdAt: new Date().toISOString(), environment, baseURL: base, productId, productIds, variantId, initialStock: 100000, users }), { mode: 0o600 });
  console.log("Created 200 isolated native customer sessions and 200 clearly marked load products. Private fixture saved under ignored .local; no credentials printed.");
} catch (error) {
  await pool.query("UPDATE product SET status='archived' WHERE id=ANY($1::uuid[])", [productIds]);
  if (users.length) {
    await pool.query('UPDATE "user" SET disabled=true WHERE id=ANY($1::text[])', [users.map(user => user.userId)]);
    await pool.query("DELETE FROM session WHERE user_id=ANY($1::text[])", [users.map(user => user.userId)]);
  }
  throw error;
} finally { await pool.end(); await authPool.end(); }
