import "server-only";
import type { Pool, PoolClient } from "pg";
import { CommerceError, type Actor, type Role } from "../../contracts/commerce";
import type { InAppNotificationDto, NotificationAudience, NotificationKind, NotificationPageDto, NotificationPageInput, NotificationRequiredPermission } from "../../contracts/notifications";
import { ROLE_PERMISSIONS } from "./permissions";

type Authority = { permissions: NotificationRequiredPermission[] };
type Row = { id: string; kind: NotificationKind; title: string; body: string; order_id: string | null; created_at: Date; read_at: Date | null; required_permission: NotificationRequiredPermission | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(code: ConstructorParameters<typeof CommerceError>[0], message: string, status: number): never { throw new CommerceError(code, message, status); }
function denied(): never { return fail("FORBIDDEN", "اجازهٔ مشاهدهٔ این اعلان‌ها را ندارید.", 403); }
function missing(): never { return fail("NOT_FOUND", "اعلان پیدا نشد.", 404); }
export function parseNotificationPageInput(input: unknown = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail("VALIDATION", "ورودی فهرست اعلان معتبر نیست.", 400);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== "string" || !["page", "pageSize", "unreadOnly"].includes(key)) || Object.values(descriptors).some(d => !Object.hasOwn(d, "value") || !d.enumerable)) fail("VALIDATION", "ورودی فهرست اعلان معتبر نیست.", 400);
  const page = descriptors.page?.value === undefined ? 1 : descriptors.page.value, pageSize = descriptors.pageSize?.value === undefined ? 25 : descriptors.pageSize.value, unreadOnly = descriptors.unreadOnly?.value === undefined ? false : descriptors.unreadOnly.value;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || typeof unreadOnly !== "boolean") fail("VALIDATION", "ورودی فهرست اعلان معتبر نیست.", 400);
  return { page: page as number, pageSize: pageSize as number, unreadOnly };
}
function validateAudience(audience: NotificationAudience) { if (audience !== "customer" && audience !== "operator") denied(); }
function validateActor(actor: Actor, audience: NotificationAudience) {
  validateAudience(audience);
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.length > 256 || typeof actor.sessionId !== "string" || !actor.sessionId || actor.sessionId.length > 256 || actor.kind !== (audience === "customer" ? "customer" : "admin")) denied();
}
function totalCount(value: string) { const result = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(result)) fail("CONFIGURATION", "تعداد اعلان‌ها در دسترس نیست.", 503); return result; }
function dto(row: Row): InAppNotificationDto { return { id: row.id, kind: row.kind, title: row.title, body: row.body, orderId: row.order_id, createdAt: row.created_at.toISOString(), readAt: row.read_at?.toISOString() ?? null }; }
const columns = "n.id,n.kind,n.title,n.body,n.order_id,n.created_at,n.read_at,n.required_permission";
// Customer order ownership and operator permission are part of every row/count/lock scope.
const scope = `n.user_id=$1 AND n.audience=$2 AND (
  ($2='customer' AND n.required_permission IS NULL AND (n.order_id IS NULL OR EXISTS(SELECT 1 FROM orders o WHERE o.id=n.order_id AND o.user_id=$1)))
  OR ($2='operator' AND n.required_permission=ANY($3::text[])))`;
const adminBase = 'SELECT s.id FROM session s JOIN "user" u ON u.id=s.user_id JOIN admin_grant g ON g.session_id=s.id WHERE s.id=$1 AND u.id=$2 AND NOT u.disabled AND u.two_factor_enabled AND s.expires_at>clock_timestamp() AND g.expires_at>clock_timestamp()';
const customerBase = 'SELECT s.id FROM session s JOIN "user" u ON u.id=s.user_id WHERE s.id=$1 AND u.id=$2 AND NOT u.disabled AND u.phone_number_verified AND u.phone_number ~ $3 AND s.expires_at>clock_timestamp()';

