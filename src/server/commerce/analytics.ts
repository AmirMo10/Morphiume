import "server-only";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AnalyticsCaptureDto, BrowserAnalyticsInput, ObservedAnalyticsPeriodDto } from "../../contracts/analytics";
import { CommerceError } from "../../contracts/commerce";
import type { ReportPeriod } from "../../contracts/reports";

export type AnalyticsQueryable = Pick<PoolClient, "query">;
export type AnalyticsLimits = { globalPerMinute?: number; productDimensionsPerDay?: number };
export type AnalyticsStoreOptions = { pool: Pool; enabled: () => boolean; limits?: AnalyticsLimits };
export type AnalyticsCleanupDto = { seenDeleted: number; quotaDeleted: number; dailyDeleted: number; expiredRowsPending: boolean };
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const acknowledgement: AnalyticsCaptureDto = Object.freeze({ ok: true });
function validation(): never { throw new CommerceError("VALIDATION", "رویداد تحلیلی معتبر نیست."); }
function configuration(): never { throw new CommerceError("CONFIGURATION", "دادهٔ مشاهده‌شدهٔ تحلیلی در دسترس نیست.", 503); }
const iso = (value: Date | string) => new Date(value).toISOString();

/** No coercion, extra keys, nested payloads, accessors, symbols or caller metadata. */
export function parseBrowserAnalyticsInput(input: unknown): BrowserAnalyticsInput {
  if (!input || typeof input !== "object" || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) validation();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(input).some(key => typeof key !== "string") || Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, "value") || !descriptor.enumerable)) validation();
  const value = Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])) as Record<string, unknown>;
  const kind = value.kind, eventId = value.eventId;
  if (typeof eventId !== "string" || !uuidV4.test(eventId)) validation();
  let result: BrowserAnalyticsInput;
  if (kind === "product_view" || kind === "add_to_cart") {
    if (Object.keys(value).length !== 3 || typeof value.productId !== "string" || !uuidV4.test(value.productId)) validation();
    result = { eventId: eventId.toLowerCase(), kind, productId: value.productId.toLowerCase() };
  } else if (kind === "search") {
    if (Object.keys(value).length !== 4 || typeof value.hasQuery !== "boolean" || typeof value.resultBucket !== "string" || !["zero", "1_10", "11_100", "over_100"].includes(value.resultBucket)) validation();
    result = { eventId: eventId.toLowerCase(), kind, hasQuery: value.hasQuery, resultBucket: value.resultBucket as Extract<BrowserAnalyticsInput, { kind: "search" }>["resultBucket"] };
  } else validation();
  // Whitelist above is stricter than this transport budget; HTTP byte enforcement is root-owned.
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > 1024) validation();
  return result;
}

function payloadFingerprint(input: BrowserAnalyticsInput): string {
  const payload = input.kind === "search"
    ? [input.kind, input.hasQuery, input.resultBucket]
    : [input.kind, input.productId];
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
function positiveLimit(value: number | undefined, maximum: number): number {
  const result = value ?? maximum;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) configuration();
  return result;
}
function validatePeriod(period: ReportPeriod, asOfUtc: string) {
  const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!period || period.timeZone !== "Asia/Tehran" || !validDate(period.fromDate) || !validDate(period.toDate) || period.fromDate > period.toDate || (Date.parse(period.toDate) - Date.parse(period.fromDate)) / 86400000 >= 366) validation();
  if (typeof asOfUtc !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(asOfUtc) || !validDate(asOfUtc.slice(0, 10)) || !Number.isFinite(Date.parse(asOfUtc))) validation();
  return iso(asOfUtc);
}

