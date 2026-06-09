-- Café front check-ins: HR verification queue (GPS + selfie, roster optional).

ALTER TABLE cafe_staff_checkins
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'APPROVED', 'FLAGGED')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS rostered_on_shift boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cafe_staff_checkins_verification_pending
  ON cafe_staff_checkins (company_id, checkin_date, verification_status)
  WHERE verification_status = 'PENDING';
