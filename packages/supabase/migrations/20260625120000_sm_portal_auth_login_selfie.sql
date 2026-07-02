-- SM portal: store login face snapshot reference on each successful sign-in.

ALTER TABLE public.sm_portal_auth
  ADD COLUMN IF NOT EXISTS last_login_selfie_url text;

COMMENT ON COLUMN public.sm_portal_auth.last_login_selfie_url IS
  'storage:// ref for live face snapshot captured during SM portal login';
