-- F2: Tenant RLS baseline — company_id policies for ERP tables + drop dev/open bypasses.
-- Uses tenant_company_ids_for_auth_user() (employee email + app.company_id + profiles).

CREATE OR REPLACE FUNCTION public.tenant_company_ids_for_auth_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cid
  FROM (
    SELECT NULLIF(trim(current_setting('app.company_id', true)), '')::uuid AS cid
    UNION ALL
    SELECT e.company_id
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    UNION ALL
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id IS NOT NULL
  ) scoped
  WHERE cid IS NOT NULL;
$$;

COMMENT ON FUNCTION public.tenant_company_ids_for_auth_user() IS
  'All company IDs the signed-in user may access — for tenant RLS policies.';

GRANT EXECUTE ON FUNCTION public.tenant_company_ids_for_auth_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_company_ids_for_auth_user() TO service_role;

-- ─── Drop legacy dev / open bypass policies ───────────────────────────────────

DROP POLICY IF EXISTS "Dev_Bypass_Comp" ON public.companies;
DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.companies;

DROP POLICY IF EXISTS "Dev_Bypass_Emp" ON public.employees;
DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.employees;

DROP POLICY IF EXISTS "Dev_Bypass_MD" ON public.md_settings;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.md_settings;
DROP POLICY IF EXISTS "Allow authenticated update" ON public.md_settings;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.md_settings;

DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.attendance_logs;
DROP POLICY IF EXISTS "Allow authenticated read logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.attendance_logs;
DROP POLICY IF EXISTS "Enable dev inserts" ON public.attendance_logs;
DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.attendance_anomalies;

DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.payslips;
DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.salary_advances;
DROP POLICY IF EXISTS "Enable read and write for all users during dev" ON public.shift_approvals;

DROP POLICY IF EXISTS "Enable insert for all during dev" ON public.audit_logs;
DROP POLICY IF EXISTS "Enable read for all during dev" ON public.audit_logs;
DROP POLICY IF EXISTS "Enable insert for all during dev" ON public.executive_audit_logs;
DROP POLICY IF EXISTS "Enable read for all during dev" ON public.executive_audit_logs;

DROP POLICY IF EXISTS authenticated_read_shadow_roster_slots ON public.shadow_roster_slots;
DROP POLICY IF EXISTS authenticated_write_shadow_roster_slots ON public.shadow_roster_slots;

DROP POLICY IF EXISTS authenticated_read_fleet_active_trips ON public.fleet_active_trips;
DROP POLICY IF EXISTS authenticated_write_fleet_active_trips ON public.fleet_active_trips;
DROP POLICY IF EXISTS authenticated_read_fleet_assets ON public.fleet_assets;
DROP POLICY IF EXISTS authenticated_write_fleet_assets ON public.fleet_assets;
DROP POLICY IF EXISTS authenticated_read_fleet_flagged_trips ON public.fleet_flagged_trips;
DROP POLICY IF EXISTS authenticated_write_fleet_flagged_trips ON public.fleet_flagged_trips;
DROP POLICY IF EXISTS authenticated_read_fleet_route_history ON public.fleet_route_history;
DROP POLICY IF EXISTS authenticated_write_fleet_route_history ON public.fleet_route_history;
DROP POLICY IF EXISTS authenticated_read_fleet_telematics_pings ON public.fleet_telematics_pings;
DROP POLICY IF EXISTS authenticated_write_fleet_telematics_pings ON public.fleet_telematics_pings;

DROP POLICY IF EXISTS "Enable Read/Write for company users on site_profiles" ON public.site_profiles;
DROP POLICY IF EXISTS "Enable demo SM read assigned sites" ON public.site_profiles;
DROP POLICY IF EXISTS "Enable Read/Write for company users on guard_sector_assignments" ON public.guard_sector_assignments;
DROP POLICY IF EXISTS "Enable Read/Write for company users on payroll_deductions" ON public.payroll_deductions;

DROP POLICY IF EXISTS "Allow authenticated selects" ON public.time_rosters;
DROP POLICY IF EXISTS "Allow authenticated inserts" ON public.time_rosters;
DROP POLICY IF EXISTS "Admins can do everything with rosters" ON public.time_rosters;
DROP POLICY IF EXISTS "Allow users to read locations" ON public.locations;

DROP POLICY IF EXISTS tenant_isolation_recovery_plans ON public.discrepancy_recovery_plans;

