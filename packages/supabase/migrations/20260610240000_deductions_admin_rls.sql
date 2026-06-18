-- RLS for HQ Deductions Admin tables (company-scoped via users)

alter table meal_suppliers enable row level security;
alter table site_meal_supplier_assignments enable row level security;
alter table payroll_monthly_deduction_entries enable row level security;
alter table payroll_deduction_month_locks enable row level security;

do $$ begin
  create policy company_users_meal_suppliers on meal_suppliers
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy company_users_site_meal_supplier_assignments on site_meal_supplier_assignments
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy company_users_payroll_monthly_deduction_entries on payroll_monthly_deduction_entries
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy company_users_payroll_deduction_month_locks on payroll_deduction_month_locks
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_meal_suppliers on meal_suppliers
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_site_meal_supplier_assignments on site_meal_supplier_assignments
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_payroll_monthly_deduction_entries on payroll_monthly_deduction_entries
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_payroll_deduction_month_locks on payroll_deduction_month_locks
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
