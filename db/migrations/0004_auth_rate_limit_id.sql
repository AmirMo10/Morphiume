-- Better Auth 1.7.7 database limiter requires its own id PK and unique key.
-- Existing key/count/timestamp records remain intact, and raw key UPSERTs get an id default.
ALTER TABLE auth_rate_limit ADD COLUMN id text NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE auth_rate_limit DROP CONSTRAINT auth_rate_limit_pkey;
ALTER TABLE auth_rate_limit ADD PRIMARY KEY(id);
ALTER TABLE auth_rate_limit ADD CONSTRAINT auth_rate_limit_key_unique UNIQUE(key);
