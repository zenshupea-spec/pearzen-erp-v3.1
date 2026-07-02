-- MD/OD recovery email on Head Office portal auth (separate from work email).

ALTER TABLE public.head_office_portal_auth
  ADD COLUMN IF NOT EXISTS recovery_email text,
  ADD COLUMN IF NOT EXISTS recovery_email_verified_at timestamptz;

COMMENT ON COLUMN public.head_office_portal_auth.recovery_email IS
  'Personal recovery inbox for MD/OD — must differ from work_email.';

COMMENT ON COLUMN public.head_office_portal_auth.recovery_email_verified_at IS
  'When recovery_email was last confirmed (OTP step-up in Step 20).';

CREATE UNIQUE INDEX IF NOT EXISTS head_office_portal_auth_recovery_email_key
  ON public.head_office_portal_auth (lower(trim(recovery_email)))
  WHERE recovery_email IS NOT NULL AND trim(recovery_email) <> '';
