-- Guest booking rules per property: minimum stay length and advance booking lead time.

ALTER TABLE shalom_properties
  ADD COLUMN IF NOT EXISTS public_min_nights int NOT NULL DEFAULT 1 CHECK (public_min_nights >= 1),
  ADD COLUMN IF NOT EXISTS public_booking_lead_hours int NOT NULL DEFAULT 0 CHECK (public_booking_lead_hours >= 0);

COMMENT ON COLUMN shalom_properties.public_min_nights IS
  'Minimum number of nights for a direct guest booking on shalom.pearzen.tech';

COMMENT ON COLUMN shalom_properties.public_booking_lead_hours IS
  'Hours before check-in (2:00 PM Asia/Colombo) that a guest must complete a booking';
