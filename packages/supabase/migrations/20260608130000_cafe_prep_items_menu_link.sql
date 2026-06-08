-- Link kitchen prep / display stock rows to sellable menu items only.

ALTER TABLE cafe_prep_items
  ADD COLUMN IF NOT EXISTS menu_item_id uuid REFERENCES cafe_menu_items(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS cafe_prep_items_company_menu_item_uidx
  ON cafe_prep_items (company_id, menu_item_id)
  WHERE menu_item_id IS NOT NULL;

-- Drop orphan demo rows that were never tied to the live menu.
DELETE FROM cafe_prep_items
WHERE menu_item_id IS NULL;