/** Current native Actor is supplied by root; DB scope/proof is independently rechecked here. */
export function createNotificationFeed(options: { pool: Pool }) {
  async function authority(q: PoolClient, actor: Actor, audience: NotificationAudience, lock = false): Promise<Authority> {
    validateActor(actor, audience);
    if (audience === "customer") {
      const values = [actor.sessionId, actor.userId, "^\\+989[0-9]{9}$"];
      if (!(await q.query(customerBase + (lock ? " FOR SHARE OF s,u" : ""), values)).rowCount) fail("UNAUTHENTICATED", "دوباره وارد حساب مشتری شوید.", 401);
      if (lock && !(await q.query(customerBase, values)).rowCount) fail("UNAUTHENTICATED", "دوباره وارد حساب مشتری شوید.", 401);
      return { permissions: [] };
    }
    const values = [actor.sessionId, actor.userId];
    if (!(await q.query(adminBase + (lock ? " FOR SHARE OF s,u,g" : ""), values)).rowCount) denied();
    const roles = (await q.query<{ role: Role }>("SELECT role FROM role_membership WHERE user_id=$1 ORDER BY role" + (lock ? " FOR SHARE" : ""), [actor.userId])).rows;
    const permissions = [...new Set(roles.flatMap(row => ROLE_PERMISSIONS[row.role] ?? []))].filter((value): value is NotificationRequiredPermission => value === "orders.fulfill" || value === "refunds.write");
    // Wall-clock expiry is checked again after all grant/role waits; no five-minute factor age rule.
    if (!(await q.query(adminBase, values)).rowCount) denied();
    return { permissions };
  }
  async function run<T>(work: (q: PoolClient, state: { open: boolean }) => Promise<T>): Promise<T> {
    let q: PoolClient;
    try { q = await options.pool.connect(); } catch { return fail("CONFIGURATION", "اطلاعات اعلان‌ها در دسترس نیست.", 503); }
    const state = { open: false }; let releaseError: Error | undefined;
    try { return await work(q, state); }
    catch (error) {
      if (state.open) try { await q.query("ROLLBACK"); } catch { releaseError = new Error("Notification feed transaction cleanup failed"); }
      if (error instanceof CommerceError) throw error;
      return fail("CONFIGURATION", "اطلاعات اعلان‌ها در دسترس نیست.", 503);
    } finally { q.release(releaseError); }
  }
  async function list(actor: Actor, audience: NotificationAudience, raw: NotificationPageInput): Promise<NotificationPageDto> {
    const input = parseNotificationPageInput(raw); validateActor(actor, audience);
    return run(async (q, state) => {
      const before = await authority(q, actor, audience);
      if (audience === "operator" && !before.permissions.length) denied();
      await q.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); state.open = true;
      await q.query("SET LOCAL lock_timeout = '3s'");
      const values = [actor.userId, audience, before.permissions, input.unreadOnly];
      const counts = (await q.query<{ total: string; unread: string }>(`SELECT count(*) FILTER(WHERE NOT $4::boolean OR n.read_at IS NULL)::text AS total,count(*) FILTER(WHERE n.read_at IS NULL)::text AS unread FROM notification_message n WHERE ${scope}`, values)).rows[0]!;
      const rows = (await q.query<Row>(`SELECT ${columns} FROM notification_message n WHERE ${scope} AND (NOT $4::boolean OR n.read_at IS NULL) ORDER BY n.created_at DESC,n.id DESC LIMIT $5 OFFSET $6`, [...values, input.pageSize, (input.page - 1) * input.pageSize])).rows;
      await q.query("COMMIT"); state.open = false;
      const after = await authority(q, actor, audience); // Outside RR, so revocation cannot remain hidden by the data snapshot.
      if (audience === "operator" && (!after.permissions.length || before.permissions.some(value => !after.permissions.includes(value)))) denied();
      const totalItems = totalCount(counts.total);
      return { items: rows.map(dto), page: input.page, pageSize: input.pageSize, totalItems, totalPages: Math.ceil(totalItems / input.pageSize), unreadCount: counts.unread };
    });
  }
  function listCustomerNotifications(actor: Actor, input: NotificationPageInput = {}) { return list(actor, "customer", input); }
  function listOperatorNotifications(actor: Actor, input: NotificationPageInput = {}) { return list(actor, "operator", input); }
  async function getNotification(actor: Actor, id: string, audience: NotificationAudience): Promise<InAppNotificationDto> {
    validateActor(actor, audience); if (typeof id !== "string" || !uuid.test(id)) missing();
    return run(async q => {
      const before = await authority(q, actor, audience);
      const row = (await q.query<Row>(`SELECT ${columns} FROM notification_message n WHERE ${scope} AND n.id=$4`, [actor.userId, audience, before.permissions, id])).rows[0];
      if (!row) missing();
      const after = await authority(q, actor, audience);
      if (audience === "operator" && (!row.required_permission || !after.permissions.includes(row.required_permission))) missing();
      return dto(row);
    });
  }
  async function markNotificationRead(actor: Actor, id: string, audience: NotificationAudience): Promise<{ id: string; readAt: string }> {
    validateActor(actor, audience); if (typeof id !== "string" || !uuid.test(id)) missing();
    return run(async (q, state) => {
      const before = await authority(q, actor, audience);
      await q.query("BEGIN"); state.open = true; await q.query("SET LOCAL lock_timeout = '3s'");
      const row = (await q.query<Row>(`SELECT ${columns} FROM notification_message n WHERE ${scope} AND n.id=$4 FOR UPDATE OF n`, [actor.userId, audience, before.permissions, id])).rows[0];
      if (!row) missing();
      const current = await authority(q, actor, audience, true);
      if (audience === "operator" && (!row.required_permission || !current.permissions.includes(row.required_permission))) missing();
      const saved = (await q.query<{ id: string; read_at: Date }>("UPDATE notification_message SET read_at=coalesce(read_at,clock_timestamp()) WHERE id=$1 RETURNING id,read_at", [id])).rows[0]!;
      // Session/grant may expire while UPDATE/commit-path I/O runs, even with shared auth row locks.
      const final = await authority(q, actor, audience);
      if (audience === "operator" && (!row.required_permission || !final.permissions.includes(row.required_permission))) missing();
      await q.query("COMMIT"); state.open = false;
      return { id: saved.id, readAt: saved.read_at.toISOString() };
    });
  }
  return { listCustomerNotifications, listOperatorNotifications, getNotification, markNotificationRead };
}
export type NotificationFeed = ReturnType<typeof createNotificationFeed>;
