-- Match vault session admin RPCs to NIC-based portal_auth_email (fallback: work_email).

create or replace function public.list_active_head_office_vault_sessions(p_company_id uuid)
returns table (
  session_id uuid,
  user_id uuid,
  employee_id uuid,
  full_name text,
  rank text,
  work_email text,
  ip text,
  user_agent text,
  last_active_at timestamptz
)
language sql
security definer
set search_path = auth, public
as $$
  select
    s.id as session_id,
    s.user_id,
    e.id as employee_id,
    coalesce(nullif(trim(e.full_name), ''), h.work_email) as full_name,
    coalesce(nullif(trim(e.rank), ''), 'HO') as rank,
    coalesce(h.work_email, e.email) as work_email,
    host(s.ip) as ip,
    s.user_agent,
    coalesce(s.refreshed_at::timestamptz, s.updated_at) as last_active_at
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  join public.head_office_portal_auth h
    on h.is_active = true
   and (
     lower(trim(coalesce(h.portal_auth_email, ''))) = lower(trim(u.email))
     or lower(trim(coalesce(h.work_email, ''))) = lower(trim(u.email))
   )
  join public.employees e on e.id = h.employee_id
  where e.company_id = p_company_id
    and upper(coalesce(e.group, '')) = 'HEAD_OFFICE'
    and (s.not_after is null or s.not_after > now())
    and coalesce(s.user_agent, '') not ilike '%node%'
  order by last_active_at desc;
$$;

create or replace function public.revoke_head_office_vault_session(
  p_session_id uuid,
  p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if not exists (
    select 1
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    join public.head_office_portal_auth h
      on h.is_active = true
     and (
       lower(trim(coalesce(h.portal_auth_email, ''))) = lower(trim(u.email))
       or lower(trim(coalesce(h.work_email, ''))) = lower(trim(u.email))
     )
    join public.employees e on e.id = h.employee_id
    where s.id = p_session_id
      and e.company_id = p_company_id
      and upper(coalesce(e.group, '')) = 'HEAD_OFFICE'
  ) then
    return false;
  end if;

  delete from auth.sessions where id = p_session_id;
  return true;
end;
$$;

create or replace function public.revoke_other_head_office_vault_sessions(
  p_current_session_id uuid,
  p_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  removed integer;
begin
  with doomed as (
    select s.id
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    join public.head_office_portal_auth h
      on h.is_active = true
     and (
       lower(trim(coalesce(h.portal_auth_email, ''))) = lower(trim(u.email))
       or lower(trim(coalesce(h.work_email, ''))) = lower(trim(u.email))
     )
    join public.employees e on e.id = h.employee_id
    where e.company_id = p_company_id
      and upper(coalesce(e.group, '')) = 'HEAD_OFFICE'
      and coalesce(s.user_agent, '') not ilike '%node%'
      and (p_current_session_id is null or s.id <> p_current_session_id)
  )
  delete from auth.sessions s
  using doomed d
  where s.id = d.id;

  get diagnostics removed = row_count;
  return removed;
end;
$$;
