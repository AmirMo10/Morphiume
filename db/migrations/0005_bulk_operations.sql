CREATE TABLE bulk_operation (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL REFERENCES "user"(id),
  operation_key text NOT NULL,
  fingerprint text NOT NULL,
  reason text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,operation_key)
);
