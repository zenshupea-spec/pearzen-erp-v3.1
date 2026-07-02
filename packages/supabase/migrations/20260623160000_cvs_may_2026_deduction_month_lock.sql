-- R-OPS-01: HQ deductions month lock for Classic Venture Security May 2026 payroll submit gate.

insert into payroll_deduction_month_locks (company_id, payroll_month, locked_at)
values (
  '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid,
  '2026-05-01'::date,
  now()
)
on conflict (company_id, payroll_month) do nothing;
