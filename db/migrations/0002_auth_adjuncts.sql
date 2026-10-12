CREATE TABLE verification_challenge (
  phone text PRIMARY KEY CHECK(phone ~ '^\+989[0-9]{9}$'), code_hash text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), window_started_at timestamptz NOT NULL DEFAULT now(),
  resend_after timestamptz NOT NULL, send_count integer NOT NULL DEFAULT 1 CHECK(send_count>=1), last_sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mock_sms_delivery (
  phone text PRIMARY KEY CHECK(phone ~ '^\+989[0-9]{9}$'), ciphertext text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE auth_rate_limit (
  key text PRIMARY KEY, count integer NOT NULL, last_request bigint NOT NULL
);
