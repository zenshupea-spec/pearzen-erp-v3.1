-- Sector Assignments board: add HR role slot (CVS MNR rank matrix).

ALTER TABLE public.sector_role_assignments
  DROP CONSTRAINT IF EXISTS sector_role_assignments_role_code_check;

ALTER TABLE public.sector_role_assignments
  ADD CONSTRAINT sector_role_assignments_role_code_check
  CHECK (role_code IN ('OM', 'FM', 'HR', 'TM', 'AD', 'EA'));

COMMENT ON COLUMN public.sector_role_assignments.role_code IS
  'Sector role slot: OM (scope-enforced), FM, HR, TM, AD, or EA.';

COMMENT ON TABLE public.sector_role_assignments IS
  'MD/OD sector board: assign OM, FM, HR, TM, AD, or EA per Sector Manager portfolio (sm_epf).';
