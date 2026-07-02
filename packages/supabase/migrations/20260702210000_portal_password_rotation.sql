-- Portal password / PIN rotation: 60-day expiry + credential history (no reuse of last 5).

ALTER TABLE public.head_office_portal_auth
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.head_office_portal_auth.password_changed_at IS
  'When the permanent portal password was last set or rotated.';
COMMENT ON COLUMN public.head_office_portal_auth.password_expires_at IS
  'Portal access blocked after this time until password is changed (60-day policy).';
COMMENT ON COLUMN public.head_office_portal_auth.must_change_password IS
  'When true, middleware forces /account/change-password before any staff portal route.';

ALTER TABLE public.sm_portal_auth
  ADD COLUMN IF NOT EXISTS pin_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_pin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sm_portal_auth.pin_changed_at IS
  'When the SM portal PIN was last set or rotated.';
COMMENT ON COLUMN public.sm_portal_auth.pin_expires_at IS
  'SM portal access blocked after this time until PIN is changed (60-day policy).';
COMMENT ON COLUMN public.sm_portal_auth.must_change_pin IS
  'When true, SM portal routes redirect to /change-pin before use.';

CREATE TABLE IF NOT EXISTS public.portal_password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  portal_kind text NOT NULL CHECK (portal_kind IN ('head_office', 'sm')),
  credential_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_password_history_employee_kind_created_idx
  ON public.portal_password_history (employee_id, portal_kind, created_at DESC);

COMMENT ON TABLE public.portal_password_history IS
  'Hashed prior portal passwords / SM PINs — used to reject reuse (last 5 per employee + portal_kind).';

ALTER TABLE public.portal_password_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_password_history_service_role ON public.portal_password_history;
CREATE POLICY portal_password_history_service_role
  ON public.portal_password_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Backfill HO staff who already completed password setup.
UPDATE public.head_office_portal_auth
SET
  password_changed_at = COALESCE(
    password_changed_at,
    unlock_code_set_at,
    last_login_at,
    updated_at,
    created_at
  ),
  password_expires_at = COALESCE(
    password_expires_at,
    COALESCE(
      password_changed_at,
      unlock_code_set_at,
      last_login_at,
      updated_at,
      created_at
    ) + interval '60 days'
  )
WHERE needs_pin_setup = false
  AND pin_hash IS NOT NULL;

-- Backfill active SM portal users who already set a PIN.
UPDATE public.sm_portal_auth
SET
  pin_changed_at = COALESCE(
    pin_changed_at,
    last_login_at,
    updated_at,
    created_at
  ),
  pin_expires_at = COALESCE(
    pin_expires_at,
    COALESCE(
      pin_changed_at,
      last_login_at,
      updated_at,
      created_at
    ) + interval '60 days'
  )
WHERE needs_pin_setup = false
  AND is_active = true;
