import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { CommerceError, type DeploymentEnvironment, type Role } from "../../contracts/commerce";
import type { NotificationAudience, NotificationDispatchDto, NotificationEventInput, NotificationKind, NotificationRequiredPermission } from "../../contracts/notifications";
import { ROLE_PERMISSIONS } from "../commerce/permissions";

export type NotificationTemplate = Readonly<{
  kind: Exclude<NotificationKind, "legacy.order_update">;
  title: string; body: string; operatorPermission?: NotificationRequiredPermission;
}>;
export type NotificationEventDispatcherOptions = { pool: Pool; deploymentEnv: DeploymentEnvironment };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const customerBody = "وضعیت سفارش آزمایشی شما به‌روز شد. جزئیات را در بخش سفارش‌ها ببینید.";
const operatorBody = "یک تغییر آزمایشی برای بررسی ثبت شد. جزئیات را در سفارش و صف‌های مجاز بررسی کنید.";
const titles = new Map<NotificationTemplate["kind"], string>([
  ["order.created", "سفارش آزمایشی ثبت شد."], ["payment.verified", "پرداخت آزمایشی تأیید شد."],
  ["shipment.shipped", "سفارش آزمایشی ارسال شد."], ["shipment.delivered", "سفارش آزمایشی تحویل داده شد."],
  ["request.cancel", "درخواست لغو آزمایشی ثبت شد."], ["request.return", "درخواست مرجوعی آزمایشی ثبت شد."],
  ["request.approved", "بررسی درخواست آزمایشی به‌روز شد."], ["request.rejected", "بررسی درخواست آزمایشی به‌روز شد."],
  ["request.received", "دریافت کالای مرجوعی آزمایشی ثبت شد."], ["request.closed", "درخواست آزمایشی بسته شد."],
  ["refund.pending", "درخواست بازپرداخت آزمایشی ثبت شد."], ["refund.completed", "بازپرداخت آزمایشی ثبت شد."],
  ["refund.failed", "نتیجهٔ بررسی بازپرداخت آزمایشی به‌روز شد."],
  ["payment.inventory_exception", "نتیجهٔ پرداخت آزمایشی نیازمند بررسی است."],
  ["payment.extra_receipt", "نتیجهٔ پرداخت آزمایشی نیازمند بررسی است."],
]);
function validation(): never { throw new CommerceError("VALIDATION", "شناسهٔ رویداد اعلان معتبر نیست."); }
function deliveryFailure(): never { throw new CommerceError("CONFIGURATION", "ثبت اعلان درون‌برنامه‌ای آزمایشی کامل نشد.", 503); }
function overflow(): never { throw new CommerceError("CONFIGURATION", "تعداد گیرندگان اعلان آزمایشی از سقف مجاز بیشتر است؛ بررسی مسئول سامانه لازم است.", 503); }
export function parseNotificationEventInput(input: unknown): NotificationEventInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) validation();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).length !== 2 || Reflect.ownKeys(input).some(key => typeof key !== "string") || Object.values(descriptors).some(d => !Object.hasOwn(d, "value") || !d.enumerable)) validation();
  const eventId: unknown = descriptors.eventId?.value, orderId: unknown = descriptors.orderId?.value;
  if (typeof eventId !== "string" || typeof orderId !== "string" || !uuid.test(eventId) || !uuid.test(orderId)) validation();
  return { eventId: eventId.toLowerCase(), orderId: orderId.toLowerCase() };
}
export function notificationTemplate(type: string): NotificationTemplate | null {
  const kind = type as NotificationTemplate["kind"], title = titles.get(kind);
  if (!title) return null;
  const operatorPermission = kind.startsWith("request.") ? "orders.fulfill" : kind.startsWith("refund.") || kind === "payment.inventory_exception" || kind === "payment.extra_receipt" ? "refunds.write" : undefined;
  return Object.freeze({ kind, title, body: customerBody, ...(operatorPermission ? { operatorPermission } : {}) });
}
export function notificationRecipientRoles(permission: NotificationRequiredPermission): Role[] {
  if (permission !== "orders.fulfill" && permission !== "refunds.write") validation();
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter(role => ROLE_PERMISSIONS[role].includes(permission)).sort();
}
type Message = { id: string; user_id: string; event_key: string; title: string; body: string; audience: NotificationAudience; kind: NotificationTemplate["kind"]; order_id: string; source_event_id: string; required_permission: NotificationRequiredPermission | null };

