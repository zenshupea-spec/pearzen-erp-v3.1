-- G1: Custom software milestone billing — linked to forge_product_purchases.

CREATE TABLE IF NOT EXISTS public.forge_project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.forge_product_purchases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  amount_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount_lkr >= 0),
  due_date date,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid', 'skipped')),
  invoice_id uuid REFERENCES public.forge_product_invoices(id) ON DELETE SET NULL,
  invoiced_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_project_milestones_purchase_idx
  ON public.forge_project_milestones (purchase_id, sort_order ASC);

CREATE INDEX IF NOT EXISTS forge_project_milestones_status_idx
  ON public.forge_project_milestones (purchase_id, status);

COMMENT ON TABLE public.forge_project_milestones IS
  'Milestone schedule for custom_software purchases — each row invoices separately via Forge commerce.';

ALTER TABLE public.forge_project_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_forge_project_milestones ON public.forge_project_milestones;

CREATE POLICY service_role_all_forge_project_milestones
  ON public.forge_project_milestones
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
