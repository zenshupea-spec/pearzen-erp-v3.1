-- Shalom MD desk: per-property booking alert email + send-once tracking.

ALTER TABLE public.shalom_properties
  ADD COLUMN IF NOT EXISTS booking_alert_email text;

COMMENT ON COLUMN public.shalom_properties.booking_alert_email IS
  'Instant booking alert recipient for this property (Airbnb, Booking.com, Shalom website).';

ALTER TABLE public.shalom_bookings
  ADD COLUMN IF NOT EXISTS booking_alert_sent_at timestamptz;

COMMENT ON COLUMN public.shalom_bookings.booking_alert_sent_at IS
  'When MD/caretaker booking alert email was sent for this reservation (idempotent).';