/** Controlled in-app dispatcher. Business producers, queue cutover and feed guards are separate. */
export function createNotificationEventDispatcher(options: NotificationEventDispatcherOptions) {
  if (options.deploymentEnv !== "test" && options.deploymentEnv !== "staging") throw new CommerceError("CONFIGURATION", "اعلان آزمایشی در محیط واقعی مجاز نیست.", 503);
  async function transaction<T>(work: (q: PoolClient) => Promise<T>): Promise<T> {
    let q: PoolClient;
    try { q = await options.pool.connect(); } catch { return deliveryFailure(); }
    let releaseError: Error | undefined;
    try {
      await q.query("BEGIN"); await q.query("SET LOCAL statement_timeout = '3s'"); await q.query("SET LOCAL lock_timeout = '500ms'");
      const result = await work(q); await q.query("COMMIT"); return result;
    } catch (error) {
      try { await q.query("ROLLBACK"); } catch { releaseError = new Error("Notification transaction cleanup failed"); }
      if (error instanceof CommerceError) throw error;
      return deliveryFailure(); // Never pass a raw DB error/payload to the queue error field.
    } finally { q.release(releaseError); }
  }
  async function dispatchNotificationEvent(raw: NotificationEventInput): Promise<NotificationDispatchDto> {
    const input = parseNotificationEventInput(raw);
    return transaction(async q => {
      // Serialization belongs only to notification delivery, never a financial/event row lock.
      const lock = createHash("sha256").update(input.eventId).digest().readInt32BE(0);
      await q.query("SELECT pg_advisory_xact_lock(818006,$1::integer)", [lock]);
      const event = (await q.query<{ type: string; user_id: string }>("SELECT e.type,o.user_id FROM order_event e JOIN orders o ON o.id=e.order_id WHERE e.id=$1 AND e.order_id=$2", [input.eventId, input.orderId])).rows[0];
      const template = event ? notificationTemplate(event.type) : null;
      if (!event || !template) return { outcome: "ignored", insertedMessages: 0, currentRecipients: 0 };
      let operators: string[] = [];
      if (template.operatorPermission) {
        const roles = notificationRecipientRoles(template.operatorPermission);
        // Sorted shared locks preserve enabled/MFA flags while the batch commits.
        const candidates = (await q.query<{ id: string }>(`SELECT u.id FROM "user" u WHERE NOT u.disabled AND u.two_factor_enabled
          AND EXISTS(SELECT 1 FROM role_membership r WHERE r.user_id=u.id AND r.role=ANY($1::text[]))
          ORDER BY u.id LIMIT 501 FOR SHARE OF u`, [roles])).rows.map(row => row.id);
        if (candidates.length > 500) overflow();
        if (candidates.length) {
          // Read/lock current memberships after any user waits. Revocation before this read removes its recipient.
          const memberships = (await q.query<{ user_id: string }>(`SELECT user_id FROM role_membership WHERE user_id=ANY($1::text[]) AND role=ANY($2::text[])
            ORDER BY user_id,role FOR SHARE`, [candidates, roles])).rows;
          operators = [...new Set(memberships.map(row => row.user_id))].sort();
        }
        const prior = (await q.query<{ user_id: string }>("SELECT user_id FROM notification_message WHERE source_event_id=$1 AND audience='operator' ORDER BY user_id LIMIT 501", [input.eventId])).rows;
        if (new Set([...operators, ...prior.map(row => row.user_id)]).size > 500) overflow();
      }
      const customer = (await q.query<{ id: string }>('SELECT id FROM "user" WHERE id=$1 AND NOT disabled AND phone_number_verified FOR SHARE', [event.user_id])).rows[0];
      const messages: Message[] = [];
      function add(userId: string, audience: NotificationAudience) {
        const eventKey = `notification:v2:${createHash("sha256").update(JSON.stringify([input.eventId, audience, userId])).digest("hex")}`;
        messages.push({ id: randomUUID(), user_id: userId, event_key: eventKey, title: template!.title,
          body: audience === "customer" ? template!.body : operatorBody, audience, kind: template!.kind,
          order_id: input.orderId, source_event_id: input.eventId, required_permission: audience === "operator" ? template!.operatorPermission! : null });
      }
      if (customer) add(customer.id, "customer"); for (const userId of operators) add(userId, "operator");
      if (!messages.length) return { outcome: "processed", insertedMessages: 0, currentRecipients: 0 };
      const inserted = await q.query(`INSERT INTO notification_message(id,user_id,event_key,title,body,audience,kind,order_id,source_event_id,required_permission)
        SELECT id,user_id,event_key,title,body,audience,kind,order_id,source_event_id,required_permission FROM jsonb_to_recordset($1::jsonb)
          AS n(id uuid,user_id text,event_key text,title text,body text,audience text,kind text,order_id uuid,source_event_id uuid,required_permission text)
        ON CONFLICT(event_key) DO NOTHING`, [JSON.stringify(messages)]);
      return { outcome: "processed", insertedMessages: inserted.rowCount ?? 0, currentRecipients: messages.length };
    });
  }
  return { dispatchNotificationEvent };
}
export type NotificationEventDispatcher = ReturnType<typeof createNotificationEventDispatcher>;
