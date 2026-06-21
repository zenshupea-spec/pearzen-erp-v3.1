-- Forge concurrent login challenges (operator_email on portal_pending_logins).

alter table portal_pending_logins
  alter column employee_id drop not null;

alter table portal_pending_logins
  add column if not exists operator_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'portal_pending_logins_subject_check'
  ) then
    alter table portal_pending_logins
      add constraint portal_pending_logins_subject_check
      check (
        employee_id is not null
        or (operator_email is not null and trim(operator_email) <> '')
      );
  end if;
end $$;

create index if not exists portal_pending_logins_operator_pending_idx
  on portal_pending_logins (lower(trim(operator_email)), expires_at desc)
  where status = 'pending' and operator_email is not null;
