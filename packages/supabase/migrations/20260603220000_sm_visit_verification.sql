-- SM visit selfie capture + OM verification workflow

ALTER TABLE sm_visit_logs
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING', 'APPROVED', 'FLAGGED'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('sm-visit-selfies', 'sm-visit-selfies', true)
ON CONFLICT (id) DO UPDATE SET public = true;
