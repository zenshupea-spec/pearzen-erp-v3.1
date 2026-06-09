-- Café Front portal auth state (OTP / PIN lifecycle; Supabase Auth holds password hash).

create table if not exists cafe_portal_auth (
  epf_number      text primary key,
  current_otp     text,
  needs_pin_setup boolean not null default true,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table cafe_portal_auth enable row level security;

create policy "service_role_all_cafe_portal_auth"
  on cafe_portal_auth for all using (auth.role() = 'service_role');

create policy "cafe_staff_read_own_auth"
  on cafe_portal_auth for select
  using (
    epf_number = upper(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1))
  );
