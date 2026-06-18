-- Per-branch scoping for café operational data (stock, voids, dashboard snapshots).

ALTER TABLE cafe_stock_items
  ADD COLUMN IF NOT EXISTS cafe_location_id uuid REFERENCES cafe_locations(id) ON DELETE CASCADE;

ALTER TABLE cafe_pos_voids
  ADD COLUMN IF NOT EXISTS cafe_location_id uuid REFERENCES cafe_locations(id) ON DELETE CASCADE;

ALTER TABLE cafe_dashboard_snapshots
  ADD COLUMN IF NOT EXISTS cafe_location_id uuid REFERENCES cafe_locations(id) ON DELETE CASCADE;

-- Backfill existing rows to each company's first café location.
UPDATE cafe_stock_items si
SET cafe_location_id = sub.location_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, id AS location_id
  FROM cafe_locations
  ORDER BY company_id, created_at ASC
) sub
WHERE si.company_id = sub.company_id
  AND si.cafe_location_id IS NULL;

UPDATE cafe_pos_voids v
SET cafe_location_id = sub.location_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, id AS location_id
  FROM cafe_locations
  ORDER BY company_id, created_at ASC
) sub
WHERE v.company_id = sub.company_id
  AND v.cafe_location_id IS NULL;

UPDATE cafe_dashboard_snapshots s
SET cafe_location_id = sub.location_id
FROM (
  SELECT DISTINCT ON (company_id) company_id, id AS location_id
  FROM cafe_locations
  ORDER BY company_id, created_at ASC
) sub
WHERE s.company_id = sub.company_id
  AND s.cafe_location_id IS NULL;

ALTER TABLE cafe_dashboard_snapshots DROP CONSTRAINT IF EXISTS cafe_dashboard_snapshots_pkey;
ALTER TABLE cafe_dashboard_snapshots ADD PRIMARY KEY (company_id, cafe_location_id);

CREATE INDEX IF NOT EXISTS idx_cafe_stock_items_location
  ON cafe_stock_items (company_id, cafe_location_id);

CREATE INDEX IF NOT EXISTS idx_cafe_pos_voids_location
  ON cafe_pos_voids (company_id, cafe_location_id);
