CREATE TABLE "user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false,
  image text, phone_number text UNIQUE, phone_number_verified boolean NOT NULL DEFAULT false,
  two_factor_enabled boolean NOT NULL DEFAULT false, disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session (
  id text PRIMARY KEY, token text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, ip_address text, user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_user_idx ON session(user_id);
CREATE TABLE account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz,
  scope text, password text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id,account_id)
);
CREATE TABLE verification (
  id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE two_factor (
  id text PRIMARY KEY, user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE, secret text NOT NULL, backup_codes text NOT NULL,
  verified boolean NOT NULL DEFAULT false, failed_verification_count integer NOT NULL DEFAULT 0, locked_until timestamptz
);
CREATE TABLE role_membership (
  user_id text NOT NULL REFERENCES "user"(id), role text NOT NULL CHECK(role IN ('owner','product_manager','fulfillment','support','finance')), PRIMARY KEY(user_id,role)
);
CREATE TABLE admin_grant (
  session_id text PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE, factor_verified_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE TABLE otp_challenge (
  id uuid PRIMARY KEY, phone_number text NOT NULL, code_digest text NOT NULL, purpose text NOT NULL DEFAULT 'customer_login',
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0), max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), last_sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_idx ON otp_challenge(phone_number,created_at DESC);
CREATE TABLE product (
  id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
  concentration text NOT NULL DEFAULT '', family text NOT NULL DEFAULT '', top_notes jsonb NOT NULL DEFAULT '[]', heart_notes jsonb NOT NULL DEFAULT '[]', base_notes jsonb NOT NULL DEFAULT '[]',
  image_url text, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), search_key text NOT NULL DEFAULT ''
);
CREATE INDEX product_search_idx ON product USING gin(to_tsvector('simple',search_key));
CREATE TABLE variant (
  id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES product(id), sku text NOT NULL UNIQUE, volume_ml integer NOT NULL CHECK(volume_ml > 0 AND volume_ml <= 5000),
  price_irr bigint NOT NULL CHECK(price_irr > 0 AND price_irr <= 1000000000 AND price_irr % 10 = 0), active boolean NOT NULL DEFAULT true
);
CREATE TABLE inventory_balance (
  variant_id uuid PRIMARY KEY REFERENCES variant(id), on_hand integer NOT NULL DEFAULT 0 CHECK(on_hand >= 0), reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand)
);
CREATE TABLE cart (
  id uuid PRIMARY KEY, guest_token_digest text NOT NULL UNIQUE, user_id text REFERENCES "user"(id), version integer NOT NULL DEFAULT 1, coupon_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cart_item (
  cart_id uuid NOT NULL REFERENCES cart(id) ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES variant(id), quantity integer NOT NULL CHECK(quantity > 0 AND quantity <= 20), PRIMARY KEY(cart_id,variant_id)
);
CREATE TABLE address (
  id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id), data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
  id uuid PRIMARY KEY, order_number text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES "user"(id),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN ('awaiting_payment','confirmed','payment_exception','cancelled','completed')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','partially_refunded','refunded','failed','unknown')),
  subtotal_irr bigint NOT NULL CHECK(subtotal_irr >= 0), discount_irr bigint NOT NULL CHECK(discount_irr >= 0), shipping_irr bigint NOT NULL CHECK(shipping_irr >= 0), tax_irr bigint NOT NULL CHECK(tax_irr >= 0),
  total_irr bigint NOT NULL CHECK(total_irr > 0 AND total_irr <= 1000000000 AND total_irr % 10 = 0),
  CHECK(total_irr = subtotal_irr - discount_irr + shipping_irr + tax_irr), CHECK(discount_irr <= subtotal_irr),
  address_snapshot jsonb NOT NULL, policy_version text NOT NULL, shipping_method_id text NOT NULL, coupon_code text,
  committed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders(user_id,created_at DESC);
CREATE TABLE order_item (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), variant_id uuid NOT NULL REFERENCES variant(id),
  name text NOT NULL, sku text NOT NULL, volume_ml integer NOT NULL, quantity integer NOT NULL CHECK(quantity > 0), unit_price_irr bigint NOT NULL CHECK(unit_price_irr > 0),
  line_total_irr bigint NOT NULL CHECK(line_total_irr = quantity * unit_price_irr)
);
CREATE TABLE inventory_reservation (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), variant_id uuid NOT NULL REFERENCES variant(id), quantity integer NOT NULL CHECK(quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released')), expires_at timestamptz NOT NULL, UNIQUE(order_id,variant_id)
);
CREATE INDEX reservation_expiry_idx ON inventory_reservation(expires_at) WHERE status = 'active';
CREATE TABLE inventory_ledger (
  id uuid PRIMARY KEY, variant_id uuid NOT NULL REFERENCES variant(id), order_id uuid REFERENCES orders(id), operation_key text NOT NULL UNIQUE,
  on_hand_delta integer NOT NULL, reserved_delta integer NOT NULL, reason text NOT NULL, actor_id text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE payment_attempt (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL CHECK(provider IN ('mock','zarinpal')), merchant_key text NOT NULL,
  authority text, amount_irr bigint NOT NULL CHECK(amount_irr > 0), currency text NOT NULL DEFAULT 'IRR' CHECK(currency='IRR'),
  status text NOT NULL DEFAULT 'created' CHECK(status IN ('created','pending','unknown','succeeded','failed')), redirect_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,merchant_key,authority)
);
CREATE TABLE payment_receipt (
  id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES payment_attempt(id), order_id uuid NOT NULL REFERENCES orders(id), provider text NOT NULL, merchant_key text NOT NULL,
  provider_ref text NOT NULL, amount_irr bigint NOT NULL CHECK(amount_irr > 0), currency text NOT NULL CHECK(currency='IRR'),
  disposition text NOT NULL CHECK(disposition IN ('primary','extra','inventory_exception')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,merchant_key,provider_ref)
);
CREATE UNIQUE INDEX primary_receipt_order_idx ON payment_receipt(order_id) WHERE disposition='primary';
CREATE TABLE payment_event (
  id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES payment_attempt(id), event_key text NOT NULL UNIQUE, type text NOT NULL, code text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE mock_provider_transaction (
  authority text PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE REFERENCES payment_attempt(id), amount_irr bigint NOT NULL, status text NOT NULL DEFAULT 'pending', provider_ref text UNIQUE, verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipment (
  id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES orders(id), status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','shipped','delivered','cancelled')),
  carrier text, tracking_code text, shipped_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_event (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), event_key text NOT NULL UNIQUE, type text NOT NULL, actor_id text REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE checkout_idempotency (
  user_id text NOT NULL REFERENCES "user"(id), operation text NOT NULL, key text NOT NULL, fingerprint text NOT NULL, order_id uuid REFERENCES orders(id), attempt_id uuid REFERENCES payment_attempt(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,operation,key)
);
CREATE TABLE coupon (
  code text PRIMARY KEY, basis_points integer NOT NULL CHECK(basis_points BETWEEN 1 AND 10000), usage_limit integer NOT NULL CHECK(usage_limit>0), per_user_limit integer NOT NULL DEFAULT 1 CHECK(per_user_limit>0),
  minimum_irr bigint NOT NULL DEFAULT 0 CHECK(minimum_irr>=0), expires_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT true
);
CREATE TABLE coupon_redemption (
  id uuid PRIMARY KEY, coupon_code text NOT NULL REFERENCES coupon(code), user_id text NOT NULL REFERENCES "user"(id), order_id uuid NOT NULL UNIQUE REFERENCES orders(id), status text NOT NULL CHECK(status IN ('reserved','consumed','released')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE return_request (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), user_id text NOT NULL REFERENCES "user"(id), kind text NOT NULL CHECK(kind IN ('cancel','return')),
  reason text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','received','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX active_return_order_idx ON return_request(order_id) WHERE status IN ('pending','approved','received');
CREATE TABLE refund (
  id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES orders(id), receipt_id uuid NOT NULL REFERENCES payment_receipt(id), amount_irr bigint NOT NULL CHECK(amount_irr>0 AND amount_irr%10=0),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','succeeded','failed')), reason text NOT NULL, evidence text, operation_key text NOT NULL UNIQUE, actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_job (
  id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, type text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','dead')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_until timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_available_idx ON outbox_job(available_at) WHERE status IN ('pending','running');
CREATE TABLE audit_event (
  id uuid PRIMARY KEY, actor_id text REFERENCES "user"(id), action text NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wishlist_item (user_id text NOT NULL REFERENCES "user"(id), product_id uuid NOT NULL REFERENCES product(id), PRIMARY KEY(user_id,product_id));
CREATE TABLE content_page (slug text PRIMARY KEY, title text NOT NULL, body text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
