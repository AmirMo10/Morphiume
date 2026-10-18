import "server-only";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { CommerceError } from "../../contracts/commerce";
import { getConfig, type RuntimeConfig } from "../config";
import { pool } from "../db";
import { adminAuth } from "./index";

export const PRIVATE_PREVIEW_EMAIL = "private-preview@morphiume.invalid";
const origin = "http://192.168.240.51";
const schema = z.object({
  version: z.literal(1), origin: z.literal(origin), email: z.literal(PRIVATE_PREVIEW_EMAIL),
  userId: z.uuid(), password: z.string().min(32).max(256),
  totpURI: z.string().max(1024).refine(value => {
    try { const uri = new URL(value); return uri.protocol === "otpauth:" && uri.hostname === "totp" && /^[A-Z2-7]{16,128}$/.test(uri.searchParams.get("secret") ?? ""); }
    catch { return false; }
  }),
}).strict();
export type PrivatePreviewConfig = z.infer<typeof schema>;
const unavailable = () => new CommerceError("CONFIGURATION", "دسترسی پیش‌نمایش آماده نیست. دوباره تلاش کنید.", 503);

// This is an operator-installed capability, never a request/header/env switch.
// Ignore it on restores and other origins BEFORE reading it: backups preserve
// the encrypted media tree, but cannot activate this private-IP exception there.
export async function readPrivatePreviewConfig(settings: RuntimeConfig = getConfig()): Promise<PrivatePreviewConfig | null> {
  if (settings.DEPLOYMENT_ENV !== "staging" || settings.APP_BASE_URL !== origin || settings.PAYMENT_PROVIDER !== "mock" || settings.SMS_PROVIDER !== "mock") return null;
  const root = path.resolve(settings.MEDIA_ROOT), directory = path.join(root, ".private-preview-access"), file = path.join(directory, "config.json");
  try {
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || await realpath(directory) !== path.join(await realpath(root), ".private-preview-access")) throw unavailable();
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat(), entry = await lstat(file);
      if (!info.isFile() || entry.isSymbolicLink() || info.nlink !== 1 || info.ino !== entry.ino || info.size > 4096) throw unavailable();
      if (process.platform !== "win32" && (parent.uid !== process.getuid!() || info.uid !== process.getuid!() || (parent.mode & 0o777) !== 0o700 || (info.mode & 0o777) !== 0o600)) throw unavailable();
      return schema.parse(JSON.parse(await handle.readFile("utf8")));
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw unavailable(); // Do not expose a credential, native response or path.
  }
}

export async function isPrivatePreviewEnabled() { return !!await readPrivatePreviewConfig(); }

type Lease = { fingerprint: string; cookies: Map<string, string>; refreshed: number; sessionId?: string };
let lease: Lease | undefined;
let pending: Promise<Headers> | undefined;
function headersFor(value: Lease) { return new Headers({ cookie: [...value.cookies].map(([key, item]) => `${key}=${item}`).join("; ") }); }
async function native(value: Lease, call: (headers: Headers) => Promise<Response>) {
  const headers = headersFor(value); headers.set("Origin", origin); headers.set("Content-Type", "application/json");
  // Use the maintained server API: its real hooks/grants and global mutation
  // quota still apply, without consuming a human's public per-IP login quota.
  const response = await call(headers);
  if (!response.ok) throw unavailable();
  for (const line of response.headers.getSetCookie()) {
    const pair = line.split(";", 1)[0]!, offset = pair.indexOf("="), name = pair.slice(0, offset), item = pair.slice(offset + 1);
    if (!item || /max-age=0(?:;|$)/i.test(line)) value.cookies.delete(name); else value.cookies.set(name, item);
  }
}

// The native session, TOTP and grant are real, and stay ONLY in server memory.
// Domain transactions still validate the same fresh role/session/grant joins.
// No owner identity, browser cookie, MFA claim or finance guard is fabricated.
export async function privatePreviewHeaders(): Promise<Headers | null> {
  const config = await readPrivatePreviewConfig();
  if (!config) { lease = undefined; return null; }
  const fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  if (pending) { await pending; return privatePreviewHeaders(); }
  if (lease?.fingerprint === fingerprint && Date.now() - lease.refreshed < 120000) return headersFor(lease);
  const renew = async () => {
    const next: Lease = lease?.fingerprint === fingerprint ? { ...lease, cookies: new Map(lease.cookies) } : { fingerprint, cookies: new Map<string, string>(), refreshed: 0 };
    try {
      // Inspect before native getSession removes expired rows. Only a still
      // present, genuinely expired session with its original proof can renew.
      // Missing/revoked sessions, factors, roles and disabled users fail closed.
      if (next.refreshed) {
        const current = await pool.query<{ expired: boolean }>(
          `SELECT s.expires_at<=clock_timestamp() AS expired FROM session s
           JOIN "user" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id
           WHERE s.id=$1 AND u.id=$2 AND u.email=$3 AND NOT u.disabled AND u.two_factor_enabled
           AND EXISTS(SELECT 1 FROM role_membership r WHERE r.user_id=u.id)`,
          [next.sessionId, config.userId, PRIVATE_PREVIEW_EMAIL]);
        if (!current.rowCount) throw unavailable();
        if (current.rows[0]!.expired) { next.cookies = new Map(); next.refreshed = 0; }
        else if (!await adminAuth.api.getSession({ headers: headersFor(next) })) throw unavailable();
      }
      if (!next.refreshed) await native(next, headers => adminAuth.api.signInEmail({ headers, body: { email: config.email, password: config.password }, asResponse: true }));
      const { code } = await adminAuth.api.generateTOTP({ body: { secret: new URL(config.totpURI).searchParams.get("secret")! } });
      await native(next, headers => adminAuth.api.verifyTOTP({ headers, body: { code, trustDevice: false }, asResponse: true }));
      const proof = await adminAuth.api.getSession({ headers: headersFor(next) });
      if (!proof || proof.user.id !== config.userId || proof.user.email !== PRIVATE_PREVIEW_EMAIL || !proof.user.twoFactorEnabled) throw unavailable();
      next.refreshed = Date.now(); next.sessionId = proof.session.id; lease = next;
      return headersFor(next);
    } catch { throw unavailable(); }
  };
  pending = renew();
  try { return await pending; } finally { pending = undefined; }
}
