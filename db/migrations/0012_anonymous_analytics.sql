-- Anonymous, advisory observations only. No customer, financial or catalog FK.
CREATE TABLE analytics_seen (
  event_id uuid PRIMARY KEY,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL
);
CREATE INDEX analytics_seen_expiry_idx ON analytics_seen(expires_at, event_id);

CREATE TABLE analytics_daily (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('product_view', 'search', 'add_to_cart')),
  dimension text NOT NULL,
  count bigint NOT NULL CHECK (count >= 0),
  first_accepted_at timestamptz NOT NULL,
  last_accepted_at timestamptz NOT NULL CHECK (last_accepted_at >= first_accepted_at),
  product_dimensions_truncated boolean NOT NULL DEFAULT false,
  PRIMARY KEY (day, kind, dimension),
  CHECK (
    dimension = 'all'
    OR (kind IN ('product_view', 'add_to_cart') AND dimension ~ '^p:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    OR (kind = 'search' AND dimension ~ '^q[01]:(zero|1_10|11_100|over_100)$')
  ),
  CHECK (NOT product_dimensions_truncated OR (dimension = 'all' AND kind IN ('product_view', 'add_to_cart'))),
  CHECK (day = (first_accepted_at AT TIME ZONE 'Asia/Tehran')::date),
  CHECK (day = (last_accepted_at AT TIME ZONE 'Asia/Tehran')::date)
);
CREATE INDEX analytics_daily_report_idx ON analytics_daily(day, kind)
  WHERE dimension = 'all' OR (kind = 'search' AND dimension IN ('q0:zero', 'q1:zero'));
CREATE INDEX analytics_daily_product_dimensions_idx ON analytics_daily(day, dimension) WHERE dimension LIKE 'p:%';

CREATE TABLE analytics_quota (
  minute timestamptz PRIMARY KEY CHECK (minute = date_trunc('minute', minute)),
  count integer NOT NULL CHECK (count BETWEEN 1 AND 2000)
);

CREATE TABLE analytics_coverage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  started_at timestamptz,
  last_cleanup_at timestamptz
);
-- A migration is not activation or evidence of a captured event.
INSERT INTO analytics_coverage(singleton) VALUES (true);
