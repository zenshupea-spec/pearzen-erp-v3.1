-- MD Portal: assign one OM per Sector Manager portfolio (CV Operations SectorTile).
-- Spec: CVS_MD_SECTOR_OM_ASSIGNMENT_STEPS.txt (Step 02).
-- Key: sm_epf = canonical SM EPF (sectorManagerEpfKey), not geographic sector name.

CREATE TABLE IF NOT EXISTS public.sector_om_assignments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies (id) ON DELETE CASCADE,
  sm_epf                  text NOT NULL,
  om_employee_id          uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  assigned_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  assigned_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sm_epf)
);

CREATE INDEX IF NOT EXISTS idx_sector_om_assignments_om
  ON public.sector_om_assignments (company_id, om_employee_id);

CREATE INDEX IF NOT EXISTS idx_sector_om_assignments_sm_epf
  ON public.sector_om_assignments (company_id, sm_epf);

COMMENT ON TABLE public.sector_om_assignments IS
  'MD/OD assignment of an OM-ranked employee to a Sector Manager portfolio (field-radar sector card).';

COMMENT ON COLUMN public.sector_om_assignments.sm_epf IS
  'Canonical SM key (sectorManagerEpfKey): emp_number uppercase, else epf_no, else epf_num.';

COMMENT ON COLUMN public.sector_om_assignments.om_employee_id IS
  'Active Head Office employee with rank OM — scoped to guards/SMs on this portfolio only.';

ALTER TABLE public.sector_om_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_sector_om_assignments
    ON public.sector_om_assignments
    FOR ALL
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
