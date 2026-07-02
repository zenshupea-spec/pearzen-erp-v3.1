-- Pending MD/OD recovery email changes (TOTP step-up + OTP to new inbox).

CREATE TABLE IF NOT EXISTS public.head_office_recovery_email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  new_recovery_email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS head_office_recovery_email_change_pending_idx
  ON public.head_office_recovery_email_change_requests (employee_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.head_office_recovery_email_change_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_all_head_office_recovery_email_change_requests"
    ON public.head_office_recovery_email_change_requests FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
