-- Shalom caretaker stay-ops: damages, guest ID document, invoice fields + private storage.

ALTER TABLE shalom_bookings
  ADD COLUMN IF NOT EXISTS damage_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guest_id_document_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_reference text NOT NULL DEFAULT '';

COMMENT ON COLUMN shalom_bookings.damage_items IS
  'Caretaker-recorded damages from MD preset list — ShalomRecordedDamage[] jsonb';

COMMENT ON COLUMN shalom_bookings.guest_id_document_url IS
  'NIC/passport scan — storage://shalom-guest-ids/{company_id}/{booking_id}/{uuid}.jpg';

COMMENT ON COLUMN shalom_bookings.invoice_email IS
  'Guest email address when caretaker sends a stay invoice';

COMMENT ON COLUMN shalom_bookings.invoice_sent_at IS
  'When the stay invoice was last emailed to the guest; NULL until sent';

COMMENT ON COLUMN shalom_bookings.invoice_reference IS
  'Stable invoice reference e.g. SHL-2026-00042 — generated once per booking';

-- Private bucket; uploads via service-role server actions only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('shalom-guest-ids', 'shalom-guest-ids', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id = 'shalom-guest-ids';
