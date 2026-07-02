-- MD Portal Staff Command Center: multi-role sector assignments (Step 04).
-- Spec: MD_PORTAL_STAFF_COMMAND_CENTER_STEPS.txt · sector-role-assignment-spec.ts
-- Generalizes sector_om_assignments — one assignee per role per SM portfolio (sm_epf).

CREATE TABLE IF NOT EXISTS public.sector_role_assignments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  sm_epf                  text NOT NULL,
  role_code               text NOT NULL CHECK (role_code IN ('OM', 'FM', 'TM', 'AD', 'EA')),
  employee_id             uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  assigned_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  assigned_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sm_epf, role_code)
);

CREATE INDEX IF NOT EXISTS idx_sector_role_assignments_company_sm
  ON public.sector_role_assignments (company_id, sm_epf);

CREATE INDEX IF NOT EXISTS idx_sector_role_assignments_company_role_employee
  ON public.sector_role_assignments (company_id, role_code, employee_id);

COMMENT ON TABLE public.sector_role_assignments IS
  'MD/OD sector board: assign OM, FM, TM, AD, or EA per Sector Manager portfolio (sm_epf).';

COMMENT ON COLUMN public.sector_role_assignments.sm_epf IS
  'Canonical SM key (sectorManagerEpfKey): emp_number uppercase, else epf_no, else epf_num.';

COMMENT ON COLUMN public.sector_role_assignments.role_code IS
  'Sector role slot: OM (scope-enforced), FM, TM, AD, or EA.';

COMMENT ON COLUMN public.sector_role_assignments.employee_id IS
  'Active employee whose MNR rank matches role_code for this sector slot.';

-- Backfill existing OM assignments from legacy table.
INSERT INTO public.sector_role_assignments (
  company_id,
  sm_epf,
  role_code,
  employee_id,
  assigned_by_employee_id,
  assigned_at
)
SELECT
  company_id,
  sm_epf,
  'OM',
  om_employee_id,
  assigned_by_employee_id,
  assigned_at
FROM public.sector_om_assignments
ON CONFLICT (company_id, sm_epf, role_code) DO NOTHING;

ALTER TABLE public.sector_role_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_sector_role_assignments
    ON public.sector_role_assignments
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
