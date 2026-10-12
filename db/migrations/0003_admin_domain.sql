ALTER TABLE coupon ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE media (
  id uuid PRIMARY KEY, public_path text NOT NULL UNIQUE, private_object_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')), width integer NOT NULL CHECK(width>0 AND width<=6000), height integer NOT NULL CHECK(height>0 AND height<=6000),
  status text NOT NULL CHECK(status IN ('processing','ready','rejected')), created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE collection (
  id uuid PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE, description text NOT NULL DEFAULT '', published boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1
);
CREATE TABLE collection_product (
  collection_id uuid NOT NULL REFERENCES collection(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES product(id), position integer NOT NULL DEFAULT 0, PRIMARY KEY(collection_id,product_id)
);
CREATE TABLE store_setting (
  key text PRIMARY KEY, value jsonb NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text REFERENCES "user"(id)
);
