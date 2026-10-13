import "server-only";
import type { Pool } from "pg";
import { CommerceError, type Actor, type Role } from "../contracts/commerce";
import { ROLE_PERMISSIONS } from "./commerce/permissions";

/** Actor comes from native adminActor; both checks use a fresh non-RR DB query. */
export function createAnalyticsAuthorizer(database: Pick<Pool, "query">) {
  return async (actor: Actor) => {
    if (actor.kind !== "admin") throw new CommerceError("FORBIDDEN", "مجوز مشاهدهٔ آمار فعالیت را ندارید.", 403);
    const roles = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter(role => ROLE_PERMISSIONS[role].includes("analytics.read"));
    const allowed = await database.query(`SELECT s.id FROM session s JOIN "user" u ON u.id=s.user_id
      JOIN admin_grant g ON g.session_id=s.id JOIN role_membership r ON r.user_id=u.id
      WHERE s.id=$1 AND u.id=$2 AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp()
        AND NOT u.disabled AND u.two_factor_enabled AND r.role=ANY($3::text[])`, [actor.sessionId, actor.userId, roles]);
    if (!allowed.rowCount) throw new CommerceError("FORBIDDEN", "مجوز مشاهدهٔ آمار فعالیت را ندارید.", 403);
  };
}
