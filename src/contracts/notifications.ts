import type { PageDto } from "./commerce";

export type NotificationAudience = "customer" | "operator";
export type NotificationKind = "legacy.order_update" | "order.created" | "payment.verified"
  | "shipment.shipped" | "shipment.delivered" | "request.cancel" | "request.return"
  | "request.approved" | "request.rejected" | "request.received" | "request.closed"
  | "refund.pending" | "refund.completed" | "refund.failed"
  | "payment.inventory_exception" | "payment.extra_receipt";
export type NotificationRequiredPermission = "orders.fulfill" | "refunds.write";
export type NotificationPageInput = { page?: number; pageSize?: number; unreadOnly?: boolean };
export type InAppNotificationDto = {
  id: string; kind: NotificationKind; title: string; body: string; orderId: string | null;
  createdAt: string; readAt: string | null;
};
export type NotificationPageDto = PageDto<InAppNotificationDto> & { unreadCount: string };
export type NotificationEventInput = { eventId: string; orderId: string };
// A processed event is not external delivery, a read receipt or a marketing opt-in.
export type NotificationDispatchDto = {
  outcome: "ignored" | "processed"; insertedMessages: number; currentRecipients: number;
};
