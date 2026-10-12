CREATE TABLE product_slug_claim (
  slug text PRIMARY KEY CHECK(length(slug) BETWEEN 1 AND 160 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  product_id uuid NOT NULL REFERENCES product(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_slug_claim_product_idx ON product_slug_claim(product_id);
INSERT INTO product_slug_claim(slug,product_id) SELECT slug,id FROM product;
CREATE TABLE collection_slug_claim (
  slug text PRIMARY KEY CHECK(length(slug) BETWEEN 1 AND 160 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  collection_id uuid NOT NULL REFERENCES collection(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX collection_slug_claim_collection_idx ON collection_slug_claim(collection_id);
INSERT INTO collection_slug_claim(slug,collection_id) SELECT slug,id FROM collection;
ALTER TABLE collection ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION reject_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable domain record' USING ERRCODE='55000'; END $$;
CREATE TRIGGER immutable_product_slug BEFORE UPDATE OR DELETE ON product_slug_claim FOR EACH ROW EXECUTE FUNCTION reject_immutable_record();
CREATE TRIGGER immutable_collection_slug BEFORE UPDATE OR DELETE ON collection_slug_claim FOR EACH ROW EXECUTE FUNCTION reject_immutable_record();

-- Dynamic qualification binds a trigger to its own table schema, including isolated tests.
CREATE FUNCTION claim_product_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;
BEGIN
  IF NEW.slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (TG_OP='INSERT' OR NEW.slug IS DISTINCT FROM OLD.slug) THEN RAISE EXCEPTION 'UUID-shaped slug is reserved for identifiers' USING ERRCODE='22023'; END IF;
  EXECUTE format('INSERT INTO %I.product_slug_claim(slug,product_id) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING',TG_TABLE_SCHEMA) USING NEW.slug,NEW.id;
  EXECUTE format('SELECT product_id FROM %I.product_slug_claim WHERE slug=$1',TG_TABLE_SCHEMA) INTO owner_id USING NEW.slug;
  IF owner_id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Product slug is reserved' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_slug_claim_trigger AFTER INSERT OR UPDATE OF slug ON product FOR EACH ROW EXECUTE FUNCTION claim_product_slug();
CREATE FUNCTION claim_collection_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id uuid;
BEGIN
  IF NEW.slug ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (TG_OP='INSERT' OR NEW.slug IS DISTINCT FROM OLD.slug) THEN RAISE EXCEPTION 'UUID-shaped slug is reserved for identifiers' USING ERRCODE='22023'; END IF;
  EXECUTE format('INSERT INTO %I.collection_slug_claim(slug,collection_id) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING',TG_TABLE_SCHEMA) USING NEW.slug,NEW.id;
  EXECUTE format('SELECT collection_id FROM %I.collection_slug_claim WHERE slug=$1',TG_TABLE_SCHEMA) INTO owner_id USING NEW.slug;
  IF owner_id IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION 'Collection slug is reserved' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER collection_slug_claim_trigger AFTER INSERT OR UPDATE OF slug ON collection FOR EACH ROW EXECUTE FUNCTION claim_collection_slug();
