-- R-SM-AUTH-01: OTP hash at rest + restrict authenticated column access.

ALTER TABLE public.sm_portal_auth
  ADD COLUMN IF NOT EXISTS current_otp_hash text;

COMMENT ON COLUMN public.sm_portal_auth.current_otp_hash IS
  'SHA-256(epf:otp:pepper). Plaintext current_otp is deprecated and cleared on provision.';

UPDATE public.sm_portal_auth
SET current_otp = NULL
WHERE current_otp IS NOT NULL;

-- Authenticated SM JWT may read lifecycle flags only — not OTP material.
REVOKE ALL ON TABLE public.sm_portal_auth FROM authenticated;
GRANT SELECT (
  epf_number,
  needs_pin_setup,
  is_active,
  last_login_at,
  created_at,
  updated_at,
  otp_expires_at
) ON public.sm_portal_auth TO authenticated;
