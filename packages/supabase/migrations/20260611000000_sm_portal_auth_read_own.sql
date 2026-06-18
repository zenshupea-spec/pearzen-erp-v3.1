-- Let authenticated sector managers read their own sm_portal_auth row (PIN setup flag, etc.).

create policy "sm_read_own_auth"
  on sm_portal_auth for select
  using (
    epf_number = upper(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1))
  );
