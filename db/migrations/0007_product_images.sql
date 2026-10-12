ALTER TABLE variant ADD CONSTRAINT variant_product_id_id_unique UNIQUE(product_id,id);
CREATE TABLE product_image (
  product_id uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK(position BETWEEN 0 AND 9),
  url text NOT NULL,
  alt text NOT NULL CHECK(length(alt) BETWEEN 1 AND 240),
  variant_id uuid,
  media_id uuid REFERENCES media(id),
  PRIMARY KEY(product_id,position),
  FOREIGN KEY(product_id,variant_id) REFERENCES variant(product_id,id),
  CHECK((media_id IS NULL AND url='/assets/sample-perfume.svg') OR (media_id IS NOT NULL AND url='/media/' || media_id::text || '.webp'))
);
CREATE INDEX product_image_variant_idx ON product_image(variant_id) WHERE variant_id IS NOT NULL;
-- Preserve legacy single images as one generic entry only when their media reference is valid.
INSERT INTO product_image(product_id,position,url,alt,media_id)
SELECT p.id,0,p.image_url,p.name,m.id
FROM product p LEFT JOIN media m ON m.public_path=p.image_url AND m.status='ready' AND m.mime_type='image/webp'
WHERE length(p.name) BETWEEN 1 AND 240
  AND (p.image_url='/assets/sample-perfume.svg' OR (m.id IS NOT NULL AND p.image_url='/media/' || m.id::text || '.webp'));
