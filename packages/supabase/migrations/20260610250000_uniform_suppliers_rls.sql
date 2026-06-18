-- RLS for uniform supplier / stock tables (company-scoped via users)

alter table uniform_suppliers enable row level security;
alter table uniform_stock_items enable row level security;
alter table uniform_vo_stock enable row level security;

do $$ begin
  create policy company_users_uniform_suppliers on uniform_suppliers
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
  create policy company_users_uniform_stock_items on uniform_stock_items
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
  create policy company_users_uniform_vo_stock on uniform_vo_stock
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
  create policy service_role_uniform_suppliers on uniform_suppliers
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_uniform_stock_items on uniform_stock_items
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_uniform_vo_stock on uniform_vo_stock
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
