-- Shalom guest website (shalom.pearzen.tech): public listing fields, direct-booking metadata, property photo storage.

-- ─── Property public listing (MD uploads photos per property → public gallery) ───

ALTER TABLE shalom_properties
  ADD COLUMN IF NOT EXISTS public_slug text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_headline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_hero_image_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS public_gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS public_nightly_rate_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_max_guests int NOT NULL DEFAULT 2 CHECK (public_max_guests >= 1),
  ADD COLUMN IF NOT EXISTS public_amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS public_sort_order int NOT NULL DEFAULT 0;

COMMENT ON COLUMN shalom_properties.public_slug IS
  'URL slug for shalom.pearzen.tech/properties/[slug] — unique per company when set';

COMMENT ON COLUMN shalom_properties.public_published IS
  'When true, property appears on the public guest website';

COMMENT ON COLUMN shalom_properties.public_hero_image_url IS
  'Cover image for cards and OG — storage://shalom-public-media/... or public HTTPS URL';

COMMENT ON COLUMN shalom_properties.public_gallery_urls IS
  'Ordered property photos for guest listing — ShalomPublicPropertyPhoto[] jsonb (MD upload per property)';

COMMENT ON COLUMN shalom_properties.public_amenities IS
  'Amenity label strings shown on the public listing page';

CREATE UNIQUE INDEX IF NOT EXISTS shalom_properties_company_public_slug_key
  ON shalom_properties (company_id, lower(trim(public_slug)))
  WHERE trim(public_slug) <> '';

-- ─── Direct guest bookings (PayHere + contact fields) ───

ALTER TABLE shalom_bookings
  ADD COLUMN IF NOT EXISTS guest_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS guest_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payhere_payment_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS pending_payment_expires_at timestamptz;

COMMENT ON COLUMN shalom_bookings.guest_email IS
  'Guest email from shalom.pearzen.tech direct booking flow';

COMMENT ON COLUMN shalom_bookings.guest_phone IS
  'Guest phone from shalom.pearzen.tech direct booking flow';

COMMENT ON COLUMN shalom_bookings.payhere_payment_id IS
  'PayHere payment_id after successful checkout notify';

COMMENT ON COLUMN shalom_bookings.booking_status IS
  'PENDING_PAYMENT | CONFIRMED | CANCELLED | EXPIRED — legacy OTA rows stay CONFIRMED';

COMMENT ON COLUMN shalom_bookings.pending_payment_expires_at IS
  'When an unpaid PENDING_PAYMENT hold expires (30 min from creation)';

-- Backfill legacy rows before adding check constraint.
UPDATE shalom_bookings
SET booking_status = 'CONFIRMED'
WHERE booking_status IS NULL OR trim(booking_status) = '';

DO $$ BEGIN
  ALTER TABLE shalom_bookings
    ADD CONSTRAINT shalom_bookings_booking_status_check
    CHECK (booking_status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS shalom_bookings_pending_payment_expires_idx
  ON shalom_bookings (pending_payment_expires_at)
  WHERE booking_status = 'PENDING_PAYMENT';

-- ─── Public storage bucket for property listing photos (guest-readable) ───

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shalom-public-media',
  'shalom-public-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

UPDATE storage.buckets
SET public = true
WHERE id = 'shalom-public-media';
