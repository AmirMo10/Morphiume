import "server-only";
import type { Actor, Permission, Role } from "../../contracts/commerce";
import { CommerceError } from "../../contracts/commerce";
import { pool } from "../db";
import { adminAuth, customerAuth } from "./index";
import { ROLE_PERMISSIONS } from "../commerce/permissions";

export async function customerActor(headers: Headers, optional = false): Promise<Actor | undefined> {
  const authSession = await customerAuth.api.getSession({ headers });
  if (!authSession) { if (optional) return undefined; throw new CommerceError("UNAUTHENTICATED", "برای ادامه شمارهٔ همراه را تأیید کنید.", 401); }
  const result = await pool.query("SELECT id FROM \"user\" WHERE id=$1 AND phone_number_verified AND phone_number IS NOT NULL AND NOT disabled", [authSession.user.id]);
  if (!result.rowCount) throw new CommerceError("FORBIDDEN", "این حساب اجازهٔ دسترسی ندارد.", 403);
  return { userId: authSession.user.id, sessionId: authSession.session.id, kind: "customer" };
}

export async function adminSession(headers: Headers) {
  const session = await adminAuth.api.getSession({ headers });
  if (!session) throw new CommerceError("UNAUTHENTICATED", "برای ورود به مدیریت، وارد حساب شوید.", 401);
  const rolesResult = await pool.query<{ role: Role }>("SELECT r.role FROM role_membership r JOIN \"user\" u ON u.id=r.user_id WHERE r.user_id=$1 AND NOT u.disabled", [session.user.id]);
  const roles = rolesResult.rows.map((row) => row.role);
  if (!roles.length) throw new CommerceError("FORBIDDEN", "مجوز مدیریتی ندارید.", 403);
  const grant = await pool.query("SELECT g.session_id FROM admin_grant g JOIN session s ON s.id=g.session_id JOIN \"user\" u ON u.id=s.user_id WHERE g.session_id=$1 AND g.expires_at>now() AND s.expires_at>now() AND u.two_factor_enabled AND NOT u.disabled", [session.session.id]);
  const mfaVerified = Boolean(grant.rowCount);
  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    role: roles[0], roles, mfaRequired: !mfaVerified, mfaVerified,
    permissions: mfaVerified ? [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))] : [],
    actor: { userId: session.user.id, sessionId: session.session.id, kind: "admin" } as Actor,
  };
}

export async function adminActor(headers: Headers, permission?: Permission, freshFactor = false): Promise<Actor> {
  const state = await adminSession(headers);
  if (!state.mfaVerified) throw new CommerceError("FORBIDDEN", "ابتدا تأیید دومرحله‌ای را کامل کنید.", 403);
  if (permission && !state.permissions.includes(permission)) throw new CommerceError("FORBIDDEN", "مجوز این عملیات را ندارید.", 403);
  if (freshFactor) {
    const recent = await pool.query("SELECT session_id FROM admin_grant WHERE session_id=$1 AND factor_verified_at>now()-interval '5 minutes' AND expires_at>now()", [state.actor.sessionId]);
    if (!recent.rowCount) throw new CommerceError("FORBIDDEN", "برای این تغییر حساس، کد دومرحله‌ای تازه را تأیید کنید.", 403);
  }
  return state.actor;
}
