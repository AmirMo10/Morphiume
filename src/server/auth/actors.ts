import "server-only";
import type { Actor, Permission, Role } from "../../contracts/commerce";
import { CommerceError } from "../../contracts/commerce";
import { pool } from "../db";
import { adminAuth, customerAuth } from "./index";
import { ROLE_PERMISSIONS } from "../commerce/permissions";
import { privatePreviewHeaders, PRIVATE_PREVIEW_EMAIL } from "./private-preview";

export async function customerActor(headers: Headers, optional = false): Promise<Actor | undefined> {
  const authSession = await customerAuth.api.getSession({ headers });
  if (!authSession) { if (optional) return undefined; throw new CommerceError("UNAUTHENTICATED", "برای ادامه شمارهٔ همراه را تأیید کنید.", 401); }
  const result = await pool.query("SELECT id FROM \"user\" WHERE id=$1 AND phone_number_verified AND phone_number IS NOT NULL AND NOT disabled", [authSession.user.id]);
  if (!result.rowCount) throw new CommerceError("FORBIDDEN", "این حساب اجازهٔ دسترسی ندارد.", 403);
  return { userId: authSession.user.id, sessionId: authSession.session.id, kind: "customer" };
}

export async function adminSession(headers: Headers) {
  const preview = await privatePreviewHeaders();
  const session = await adminAuth.api.getSession({ headers: preview ?? headers });
  if (!session) throw new CommerceError("UNAUTHENTICATED", "برای ورود به مدیریت، وارد حساب شوید.", 401);
  if (!preview && session.user.email === PRIVATE_PREVIEW_EMAIL) throw new CommerceError("FORBIDDEN", "دسترسی پیش‌نمایش فعال نیست.", 403);
  const rolesResult = await pool.query<{ role: Role }>("SELECT r.role FROM role_membership r JOIN \"user\" u ON u.id=r.user_id WHERE r.user_id=$1 AND NOT u.disabled", [session.user.id]);
  const roles = rolesResult.rows.map((row) => row.role);
  if (!roles.length) throw new CommerceError("FORBIDDEN", "مجوز مدیریتی ندارید.", 403);
  const grant = await pool.query("SELECT g.session_id FROM admin_grant g JOIN session s ON s.id=g.session_id JOIN \"user\" u ON u.id=s.user_id WHERE g.session_id=$1 AND g.expires_at>now() AND s.expires_at>now() AND u.two_factor_enabled AND NOT u.disabled", [session.session.id]);
  const mfaVerified = Boolean(grant.rowCount);
  return {
    accessMode: preview ? "private-preview" as const : "authenticated" as const,
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
    const allowed=(Object.keys(ROLE_PERMISSIONS) as Role[]).filter(role=>!permission || ROLE_PERMISSIONS[role].includes(permission));
    const recent = await pool.query<{factor_fresh:boolean}>('SELECT g.factor_verified_at>clock_timestamp()-interval \'5 minutes\' AS factor_fresh FROM admin_grant g JOIN session s ON s.id=g.session_id JOIN "user" u ON u.id=s.user_id JOIN role_membership r ON r.user_id=u.id WHERE s.id=$1 AND u.id=$2 AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp() AND NOT u.disabled AND u.two_factor_enabled AND r.role=ANY($3::text[])', [state.actor.sessionId,state.actor.userId,allowed]);
    if (!recent.rowCount) throw new CommerceError("FORBIDDEN", "مجوز این عملیات را ندارید.", 403);
    if (!recent.rows[0]!.factor_fresh) throw new CommerceError("MFA_REQUIRED", "برای این عملیات حساس، کد دومرحله‌ای تازه را تأیید کنید.", 403);
  }
  return state.actor;
}
