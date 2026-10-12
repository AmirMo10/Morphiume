CREATE TABLE refund_failure_decision (
  refund_id uuid PRIMARY KEY REFERENCES refund(id), actor_id text NOT NULL REFERENCES "user"(id),
  operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 8 AND 128),
  fingerprint text NOT NULL, outcome text NOT NULL CHECK(outcome='confirmed_non_transfer'),
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000), evidence text NOT NULL CHECK(length(evidence) BETWEEN 10 AND 1000),
  decided_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_id,operation_key)
);
CREATE TRIGGER immutable_refund_failure_decision BEFORE UPDATE OR DELETE ON refund_failure_decision FOR EACH ROW EXECUTE FUNCTION reject_immutable_record();
