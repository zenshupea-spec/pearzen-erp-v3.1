-- EPF numbers are assigned once per company and never reused (even after resignation).
-- Rejoining staff receive a new EPF number; prior membership is stored on previous_epf_no.

alter table employees
  add column if not exists previous_epf_no text;

comment on column employees.previous_epf_no is
  'Prior EPF membership number when the same person rejoins with a new EPF (matched via NIC).';

-- Resolve duplicate epf_no rows before applying the unique index (keeps earliest record).
do $$
declare
  dup record;
begin
  for dup in
    select company_id, lower(trim(epf_no)) as epf_key, array_agg(id order by date_joined nulls last, id) as ids
    from employees
    where epf_no is not null and trim(epf_no) <> ''
    group by company_id, lower(trim(epf_no))
    having count(*) > 1
  loop
    update employees
    set epf_no = null
    where id = any (dup.ids[2:array_length(dup.ids, 1)]);
  end loop;
end $$;

create unique index if not exists employees_company_epf_no_unique
  on employees (company_id, lower(trim(epf_no)))
  where epf_no is not null and trim(epf_no) <> '';
