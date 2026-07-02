-- SaaS Forge — manual disbursements to service partners (cash/bank paid out by Pearzen).

CREATE TABLE IF NOT EXISTS public.forge_partner_disbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.forge_service_partners(id) ON DELETE CASCADE,
  amount_lkr numeric(12, 2) NOT NULL CHECK (amount_lkr > 0),
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text,
  reference text,
  notes text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_partner_disbursements_partner_idx
  ON public.forge_partner_disbursements (partner_id, paid_on DESC, created_at DESC);

COMMENT ON TABLE public.forge_partner_disbursements IS
  'Actual payments Pearzen made to a service partner — distinct from forge_payout_ledger revenue-share accruals.';

COMMENT ON COLUMN public.forge_partner_disbursements.payment_method IS
  'Optional channel label, e.g. bank_transfer, cash.';

ALTER TABLE public.forge_partner_disbursements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_forge_partner_disbursements ON public.forge_partner_disbursements;

CREATE POLICY service_role_forge_partner_disbursements
  ON public.forge_partner_disbursements FOR ALL
  USING (auth.role() = 'service_role');
