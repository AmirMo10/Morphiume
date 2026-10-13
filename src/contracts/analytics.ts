import type { ReportPeriod } from "./reports";

// Counts are decimal BIGINT strings. These contracts carry no monetary or personal data.
export type AnalyticsCount = string;
export type BrowserAnalyticsInput =
  | { eventId: string; kind: "product_view"; productId: string }
  | { eventId: string; kind: "add_to_cart"; productId: string }
  | { eventId: string; kind: "search"; hasQuery: boolean; resultBucket: "zero" | "1_10" | "11_100" | "over_100" };
export type AnalyticsCaptureDto = { ok: true };
export type AnalyticsCoverage = {
  captureEnabled: boolean;
  clientCounts: "advisory";
  clientDelivery: "best_effort_unmeasured";
  retentionDays: 30;
  observedFrom: string | null;
  observedTo: string | null;
  retainedFrom: string | null;
  partialRetention: boolean;
  productDimensionsTruncated: boolean;
  lastCleanupUtc: string | null;
  cleanupPending: boolean;
};
export type ObservedAnalyticsPeriodDto = {
  coverage: AnalyticsCoverage;
  observed: { productView: AnalyticsCount; search: AnalyticsCount; addToCart: AnalyticsCount; zeroResultSearch: AnalyticsCount };
};
export type AnalyticsPeriodDto = ObservedAnalyticsPeriodDto & {
  period: ReportPeriod;
  server: { checkoutStarted: AnalyticsCount; verifiedReceipts: AnalyticsCount; primaryPaidOrders: AnalyticsCount; completedOrders: AnalyticsCount };
  cohort: { basis: "orders_started_in_period"; asOf: string; started: AnalyticsCount; primaryPaid: AnalyticsCount; delivered: AnalyticsCount };
};
