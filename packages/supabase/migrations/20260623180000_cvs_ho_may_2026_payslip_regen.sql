-- R-HO-01: Recalculate CVS May 2026 HEAD_OFFICE payslips — gross = MNR monthly basic (not guard×20).

with ho_payslips as (
  select
    p.id as payslip_id,
    p.payroll_run_id,
    round(
      coalesce(
        nullif(nullif(trim(coalesce(e.basic_salary::text, '')), '')::numeric, 0),
        nullif(e.base_salary::numeric, 0)
      )
    )::numeric(12, 2) as gross_pay
  from payslips p
  join employees e on e.id = p.profile_id
  where e.company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
    and upper(coalesce(e."group", '')) = 'HEAD_OFFICE'
    and p.company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
    and p.period_year = 2026
    and p.period_month = 5
),
updated as (
  update payslips p
  set
    gross_pay = h.gross_pay,
    adjusted_basic = h.gross_pay,
    epf_employee = round(h.gross_pay * 0.08, 2),
    epf_employer = round(h.gross_pay * 0.12, 2),
    etf = round(h.gross_pay * 0.03, 2),
    net_pay = h.gross_pay
      - round(h.gross_pay * 0.08, 2)
      - case when h.gross_pay >= 30000 then 25 else 0 end,
    updated_at = now()
  from ho_payslips h
  where p.id = h.payslip_id
  returning p.payroll_run_id
),
affected_runs as (
  select distinct payroll_run_id from updated where payroll_run_id is not null
)
update payroll_runs r
set
  gross_total = totals.gross_sum,
  net_total = totals.net_sum,
  updated_at = now()
from (
  select
    p.payroll_run_id,
    coalesce(sum(p.gross_pay), 0) as gross_sum,
    coalesce(sum(p.net_pay), 0) as net_sum
  from payslips p
  join affected_runs ar on ar.payroll_run_id = p.payroll_run_id
  group by p.payroll_run_id
) totals
where r.id = totals.payroll_run_id;
