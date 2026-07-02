-- Guest listing: bathroom count shown on shalom.pearzen.tech property pages.

ALTER TABLE shalom_properties
  ADD COLUMN IF NOT EXISTS public_bathrooms int NOT NULL DEFAULT 1 CHECK (public_bathrooms >= 0);

COMMENT ON COLUMN shalom_properties.public_bathrooms IS
  'Number of bathrooms shown on the public guest listing page';
