export type ReportPeriod = { fromDate: string; toDate: string; timeZone: "Asia/Tehran" };
export type StoreReportDto = {
  period: ReportPeriod;
  cash: { receivedIrr: string; refundedIrr: string; netIrr: string };
  purchases: { primaryOrders: number; primaryReceivedIrr: string; primaryRefundedIrr: string; netPrimaryIrr: string; extraReceivedIrr: string; inventoryExceptionReceivedIrr: string };
  activity: { checkoutStarted: number; paymentVerified: number; orderCompleted: number };
  current: { inventoryUnits: string; activeReservations: string; unresolvedReceiptCount: number; pendingJobs: number; deadJobs: number; undatedSuccessfulRefunds: number };
};
export type ReportWorkQueueDto = {
  receipts: { items: { receiptId: string; orderId: string; attemptId: string; disposition: "extra" | "inventory_exception"; createdAt: string; remainingIrr: string; pendingRefundIrr: string }[]; page: number; pageSize: number; totalItems: number; totalPages: number };
  jobs: { items: { id: string; type: "payment.initialize" | "payment.reconcile" | "domain.other"; status: "pending" | "running" | "dead"; attempts: number; availableAt: string }[]; page: number; pageSize: number; totalItems: number; totalPages: number };
};
