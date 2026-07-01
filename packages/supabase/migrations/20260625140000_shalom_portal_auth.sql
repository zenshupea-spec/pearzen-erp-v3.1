-- Shalom front office portal: auth state, caretaker property links, daily login dots.
--
-- Supabase Auth email namespace: {epf}@shalom.pearzen.local
-- (distinct from guard @pearzen.local, café @pearzen.cafe, SM @pearzen.sm)

-- ─── Portal auth (mirror café/SM lifecycle; OTP hash at rest) ───────────────

CREATE TABLE IF NOT EXISTS public.shalom_portal_auth (
  epf_number            text PRIMARY KEY,
  pin_hash              text,
  current_otp_hash      text,
  otp_expires_at        timestamptz,
  needs_pin_setup       boolean NOT NULL DEFAULT true,
  is_active             boolean NOT NULL DEFAULT true,
  last_login_at         timestamptz,
  last_login_selfie_url text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shalom_portal_auth IS
  'Shalom front office portal auth metadata. Supabase Auth holds login password; OTP hash at rest.';

COMMENT ON COLUMN public.shalom_portal_auth.pin_hash IS
  'Optional bcrypt hash of 6-digit PIN for local verification; Supabase Auth is source of truth for login.';

COMMENT ON COLUMN public.shalom_portal_auth.current_otp_hash IS
  'SHA-256(epf:otp:pepper). HR provisioning only — never store plaintext OTP.';

COMMENT ON COLUMN public.shalom_portal_auth.last_login_selfie_url IS
  'Reserved — Shalom login does not require face capture; column kept for parity with café/SM.';

ALTER TABLE public.shalom_portal_auth ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_shalom_portal_auth ON public.shalom_portal_auth
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── MD desk: primary caretaker per property ────────────────────────────────

ALTER TABLE public.shalom_properties
  ADD COLUMN IF NOT EXISTS caretaker_epf text;

COMMENT ON COLUMN public.shalom_properties.caretaker_epf IS
  'EPF of assigned Shalom caretaker for this property (MD desk dropdown).';

CREATE INDEX IF NOT EXISTS shalom_properties_caretaker_epf_idx
  ON public.shalom_properties (caretaker_epf)
  WHERE caretaker_epf IS NOT NULL;

-- ─── Caretaker ↔ property (one caretaker may cover many properties) ───────

CREATE TABLE IF NOT EXISTS public.shalom_caretaker_property_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epf_number  text NOT NULL,
  property_id uuid NOT NULL REFERENCES public.shalom_properties (id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (epf_number, property_id)
);

CREATE INDEX IF NOT EXISTS shalom_caretaker_assignments_epf_idx
  ON public.shalom_caretaker_property_assignments (epf_number);

CREATE INDEX IF NOT EXISTS shalom_caretaker_assignments_company_idx
  ON public.shalom_caretaker_property_assignments (company_id);

CREATE INDEX IF NOT EXISTS shalom_caretaker_assignments_property_idx
  ON public.shalom_caretaker_property_assignments (property_id);

COMMENT ON TABLE public.shalom_caretaker_property_assignments IS
  'Maps Shalom caretakers (EPF) to one or more rental properties.';

ALTER TABLE public.shalom_caretaker_property_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_shalom_caretaker_assignments
    ON public.shalom_caretaker_property_assignments
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Daily login dots (Asia/Colombo calendar day — app computes login_date) ─

CREATE TABLE IF NOT EXISTS public.shalom_portal_daily_logins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epf_number   text NOT NULL,
  login_date   date NOT NULL,
  company_id   uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  login_count  int NOT NULL DEFAULT 1 CHECK (login_count > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (epf_number, login_date)
);

CREATE INDEX IF NOT EXISTS shalom_portal_daily_logins_company_date_idx
  ON public.shalom_portal_daily_logins (company_id, login_date DESC);

CREATE INDEX IF NOT EXISTS shalom_portal_daily_logins_epf_idx
  ON public.shalom_portal_daily_logins (epf_number, login_date DESC);

COMMENT ON TABLE public.shalom_portal_daily_logins IS
  'One row per caretaker per calendar day (Asia/Colombo). Green dot when login_count >= 1.';

ALTER TABLE public.shalom_portal_daily_logins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_shalom_portal_daily_logins
    ON public.shalom_portal_daily_logins
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
