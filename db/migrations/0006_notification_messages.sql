CREATE TABLE notification_message (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id),
  event_key text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_message_user_idx ON notification_message(user_id,created_at DESC);
