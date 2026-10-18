import { randomBytes, randomUUID } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../../../src/server/config";

const mocks = vi.hoisted(() => ({ settings: undefined as RuntimeConfig | undefined, handler: vi.fn() }));
vi.mock("../../../src/server/config", () => ({ getConfig: () => mocks.settings! }));
vi.mock("../../../src/server/auth/index", () => ({ adminAuth: { handler: mocks.handler } }));
import { PRIVATE_PREVIEW_EMAIL, isPrivatePreviewEnabled, privatePreviewHeaders, readPrivatePreviewConfig } from "../../../src/server/auth/private-preview";

describe("private preview capability and target boundary", () => {
  let root: string, directory: string, file: string;
  let capability: Record<string, unknown>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "morphiume-preview-unit-"));
    directory = path.join(root, ".private-preview-access");
    file = path.join(directory, "config.json");
    mocks.settings = {
      DEPLOYMENT_ENV: "staging", APP_BASE_URL: "http://192.168.240.51",
      DATABASE_URL: "postgresql://unused@localhost/unused", MEDIA_ROOT: root,
      AUTH_SECRET: randomBytes(32).toString("hex"), ADMIN_AUTH_SECRET: randomBytes(32).toString("hex"),
      MOCK_CONTROL_SECRET: randomBytes(32).toString("hex"), PAYMENT_PROVIDER: "mock", SMS_PROVIDER: "mock",
      ANONYMOUS_ANALYTICS_ENABLED: false,
    };
    capability = { version: 1, origin: "http://192.168.240.51", email: PRIVATE_PREVIEW_EMAIL,
      userId: randomUUID(), password: randomBytes(32).toString("hex"),
      totpURI: "otpauth://totp/Morphiume%3Aunit?secret=JBSWY3DPEHPK3PXP&issuer=Morphiume" };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    expect(mocks.handler).not.toHaveBeenCalled();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function install(value: unknown = capability) {
    await mkdir(directory, { mode: 0o700 });
    await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  }
  async function expectUnavailable() {
    const error = await readPrivatePreviewConfig().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 503 });
    const message = error instanceof Error ? error.message : "";
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toContain(root);
    expect(message).not.toContain(String(capability.password));
    expect(message).not.toContain(String(capability.totpURI));
  }

  it("keeps an absent capability on normal authentication without invoking native login", async () => {
    expect(await readPrivatePreviewConfig()).toBeNull();
    expect(await isPrivatePreviewEnabled()).toBe(false);
    expect(await privatePreviewHeaders()).toBeNull();
  });

  it("accepts the exact explicit capability", async () => {
    await install();
    expect(await readPrivatePreviewConfig()).toEqual(capability);
    expect(await isPrivatePreviewEnabled()).toBe(true);
  });

  it.each([
    ["test deployment", { DEPLOYMENT_ENV: "test" }],
    ["live deployment", { DEPLOYMENT_ENV: "live" }],
    ["localhost origin", { APP_BASE_URL: "http://localhost:3000" }],
    ["another private IP", { APP_BASE_URL: "http://192.168.240.52" }],
    ["explicit port", { APP_BASE_URL: "http://192.168.240.51:80" }],
    ["HTTPS origin", { APP_BASE_URL: "https://192.168.240.51" }],
    ["public origin", { APP_BASE_URL: "https://morphiume.ir" }],
    ["real payment adapter", { PAYMENT_PROVIDER: "zarinpal" }],
    ["real SMS adapter", { SMS_PROVIDER: "kavenegar" }],
  ] as const)("ignores a malformed capability before reading it for %s", async (_label, override) => {
    await install();
    await writeFile(file, "malformed capability containing private data");
    Object.assign(mocks.settings!, override);
    expect(await readPrivatePreviewConfig()).toBeNull();
    expect(await isPrivatePreviewEnabled()).toBe(false);
    expect(await privatePreviewHeaders()).toBeNull();
  });

  it("fails closed on malformed JSON with a generic error", async () => {
    await install();
    await writeFile(file, "{malformed");
    await expectUnavailable();
  });

  it.each([
    ["unknown key", { extra: true }], ["wrong version", { version: 2 }],
    ["other identity", { email: "other@fixture.invalid" }], ["invalid UUID", { userId: "invalid" }],
    ["short password", { password: "short" }], ["wrong origin", { origin: "http://192.168.240.52" }],
    ["non-TOTP URI", { totpURI: "https://fixture.invalid/secret" }],
    ["invalid TOTP secret", { totpURI: "otpauth://totp/unit?secret=invalid" }],
  ])("fails closed on %s", async (_label, override) => {
    await install({ ...capability, ...override });
    await expectUnavailable();
  });

  it.each([null, [], "capability"])("rejects a non-object capability (%j)", async value => {
    await install(value);
    await expectUnavailable();
  });

  describe.skipIf(process.platform !== "linux")("Linux filesystem boundary", () => {
    it("rejects a readable-by-group credential file", async () => {
      await install(); await chmod(file, 0o640); await expectUnavailable();
    });
    it("rejects a traversable-by-group private parent", async () => {
      await install(); await chmod(directory, 0o750); await expectUnavailable();
    });
    it("rejects a file owned by another UID", async () => {
      await install();
      const current = process.getuid!();
      vi.spyOn(process, "getuid").mockReturnValue(current + 1);
      await expectUnavailable();
    });
    it("rejects a symlinked credential file", async () => {
      await install();
      const target = path.join(root, "linked-config.json");
      await rename(file, target); await symlink(target, file); await expectUnavailable();
    });
    it("rejects a symlinked private directory", async () => {
      await install();
      const target = path.join(root, "linked-directory");
      await rename(directory, target); await symlink(target, directory); await expectUnavailable();
    });
    it("rejects a multiply linked credential file", async () => {
      await install(); await link(file, path.join(root, "second-config-link.json")); await expectUnavailable();
    });
  });
});
