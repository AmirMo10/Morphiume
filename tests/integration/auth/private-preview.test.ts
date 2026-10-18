import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../../src/server/config";
import { TestCookies } from "./helpers";

// Only the in-process application target changes. The actual validated test
// database/secrets and the process-level isolated-test gate remain unchanged.
const runtime = vi.hoisted(() => ({ mediaRoot: "", original: undefined as RuntimeConfig | undefined }));
vi.mock("../../../src/server/config", async () => {
  const actual = await vi.importActual<typeof import("../../../src/server/config")>("../../../src/server/config");
  return { ...actual, getConfig: (): RuntimeConfig => {
    runtime.original ??= actual.getConfig();
    if (!runtime.mediaRoot) throw new Error("Private preview test target not initialized");
    return { ...runtime.original, DEPLOYMENT_ENV: "staging", APP_BASE_URL: "http://192.168.240.51", MEDIA_ROOT: runtime.mediaRoot };
  } };
});

config({ path: ".env.local", quiet: true });
const enabled = process.env.DEPLOYMENT_ENV === "test" && process.env.PAYMENT_PROVIDER === "mock" && process.env.SMS_PROVIDER === "mock" && !!process.env.DATABASE_URL;

describe.skipIf(!enabled)("private preview with real native auth and isolated PostgreSQL", () => {
  let auth: typeof import("../../../src/server/auth/index");
  let actors: typeof import("../../../src/server/auth/actors");
  let preview: typeof import("../../../src/server/auth/private-preview");
  let commerce: ReturnType<typeof import("../../../src/server/runtime")["getCommerce"]>;
  let pool: typeof import("../../../src/server/db")["pool"];
  const origin = "http://192.168.240.51", id = randomUUID(), password = randomBytes(32).toString("hex");
  const enrollmentCookies = new TestCookies();
  let capability: { version: 1; origin: string; email: string; userId: string; password: string; totpURI: string };
  let file = "", created = false, genuineHeaders: Headers;

  async function native(endpoint: string, body: object) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await auth.adminAuth.handler(new Request(`${origin}/api/admin/auth${endpoint}`, {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: enrollmentCookies.header() },
        body: JSON.stringify(body),
      }));
      if (response.status === 429 && attempt === 0) {
        const retry = response.headers.get("X-Retry-After") ?? response.headers.get("Retry-After");
        const seconds = retry === null ? NaN : Number(retry);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 15) throw new Error("Unexpected native preview fixture retry interval");
        await response.body?.cancel();
        console.info(JSON.stringify({ event: "private_preview_qa_native_rate_wait", endpoint, waitMs: seconds * 1000 + 100 }));
        await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100));
        continue;
      }
      enrollmentCookies.collect(response);
      // Never include native response bodies, credentials or cookies in failures.
      expect(response.status).toBe(200);
      return await response.json() as Record<string, unknown>;
    }
    throw new Error("Native preview fixture rate limit did not clear after one permitted retry");
  }

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import("../../../src/server/config")>("../../../src/server/config");
    runtime.original = actual.getConfig();
    const target = new URL(runtime.original.DATABASE_URL);
    if (runtime.original.DEPLOYMENT_ENV !== "test" || runtime.original.PAYMENT_PROVIDER !== "mock" || runtime.original.SMS_PROVIDER !== "mock" ||
      !["localhost", "127.0.0.1"].includes(target.hostname) || target.search || target.hash ||
      !/^\/morphiume_staging(?:_qa_[0-9a-f]{16})?$/.test(target.pathname)) {
      throw new Error("Private preview QA refuses a nonisolated fixture database");
    }
    runtime.mediaRoot = await mkdtemp(path.join(os.tmpdir(), "morphiume-preview-integration-"));
    file = path.join(runtime.mediaRoot, ".private-preview-access", "config.json");
    auth = await import("../../../src/server/auth/index");
    actors = await import("../../../src/server/auth/actors");
    preview = await import("../../../src/server/auth/private-preview");
    ({ pool } = await import("../../../src/server/db"));
    commerce = (await import("../../../src/server/runtime")).getCommerce();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // A preexisting shared principal is never repurposed or modified by QA.
      if ((await client.query('SELECT id FROM "user" WHERE email=$1', [preview.PRIVATE_PREVIEW_EMAIL])).rowCount) {
        throw new Error("Reserved preview identity already exists; use a fresh isolated database");
      }
      await client.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)', [id, "QA isolated shared preview", preview.PRIVATE_PREVIEW_EMAIL]);
      await client.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES($1,$2,$2,'credential',$3)", [randomUUID(), id, await hashPassword(password)]);
      await client.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [id]);
      await client.query("COMMIT"); created = true;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }

    await native("/sign-in/email", { email: preview.PRIVATE_PREVIEW_EMAIL, password });
    const enrollment = await native("/two-factor/enable", { password });
    expect(typeof enrollment.totpURI).toBe("string");
    // Match the operator's pending-enrollment path. No SQL MFA/grant fabrication
    // and no test TOTP verification before the actual preview service is used.
    expect((await pool.query<{ two_factor_enabled: boolean }>('SELECT two_factor_enabled FROM "user" WHERE id=$1', [id])).rows[0]!.two_factor_enabled).toBe(false);
    await native("/sign-out", {});
    capability = { version: 1, origin, email: preview.PRIVATE_PREVIEW_EMAIL, userId: id, password, totpURI: String(enrollment.totpURI) };
  }, 40_000); // Includes at most two native 10s quota waits during enrollment.

  afterAll(async () => {
    try {
      if (created && pool) {
        await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [id]);
        await pool.query("DELETE FROM session WHERE user_id=$1", [id]);
      }
    } finally {
      if (pool) await pool.end();
      if (runtime.mediaRoot) await rm(runtime.mediaRoot, { recursive: true, force: true });
    }
  });

  it("requires native login when no capability exists", async () => {
    expect(await preview.isPrivatePreviewEnabled()).toBe(false);
    expect(await preview.privatePreviewHeaders()).toBeNull();
    await expect(actors.adminSession(new Headers())).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("coalesces anonymous access into a real password/TOTP session with one native grant", async () => {
    await mkdir(path.dirname(file), { mode: 0o700 });
    await writeFile(file, JSON.stringify(capability), { mode: 0o600 });
    const headers = await Promise.all(Array.from({ length: 4 }, () => preview.privatePreviewHeaders()));
    expect(headers.every(value => value instanceof Headers && !!value.get("cookie"))).toBe(true);
    expect(new Set(headers.map(value => value!.get("cookie"))).size).toBe(1);
    genuineHeaders = headers[0]!;
    const proof = await auth.adminAuth.api.getSession({ headers: genuineHeaders });
    expect(proof?.user.id).toBe(id);
    expect(proof?.user.twoFactorEnabled).toBe(true);
    const grants = await pool.query<{ n: number; fresh: boolean }>(
      `SELECT count(*)::int AS n,bool_and(g.factor_verified_at>clock_timestamp()-interval '5 minutes' AND g.expires_at>clock_timestamp()) AS fresh
       FROM admin_grant g JOIN session s ON s.id=g.session_id WHERE s.user_id=$1`, [id]);
    expect(grants.rows[0]).toEqual({ n: 1, fresh: true });
    expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM session WHERE user_id=$1", [id])).rows[0]!.n).toBe(1);
  });

  it("authorizes ordinary and sensitive domain reads through unchanged native actor guards", async () => {
    const state = await actors.adminSession(new Headers());
    expect(state.accessMode).toBe("private-preview");
    expect(state.user.id).toBe(id);
    expect(state.mfaVerified).toBe(true);
    expect(state.permissions).toContain("catalog.write");
    const actor = await actors.adminActor(new Headers(), "refunds.write", true);
    expect(actor.userId).toBe(id);
    expect(Array.isArray(await commerce.listAdminProducts(state.actor))).toBe(true);
  });

  it("does not authenticate a customer with the private native admin lease", async () => {
    expect(await auth.customerAuth.api.getSession({ headers: genuineHeaders })).toBeNull();
    await expect(actors.customerActor(genuineHeaders)).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(await actors.customerActor(genuineHeaders, true)).toBeUndefined();
  });

  it("refreshes a genuine factor and replaces a naturally expired native session", async () => {
    const original = await auth.adminAuth.api.getSession({ headers: genuineHeaders });
    expect(original?.user.id).toBe(id);
    const now = Date.now();
    let offset = 121_000;
    // Only the process wall clock changes; timers and the actual PostgreSQL
    // clock stay real. Native TOTP generation and verification see the same time.
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now + offset);
    try {
      const refreshed = await preview.privatePreviewHeaders();
      expect(refreshed).toBeInstanceOf(Headers);
      const same = await auth.adminAuth.api.getSession({ headers: refreshed! });
      expect(same?.session.id).toBe(original!.session.id);
      expect((await actors.adminActor(new Headers(), "refunds.write", true)).userId).toBe(id);

      // Expire only this test's native session. Keep its real grant and row so
      // the service can distinguish expiry from deliberate deletion/revocation.
      await pool.query("UPDATE session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND user_id=$2", [original!.session.id, id]);
      offset = 242_000;
      const renewed = await preview.privatePreviewHeaders();
      expect(renewed).toBeInstanceOf(Headers);
      const proof = await auth.adminAuth.api.getSession({ headers: renewed! });
      expect(proof?.user.id).toBe(id);
      expect(proof?.user.twoFactorEnabled).toBe(true);
      expect(proof?.session.id).not.toBe(original!.session.id);
      const grant = await pool.query<{ fresh: boolean }>(
        `SELECT g.factor_verified_at>clock_timestamp()-interval '5 minutes' AND g.expires_at>clock_timestamp() AS fresh
         FROM admin_grant g JOIN session s ON s.id=g.session_id WHERE s.id=$1 AND s.user_id=$2`, [proof!.session.id, id]);
      expect(grant.rows).toEqual([{ fresh: true }]);
      genuineHeaders = renewed!;
      expect((await actors.adminActor(new Headers(), "refunds.write", true)).userId).toBe(id);
    } finally { clock.mockRestore(); }
  });

  it("honors a revoked role immediately without recreating the role", async () => {
    await pool.query("DELETE FROM role_membership WHERE user_id=$1", [id]);
    try {
      await expect(actors.adminSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      await expect(actors.adminActor(new Headers(), "catalog.write")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM role_membership WHERE user_id=$1", [id])).rows[0]!.n).toBe(0);
    } finally { await pool.query("INSERT INTO role_membership(user_id,role) VALUES($1,'owner')", [id]); }
  });

  it("honors a disabled principal immediately without enabling it", async () => {
    await pool.query('UPDATE "user" SET disabled=true WHERE id=$1', [id]);
    try {
      await expect(actors.adminSession(new Headers())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      expect((await pool.query<{ disabled: boolean }>('SELECT disabled FROM "user" WHERE id=$1', [id])).rows[0]!.disabled).toBe(true);
    } finally { await pool.query('UPDATE "user" SET disabled=false WHERE id=$1', [id]); }
  });

  it("turns off anonymous access and rejects a previously genuine reserved-principal cookie", async () => {
    // Prove this is a still-valid native cookie, not an expired-session test.
    expect((await auth.adminAuth.api.getSession({ headers: genuineHeaders }))?.user.id).toBe(id);
    await rename(file, `${file}.disabled`);
    expect(await preview.readPrivatePreviewConfig()).toBeNull();
    expect(await preview.privatePreviewHeaders()).toBeNull();
    await expect(actors.adminSession(new Headers())).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    await expect(actors.adminSession(genuineHeaders)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
