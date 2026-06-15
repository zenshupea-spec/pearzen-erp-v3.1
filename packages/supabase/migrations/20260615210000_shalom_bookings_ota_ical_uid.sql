-- Track OTA iCal imports for idempotent sync (Airbnb / Booking.com)

ALTER TABLE shalom_bookings
  ADD COLUMN IF NOT EXISTS ota_ical_uid text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ota_imported boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS shalom_bookings_property_ota_uid_idx
  ON shalom_bookings (property_id, ota_ical_uid)
  WHERE ota_ical_uid <> '';

COMMENT ON COLUMN shalom_bookings.ota_ical_uid IS 'Stable UID from OTA iCal VEVENT — used for import upserts';
COMMENT ON COLUMN shalom_bookings.ota_imported IS 'True when row was created/updated by OTA iCal sync';
