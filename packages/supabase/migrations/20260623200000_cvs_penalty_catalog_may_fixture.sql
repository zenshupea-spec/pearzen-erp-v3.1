-- R-PEN-01: Persist CVS penalty catalog + May 2026 approved Sleeping on Post fixture.

update md_settings
set penalty_catalog = '[
  {"id":"p1","offense":"Sleeping on Post","fine":5000},
  {"id":"p2","offense":"Absence Without Notice","fine":3500},
  {"id":"p3","offense":"Uniform Non-Compliance","fine":1500},
  {"id":"p4","offense":"Mobile Phone Misuse on Duty","fine":2000},
  {"id":"p5","offense":"Abandoning Post","fine":8000},
  {"id":"p6","offense":"Late Reporting (>30 min)","fine":1000},
  {"id":"p7","offense":"Insubordination","fine":6000},
  {"id":"p8","offense":"Failure to Log Patrol Visit","fine":2500}
]'::jsonb
where company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid;

insert into sm_guard_penalties (
  sm_epf,
  guard_epf,
  guard_name,
  penalty_type,
  penalty_catalog_id,
  reason,
  deduction_amount,
  status,
  created_at
)
select
  'SM001',
  '007',
  'DEAN',
  'Sleeping on Post',
  'p1',
  'Disciplinary penalty: Sleeping on Post — LKR 5,000 (guard consent recorded)',
  5000,
  'APPROVED',
  '2026-05-15T10:00:00+00:00'::timestamptz
where not exists (
  select 1
  from sm_guard_penalties
  where guard_epf = '007'
    and status in ('APPROVED', 'APPLIED')
    and deduction_amount = 5000
    and created_at >= '2026-05-01'::timestamptz
    and created_at < '2026-06-01'::timestamptz
);

insert into payroll_deductions (
  company_id,
  guard_id,
  category,
  amount,
  reason,
  applied_month,
  approval_status
)
select
  '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid,
  e.id,
  'DISCIPLINARY',
  5000,
  'sm_penalty:' || p.id::text || '|Sleeping on Post',
  '2026-05-01'::date,
  'APPROVED'
from sm_guard_penalties p
join employees e
  on upper(trim(e.emp_number)) = upper(trim(p.guard_epf))
 and e.company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
where p.guard_epf = '007'
  and p.status = 'APPROVED'
  and p.deduction_amount = 5000
  and p.created_at >= '2026-05-01'::timestamptz
  and p.created_at < '2026-06-01'::timestamptz
  and not exists (
    select 1
    from payroll_deductions d
    where d.company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
      and d.guard_id = e.id
      and d.category = 'DISCIPLINARY'
      and d.applied_month = '2026-05-01'::date
      and d.reason like 'sm_penalty:' || p.id::text || '|%'
  );

-- Recalculate DEAN May 2026 payslip net after 5,000 LKR penalty.
update payslips p
set
  net_pay = p.net_pay - 5000,
  updated_at = now()
from employees e
where p.profile_id = e.id
  and e.company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
  and upper(trim(e.emp_number)) = '007'
  and p.period_year = 2026
  and p.period_month = 5
  and p.net_pay >= 5000;
