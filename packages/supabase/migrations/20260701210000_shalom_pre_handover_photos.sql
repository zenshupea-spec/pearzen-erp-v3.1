-- Shalom caretaker pre-handover condition photos (MD audit + FO upload).

ALTER TABLE shalom_bookings
  ADD COLUMN IF NOT EXISTS pre_handover_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pre_handover_verified_at timestamptz;

COMMENT ON COLUMN shalom_bookings.pre_handover_photos IS
  'Caretaker room condition photos before guest arrival — ShalomPreHandoverPhoto[] jsonb';

COMMENT ON COLUMN shalom_bookings.pre_handover_verified_at IS
  'When caretaker completed pre-handover photo upload; NULL until first photo saved';
