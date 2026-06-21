-- Pending concurrent login challenges + unlock-code tracking flag.

alter table head_office_portal_auth
  add column if not exists unlock_code_set_at timestamptz;

create table if not exists portal_pending_logins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  challenger_session_id text not null,
  incumbent_session_id text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_pending_logins_employee_pending_idx
  on portal_pending_logins (employee_id, status, expires_at desc)
  where status = 'pending';

alter table portal_pending_logins enable row level security;

create policy "service_role_all_portal_pending_logins"
  on portal_pending_logins for all using (auth.role() = 'service_role');

create or replace function public.count_other_auth_sessions(
  p_user_id uuid,
  p_current_session_id uuid
)
returns integer
language sql
security definer
set search_path = auth, public
as $$
  select count(*)::integer
  from auth.sessions s
  where s.user_id = p_user_id
    and s.id <> p_current_session_id
    and (s.not_after is null or s.not_after > now());
$$;

revoke all on function public.count_other_auth_sessions(uuid, uuid) from public;
grant execute on function public.count_other_auth_sessions(uuid, uuid) to service_role;

create or replace function public.first_other_auth_session_id(
  p_user_id uuid,
  p_current_session_id uuid
)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select s.id
  from auth.sessions s
  where s.user_id = p_user_id
    and s.id <> p_current_session_id
    and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at, s.updated_at) desc
  limit 1;
$$;

revoke all on function public.first_other_auth_session_id(uuid, uuid) from public;
grant execute on function public.first_other_auth_session_id(uuid, uuid) to service_role;

create or replace function public.revoke_auth_session_by_id(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  delete from auth.sessions where id = p_session_id;
  return found;
end;
$$;

revoke all on function public.revoke_auth_session_by_id(uuid) from public;
grant execute on function public.revoke_auth_session_by_id(uuid) to service_role;