-- Broken company_users_* policies (users.company_id column does not exist)
DROP POLICY IF EXISTS company_users_meal_suppliers ON public.meal_suppliers;
DROP POLICY IF EXISTS company_users_site_meal_supplier_assignments ON public.site_meal_supplier_assignments;
DROP POLICY IF EXISTS company_users_payroll_monthly_deduction_entries ON public.payroll_monthly_deduction_entries;
DROP POLICY IF EXISTS company_users_payroll_deduction_month_locks ON public.payroll_deduction_month_locks;
DROP POLICY IF EXISTS company_users_uniform_suppliers ON public.uniform_suppliers;
DROP POLICY IF EXISTS company_users_uniform_stock_items ON public.uniform_stock_items;
DROP POLICY IF EXISTS company_users_uniform_vo_stock ON public.uniform_vo_stock;
DROP POLICY IF EXISTS company_users_fm_employee_deduction_plans ON public.fm_employee_deduction_plans;

-- ─── Standard tenant SELECT + write for company_id tables ─────────────────────

DO $tenant_rls$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'ar_invoices',
    'ar_ledger_snapshots',
    'ar_tax_invoice_sequences',
    'attendance_anomalies',
    'attendance_logs',
    'billing_clients',
    'cafe_customer_orders',
    'cafe_customers',
    'cafe_dashboard_snapshots',
    'cafe_leave_requests',
    'cafe_locations',
    'cafe_master_layouts',
    'cafe_menu_categories',
    'cafe_menu_change_requests',
    'cafe_menu_items',
    'cafe_order_prep_stats',
    'cafe_pos_voids',
    'cafe_prep_items',
    'cafe_staff_checkins',
    'cafe_staff_day_logs',
    'cafe_staff_periods',
    'cafe_stock_counts',
    'cafe_stock_items',
    'cafe_task_completions',
    'cafe_task_templates',
    'discrepancy_recovery_plans',
    'employees',
    'expense_bills',
    'fleet_active_trips',
    'fleet_assets',
    'fleet_flagged_trips',
    'fleet_route_history',
    'fleet_telematics_pings',
    'fm_employee_deduction_plans',
    'fm_payroll_earnings_adjustments',
    'fm_shift_adjustments',
    'guard_blacklist_vault',
    'guard_sector_assignments',
    'meal_suppliers',
    'md_settings',
    'payroll_deduction_month_locks',
    'payroll_deductions',
    'payroll_monthly_deduction_entries',
    'payroll_runs',
    'payslips',
    'portal_security_notifications',
    'ranks',
    'rostered_shifts',
    'salary_advances',
    'shadow_roster_slots',
    'shalom_bookings',
    'shalom_properties',
    'shift_approvals',
    'site_meal_supplier_assignments',
    'site_profiles',
    'site_staff_assignments',
    'uniform_stock_items',
    'uniform_suppliers',
    'uniform_vo_stock'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = tbl
        AND c.column_name = 'company_id'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_write_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_write_%I ON public.%I FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))',
      tbl, tbl
    );
  END LOOP;
END
$tenant_rls$;

-- FM portal: read own SaaS platform invoices (Forge still manages via service_role).
DROP POLICY IF EXISTS tenant_fm_read_saas_platform_invoices ON public.saas_platform_invoices;
CREATE POLICY tenant_fm_read_saas_platform_invoices
  ON public.saas_platform_invoices
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

-- Tenant public website editor (settings + Forge audit via service_role).
DROP POLICY IF EXISTS tenant_read_public_sites ON public.tenant_public_sites;
DROP POLICY IF EXISTS tenant_write_public_sites ON public.tenant_public_sites;
CREATE POLICY tenant_read_public_sites
  ON public.tenant_public_sites
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));
CREATE POLICY tenant_write_public_sites
  ON public.tenant_public_sites
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

-- Security marketing leads — staff read/update own tenant queue.
DROP POLICY IF EXISTS service_role_security_website_leads ON public.security_website_leads;
DROP POLICY IF EXISTS tenant_read_security_website_leads ON public.security_website_leads;
DROP POLICY IF EXISTS tenant_write_security_website_leads ON public.security_website_leads;

CREATE POLICY service_role_security_website_leads
  ON public.security_website_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tenant_read_security_website_leads
  ON public.security_website_leads
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY tenant_write_security_website_leads
  ON public.security_website_leads
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));
