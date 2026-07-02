-- Allow partners to create portfolio links and read linked tenant company rows.

DROP POLICY IF EXISTS partner_insert_portfolio ON public.forge_partner_portfolios;

CREATE POLICY partner_insert_portfolio
  ON public.forge_partner_portfolios FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS partner_read_portfolio_companies ON public.companies;

CREATE POLICY partner_read_portfolio_companies
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT fp.company_id
      FROM public.forge_partner_portfolios fp
      INNER JOIN public.forge_service_partners p ON p.id = fp.partner_id
      WHERE p.user_id = auth.uid()
    )
  );
