CREATE TABLE return_decision (
  request_id uuid NOT NULL REFERENCES return_request(id),
  target_status text NOT NULL CHECK(target_status IN ('approved','rejected','received','closed')),
  source_status text NOT NULL CHECK(source_status IN ('pending','approved','received')),
  actor_id text NOT NULL REFERENCES "user"(id),
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  restock boolean NOT NULL,
  inventory_effect boolean NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(request_id,target_status),
  CHECK(NOT restock OR target_status='received')
);
CREATE TRIGGER immutable_return_decision BEFORE UPDATE OR DELETE ON return_decision FOR EACH ROW EXECUTE FUNCTION reject_immutable_record();
CREATE INDEX return_stock_history_idx ON inventory_ledger(order_id,variant_id) WHERE on_hand_delta>0;
