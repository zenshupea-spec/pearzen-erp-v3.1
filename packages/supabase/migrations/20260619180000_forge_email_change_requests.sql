-- Secure Forge operator email changes (main, recovery, sign-in).

create table if not exists forge_email_change_requests (
  id uuid primary key default gen_random_uuid(),
  operator_email text not null,
  field text not null check (field in ('main', 'recovery', 'sign_in')),
  new_email text not null,
  code_hash text not null,
  old_code_hash text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists forge_email_change_pending_idx
  on forge_email_change_requests (operator_email, field, created_at desc)
  where consumed_at is null;

alter table forge_email_change_requests enable row level security;

create policy "service_role_all_forge_email_change_requests"
  on forge_email_change_requests for all
  using (auth.role() = 'service_role');
