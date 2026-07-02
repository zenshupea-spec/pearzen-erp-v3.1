-- Pending MD/OD work email changes (TOTP step-up + OTP to work or recovery inbox).

CREATE TABLE IF NOT EXISTS public.head_office_work_email_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  new_work_email text NOT NULL,
  send_otp_to text NOT NULL CHECK (send_otp_to IN ('work', 'recovery')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS head_office_work_email_change_pending_idx
  ON public.head_office_work_email_change_requests (employee_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.head_office_work_email_change_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_all_head_office_work_email_change_requests"
    ON public.head_office_work_email_change_requests FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
