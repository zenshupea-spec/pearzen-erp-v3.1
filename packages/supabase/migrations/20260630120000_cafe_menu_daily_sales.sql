-- Per-menu-item daily sales for weekday velocity (last 3 same weekdays + sold-out boost).

CREATE TABLE IF NOT EXISTS public.cafe_menu_daily_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.cafe_menu_items(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  units_sold int NOT NULL DEFAULT 0 CHECK (units_sold >= 0),
  sold_out boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, menu_item_id, sale_date)
);

CREATE INDEX IF NOT EXISTS idx_cafe_menu_daily_sales_lookup
  ON public.cafe_menu_daily_sales (company_id, menu_item_id, sale_date DESC);

COMMENT ON TABLE public.cafe_menu_daily_sales IS
  'Daily POS units per menu item — weekday velocity uses last 3 same weekdays.';

ALTER TABLE public.cafe_menu_daily_sales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_menu_daily_sales
    ON public.cafe_menu_daily_sales
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tenant_cafe_menu_daily_sales
    ON public.cafe_menu_daily_sales
    FOR ALL
    TO authenticated
    USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
    WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
