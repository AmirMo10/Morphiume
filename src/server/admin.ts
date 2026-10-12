import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { CommerceError, type Actor } from "@/contracts/commerce";
import { pool } from "./db";
import { adminActor } from "./auth/actors";

const defaults = { brandName: "Morphiume", contactPhone: null, email: null, address: null, shippingDescription: null, policyVersion: "staging-policy-v1", version: 1 };
export async function getSettings() {
  const result = await pool.query("SELECT value,version FROM store_setting WHERE key='public'");
  return result.rows[0] ? { ...defaults, ...result.rows[0].value, brandName: "Morphiume", version: result.rows[0].version } : defaults;
}
export async function saveSettings(actor: Actor, input: unknown) {
  const blank = (value:unknown) => value === "" ? null : value;
  const data = z.object({ brandName: z.literal("Morphiume").optional(), contactPhone: z.preprocess(blank,z.string().max(40).nullable()), email: z.preprocess(blank,z.email().nullable()), address: z.preprocess(blank,z.string().max(1000).nullable()), shippingDescription: z.preprocess(blank,z.string().max(3000).nullable()), policyVersion: z.literal("staging-policy-v1").optional(), expectedVersion: z.number().int().positive() }).strict().parse(input);
  const value = { contactPhone: data.contactPhone, email: data.email, address: data.address, shippingDescription: data.shippingDescription };
  const db = await pool.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT pg_advisory_xact_lock(818001)");
    const prior = await db.query("SELECT version FROM store_setting WHERE key='public' FOR UPDATE");
    if ((prior.rows[0]?.version ?? 1) !== data.expectedVersion) throw new CommerceError("CONFLICT", "تنظیمات تغییر کرده است. دوباره بارگذاری کنید.",409);
    await db.query("INSERT INTO store_setting(key,value,version,updated_by) VALUES('public',$1::jsonb,2,$2) ON CONFLICT(key) DO UPDATE SET value=$1::jsonb,version=store_setting.version+1,updated_at=now(),updated_by=$2",[JSON.stringify(value),actor.userId]);
    await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,'settings.updated','setting','public','تغییر اطلاعات عمومی فروشگاه')",[randomUUID(),actor.userId]);
    await db.query("COMMIT"); return getSettings();
  } catch(error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
const roles = z.array(z.enum(["owner","product_manager","fulfillment","support","finance"])).max(5);
export async function adminDirectory(request: NextRequest, path: string[], method: string, input?: unknown): Promise<unknown> {
  const actor = await adminActor(request.headers, path[1] === "reports" ? "refunds.write" : "roles.write", method !== "GET");
  if (method === "GET" && path[1] === "audit") return (await pool.query("SELECT id,actor_id AS \"actorId\",action,entity_type AS \"entityType\",entity_id AS \"entityId\",reason,created_at AS \"createdAt\" FROM audit_event ORDER BY created_at DESC LIMIT 300")).rows;
  if (method === "GET" && path[1] === "reports") {
    const result = await pool.query("SELECT (SELECT count(*)::int FROM orders WHERE payment_status='paid') AS \"paidOrders\",(SELECT coalesce(sum(amount_irr),0)::text FROM payment_receipt) AS \"receivedIrr\",(SELECT coalesce(sum(amount_irr),0)::text FROM refund WHERE status='succeeded') AS \"refundedIrr\",(SELECT coalesce(sum(on_hand),0)::int FROM inventory_balance) AS \"inventoryUnits\",(SELECT coalesce(sum(reserved),0)::int FROM inventory_balance) AS \"activeReservations\"");
    const row = result.rows[0]; return {...row,netIrr:(BigInt(row.receivedIrr)-BigInt(row.refundedIrr)).toString()};
  }
  if (method === "GET" && ["customers","roles"].includes(path[1]!)) {
    const customers = await pool.query("SELECT u.id,u.name,u.phone_number AS phone,u.disabled,u.created_at AS \"createdAt\",(SELECT count(*)::int FROM orders o WHERE o.user_id=u.id) AS orders FROM \"user\" u WHERE u.phone_number_verified AND NOT EXISTS(SELECT 1 FROM role_membership r WHERE r.user_id=u.id) ORDER BY u.created_at DESC LIMIT 200");
    const staff = await pool.query("SELECT u.id,u.name,u.email,u.disabled,u.two_factor_enabled AS \"mfaEnabled\",array_agg(r.role ORDER BY r.role) AS roles FROM \"user\" u JOIN role_membership r ON r.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC");
    return { customers:customers.rows,staff:staff.rows };
  }
  if (method !== "POST" || path[1] !== "roles") throw new CommerceError("NOT_FOUND","این بخش پیدا نشد.",404);
  const reasonSchema = z.string().trim().min(5).max(1000);
  const invite = path[2] === "invite";
  const data = invite ? z.object({email:z.email().max(200),name:z.string().min(1).max(120),password:z.string().min(14).max(128),roles:roles.min(1),reason:reasonSchema}).strict().parse(input) : z.object({userId:z.string().min(1).max(100),roles,disabled:z.boolean(),reason:reasonSchema}).strict().parse(input);
  const password = invite && "password" in data ? await hashPassword(data.password) : undefined;
  const db = await pool.connect();
  try {
    await db.query("BEGIN"); await db.query("SELECT pg_advisory_xact_lock(818002)");
    const authorization = await db.query("SELECT s.id FROM session s JOIN admin_grant g ON g.session_id=s.id JOIN role_membership r ON r.user_id=s.user_id JOIN \"user\" u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.expires_at>now() AND g.expires_at>now() AND g.factor_verified_at>now()-interval '5 minutes' AND r.role='owner' AND NOT u.disabled AND u.two_factor_enabled",[actor.sessionId,actor.userId]);
    if (!authorization.rowCount) throw new CommerceError("FORBIDDEN","برای این تغییر حساس، ورود و مجوز مالک را دوباره تأیید کنید.",403);
    let userId: string;
    if (invite && "email" in data) {
      userId = randomUUID();
      await db.query('INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',[userId,data.name,data.email.toLowerCase()]);
      await db.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),userId,password]);
    } else if ("userId" in data) {
      userId = data.userId;
      const target = await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[userId]);
      if (!target.rowCount) throw new CommerceError("NOT_FOUND","حساب پیدا نشد.",404);
      const owns = await db.query("SELECT user_id FROM role_membership WHERE user_id=$1 AND role='owner'",[userId]);
      if (owns.rowCount && (data.disabled || !data.roles.includes("owner"))) {
        const remaining = await db.query('SELECT count(*)::int AS count FROM role_membership r JOIN "user" u ON u.id=r.user_id WHERE r.role=\'owner\' AND r.user_id<>$1 AND NOT u.disabled',[userId]);
        if (!remaining.rows[0].count) throw new CommerceError("CONFLICT","آخرین مالک فعال را نمی‌توان غیرفعال کرد.",409);
      }
      await db.query('UPDATE "user" SET disabled=$1,updated_at=now() WHERE id=$2',[data.disabled,userId]);
      await db.query("DELETE FROM session WHERE user_id=$1",[userId]);
    } else throw new Error("Invalid role operation");
    await db.query("DELETE FROM role_membership WHERE user_id=$1",[userId]);
    for (const role of [...new Set(data.roles)]) await db.query("INSERT INTO role_membership(user_id,role) VALUES($1,$2)",[userId,role]);
    await db.query("INSERT INTO audit_event(id,actor_id,action,entity_type,entity_id,reason) VALUES($1,$2,$3,'user',$4,$5)",[randomUUID(),actor.userId,invite?"staff.invited":"roles.updated",userId,data.reason]);
    await db.query("COMMIT"); return { userId, saved:true };
  } catch(error) { await db.query("ROLLBACK"); if ((error as {code?:string}).code === "23505") throw new CommerceError("CONFLICT","این حساب پیش‌تر وجود دارد.",409); throw error; } finally { db.release(); }
}
