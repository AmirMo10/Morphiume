-- Legacy messages remain customer-owned with unknown event/order linkage.
ALTER TABLE notification_message
  ADD COLUMN audience text NOT NULL DEFAULT 'customer' CHECK (audience IN ('customer', 'operator')),
  ADD COLUMN kind text NOT NULL DEFAULT 'legacy.order_update' CHECK (kind IN (
    'legacy.order_update', 'order.created', 'payment.verified', 'shipment.shipped', 'shipment.delivered',
    'request.cancel', 'request.return', 'request.approved', 'request.rejected', 'request.received', 'request.closed',
    'refund.pending', 'refund.completed', 'refund.failed', 'payment.inventory_exception', 'payment.extra_receipt'
  )),
  ADD COLUMN order_id uuid REFERENCES orders(id),
  ADD COLUMN source_event_id uuid REFERENCES order_event(id),
  ADD COLUMN required_permission text CHECK (required_permission IN ('orders.fulfill', 'refunds.write')),
  ADD CONSTRAINT notification_audience_permission CHECK (
    (audience = 'customer' AND required_permission IS NULL)
    OR (audience = 'operator' AND required_permission IS NOT NULL)
  ),
  ADD CONSTRAINT notification_source_link CHECK (
    (kind = 'legacy.order_update' AND audience = 'customer' AND order_id IS NULL AND source_event_id IS NULL)
    OR (kind <> 'legacy.order_update' AND order_id IS NOT NULL AND source_event_id IS NOT NULL)
  ),
  ADD CONSTRAINT notification_v2_text_bounds CHECK (
    kind = 'legacy.order_update' OR (char_length(title) BETWEEN 1 AND 160 AND char_length(body) BETWEEN 1 AND 500)
  ),
  ADD CONSTRAINT notification_operator_kind CHECK (
    audience <> 'operator'
    OR (required_permission = 'orders.fulfill' AND kind IN ('request.cancel', 'request.return', 'request.approved', 'request.rejected', 'request.received', 'request.closed'))
    OR (required_permission = 'refunds.write' AND kind IN ('refund.pending', 'refund.completed', 'refund.failed', 'payment.inventory_exception', 'payment.extra_receipt'))
  );
CREATE UNIQUE INDEX notification_source_recipient_idx ON notification_message(source_event_id, audience, user_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX notification_audience_feed_idx ON notification_message(user_id, audience, created_at DESC, id DESC);
CREATE INDEX notification_audience_unread_idx ON notification_message(user_id, audience, created_at DESC, id DESC) WHERE read_at IS NULL;
-- No message/history rewrite, historical producer backfill or worker activation.