/** Dedicated pool only. The root report combiner supplies its already-open RR client. */
export function createAnalyticsStore(options: AnalyticsStoreOptions) {
  const { pool } = options;
  if (pool.options.max !== 2 || typeof options.enabled !== "function") configuration();
  const quota = positiveLimit(options.limits?.globalPerMinute, 2000);
  const productCap = positiveLimit(options.limits?.productDimensionsPerDay, 10000);
  let active = 0;
  const waiting: { resolve: (granted: boolean) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  function captureEnabled() { const value = options.enabled(); if (typeof value !== "boolean") configuration(); return value; }
  async function admitted<T>(work: () => Promise<T>, dropped: T): Promise<T> {
    if (active >= 2) {
      if (waiting.length >= 50) return dropped;
      const granted = await new Promise<boolean>(resolve => {
        const item = { resolve, timer: setTimeout(() => { const index = waiting.indexOf(item); if (index >= 0) waiting.splice(index, 1); resolve(false); }, 200) };
        waiting.push(item);
      });
      if (!granted) return dropped;
    } else active++;
    try { return await work(); }
    finally {
      const next = waiting.shift();
      if (next) { clearTimeout(next.timer); next.resolve(true); }
      else active--;
    }
  }
  // A timed-out pool acquisition releases a later client instead of leaking it.
  async function connectBounded(): Promise<PoolClient> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const acquired = pool.connect().then(client => { if (expired) { client.release(); throw new Error("Analytics connection wait exceeded"); } return client; });
    try { return await Promise.race([acquired, new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error("Analytics connection wait exceeded")); }, 200); })]); }
    finally { clearTimeout(timer!); }
  }
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await connectBounded();
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '200ms'");
      await client.query("SET LOCAL lock_timeout = '50ms'");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { releaseError = new Error("Analytics transaction cleanup failed"); }
      throw error;
    } finally { client.release(releaseError); }
  }
  type Clock = { at: Date; minute: Date; day: string; ordinal: number; cutoff: string };
  async function clock(q: AnalyticsQueryable): Promise<Clock> {
    return (await q.query<Clock>(`WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)
      SELECT at,date_trunc('minute',at) AS minute,(at AT TIME ZONE 'Asia/Tehran')::date::text AS day,
        (at AT TIME ZONE 'Asia/Tehran')::date - DATE '1970-01-01' AS ordinal,
        ((at AT TIME ZONE 'Asia/Tehran')::date - 29)::text AS cutoff FROM instant`)).rows[0]!;
  }
  async function increment(q: AnalyticsQueryable, now: Clock, kind: BrowserAnalyticsInput["kind"], dimension: string, truncated = false) {
    await q.query(`INSERT INTO analytics_daily(day,kind,dimension,count,first_accepted_at,last_accepted_at,product_dimensions_truncated)
      VALUES($1,$2,$3,1,$4,$4,$5) ON CONFLICT(day,kind,dimension) DO UPDATE
      SET count=analytics_daily.count+1,first_accepted_at=least(analytics_daily.first_accepted_at,EXCLUDED.first_accepted_at),
        last_accepted_at=greatest(analytics_daily.last_accepted_at,EXCLUDED.last_accepted_at),
        product_dimensions_truncated=analytics_daily.product_dimensions_truncated OR EXCLUDED.product_dimensions_truncated`, [now.day, kind, dimension, now.at, truncated]);
  }
  async function captureBrowserEvent(raw: unknown): Promise<AnalyticsCaptureDto> {
    const input = parseBrowserAnalyticsInput(raw);
    try {
      if (!captureEnabled()) return acknowledgement;
      await admitted(() => transaction(async q => {
        const now = await clock(q);
        const allowed = await q.query(`INSERT INTO analytics_quota(minute,count) VALUES($1,1)
          ON CONFLICT(minute) DO UPDATE SET count=analytics_quota.count+1 WHERE analytics_quota.count<$2 RETURNING minute`, [now.minute, quota]);
        if (!allowed.rowCount) return;
        if (input.kind !== "search") {
          // Ordinary MVCC read: no catalog locks, FKs, customer/session or financial dependency.
          const visible = await q.query("SELECT 1 FROM product p WHERE p.id=$1 AND p.status='published' AND EXISTS(SELECT 1 FROM variant v WHERE v.product_id=p.id AND v.active)", [input.productId]);
          if (!visible.rowCount) return;
        }
        const unseen = await q.query(`INSERT INTO analytics_seen(event_id,fingerprint,expires_at) VALUES($1,$2,$3::timestamptz+interval '24 hours')
          ON CONFLICT(event_id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,expires_at=EXCLUDED.expires_at
          WHERE analytics_seen.expires_at<=$3 RETURNING event_id`, [input.eventId, payloadFingerprint(input), now.at]);
        if (!unseen.rowCount) return; // Same or changed unexpired payload receives the identical neutral ack.
        let dimension: string, truncated = false;
        if (input.kind === "search") dimension = `q${input.hasQuery ? 1 : 0}:${input.resultBucket}`;
        else {
          dimension = `p:${input.productId}`;
          // The minute guard alone cannot serialize different minutes at a day boundary.
          await q.query("SELECT pg_advisory_xact_lock(818005,$1::integer)", [now.ordinal]);
          const existing = await q.query("SELECT 1 FROM analytics_daily WHERE day=$1 AND dimension=$2 LIMIT 1", [now.day, dimension]);
          if (!existing.rowCount) {
            const dimensions = (await q.query<{ count: number }>(`SELECT count(*)::integer AS count FROM
              (SELECT DISTINCT dimension FROM analytics_daily WHERE day=$1 AND dimension LIKE 'p:%' LIMIT $2) bounded`, [now.day, productCap + 1])).rows[0]!.count;
            truncated = dimensions >= productCap;
          }
        }
        await increment(q, now, input.kind, "all", truncated);
        if (!truncated) await increment(q, now, input.kind, dimension);
        const coverage = await q.query("UPDATE analytics_coverage SET started_at=least(coalesce(started_at,$1),$1) WHERE singleton", [now.at]);
        if (coverage.rowCount !== 1) configuration();
      }), undefined);
    } catch { /* Advisory capture never changes a commerce result or emits raw failures. */ }
    return acknowledgement;
  }
  async function pending(q: AnalyticsQueryable, asOf: Date | string, cutoff: string): Promise<boolean> {
    return (await q.query<{ pending: boolean }>(`SELECT EXISTS(SELECT 1 FROM analytics_seen WHERE expires_at<=$1)
      OR EXISTS(SELECT 1 FROM analytics_quota WHERE minute<=$1::timestamptz-interval '2 hours')
      OR EXISTS(SELECT 1 FROM analytics_daily WHERE day<$2::date) AS pending`, [asOf, cutoff])).rows[0]!.pending;
  }
  async function getObservedPeriod(q: AnalyticsQueryable, period: ReportPeriod, asOfUtc: string): Promise<ObservedAnalyticsPeriodDto> {
    const asOf = validatePeriod(period, asOfUtc), enabled = captureEnabled();
    type Summary = { views: string; searches: string; additions: string; zero: string; first: Date | null; last: Date | null; truncated: boolean; future: boolean };
    const summary = (await q.query<Summary>(`WITH retained AS (
      SELECT * FROM analytics_daily WHERE day BETWEEN $1::date AND $2::date
        AND day>=($3::timestamptz AT TIME ZONE 'Asia/Tehran')::date-29
        AND (dimension='all' OR (kind='search' AND dimension IN ('q0:zero','q1:zero')))
    ) SELECT coalesce(sum(count) FILTER(WHERE kind='product_view' AND dimension='all'),0)::text AS views,
      coalesce(sum(count) FILTER(WHERE kind='search' AND dimension='all'),0)::text AS searches,
      coalesce(sum(count) FILTER(WHERE kind='add_to_cart' AND dimension='all'),0)::text AS additions,
      coalesce(sum(count) FILTER(WHERE kind='search' AND dimension IN ('q0:zero','q1:zero')),0)::text AS zero,
      min(first_accepted_at) FILTER(WHERE dimension='all') AS first,max(last_accepted_at) FILTER(WHERE dimension='all') AS last,
      coalesce(bool_or(product_dimensions_truncated) FILTER(WHERE dimension='all'),false) AS truncated,
      coalesce(bool_or(last_accepted_at>$3),false) AS future FROM retained`, [period.fromDate, period.toDate, asOf])).rows[0]!;
    type Coverage = { retained: Date | null; cleanup: Date | null; partial: boolean; pending: boolean };
    const coverage = (await q.query<Coverage>(`WITH bounds AS (SELECT
      (($1::timestamptz AT TIME ZONE 'Asia/Tehran')::date-29)::timestamp AT TIME ZONE 'Asia/Tehran' AS cutoff,
      ($1::timestamptz AT TIME ZONE 'Asia/Tehran')::date-29 AS cutoff_day,
      $2::date::timestamp AT TIME ZONE 'Asia/Tehran' AS from_at,($3::date+1)::timestamp AT TIME ZONE 'Asia/Tehran' AS to_at)
      SELECT CASE WHEN c.started_at IS NULL THEN NULL ELSE greatest(c.started_at,b.cutoff) END AS retained,c.last_cleanup_at AS cleanup,
        c.started_at IS NULL OR b.from_at<greatest(c.started_at,b.cutoff) OR b.to_at>$1::timestamptz AS partial,
        EXISTS(SELECT 1 FROM analytics_seen WHERE expires_at<=$1) OR EXISTS(SELECT 1 FROM analytics_quota WHERE minute<=$1::timestamptz-interval '2 hours')
          OR EXISTS(SELECT 1 FROM analytics_daily WHERE day<b.cutoff_day) AS pending
      FROM analytics_coverage c CROSS JOIN bounds b WHERE c.singleton`, [asOf, period.fromDate, period.toDate])).rows[0];
    if (!coverage || summary.future) configuration(); // Caller must use the one RR snapshot acquired at asOf.
    return {
      coverage: { captureEnabled: enabled, clientCounts: "advisory", clientDelivery: "best_effort_unmeasured", retentionDays: 30,
        observedFrom: summary.first ? iso(summary.first) : null, observedTo: summary.last ? iso(summary.last) : null,
        retainedFrom: coverage.retained ? iso(coverage.retained) : null, partialRetention: coverage.partial,
        productDimensionsTruncated: summary.truncated, lastCleanupUtc: coverage.cleanup ? iso(coverage.cleanup) : null, cleanupPending: coverage.pending },
      observed: { productView: summary.views, search: summary.searches, addToCart: summary.additions, zeroResultSearch: summary.zero },
    };
  }
  async function cleanupExpired(batchSize = 500): Promise<AnalyticsCleanupDto> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) validation();
    const dropped = { seenDeleted: 0, quotaDeleted: 0, dailyDeleted: 0, expiredRowsPending: true };
    try {
      return await admitted(() => transaction(async q => {
        const now = await clock(q);
        const seen = await q.query(`WITH expired AS (SELECT event_id FROM analytics_seen WHERE expires_at<=$1 ORDER BY expires_at,event_id LIMIT $2 FOR UPDATE SKIP LOCKED)
          DELETE FROM analytics_seen a USING expired e WHERE a.event_id=e.event_id`, [now.at, batchSize]);
        const quotas = await q.query(`WITH expired AS (SELECT minute FROM analytics_quota WHERE minute<=$1::timestamptz-interval '2 hours' ORDER BY minute LIMIT $2 FOR UPDATE SKIP LOCKED)
          DELETE FROM analytics_quota a USING expired e WHERE a.minute=e.minute`, [now.at, batchSize]);
        const daily = await q.query(`WITH expired AS (SELECT day,kind,dimension FROM analytics_daily WHERE day<$1::date ORDER BY day,kind,dimension LIMIT $2 FOR UPDATE SKIP LOCKED)
          DELETE FROM analytics_daily a USING expired e WHERE a.day=e.day AND a.kind=e.kind AND a.dimension=e.dimension`, [now.cutoff, batchSize]);
        await q.query("UPDATE analytics_coverage SET last_cleanup_at=$1 WHERE singleton", [now.at]);
        return { seenDeleted: seen.rowCount ?? 0, quotaDeleted: quotas.rowCount ?? 0, dailyDeleted: daily.rowCount ?? 0, expiredRowsPending: await pending(q, now.at, now.cutoff) };
      }), dropped);
    } catch { return dropped; }
  }
  return { captureBrowserEvent, getObservedPeriod, cleanupExpired };
}
export type AnalyticsStore = ReturnType<typeof createAnalyticsStore>;
