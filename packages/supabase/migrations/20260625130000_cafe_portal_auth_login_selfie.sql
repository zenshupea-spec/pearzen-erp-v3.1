-- Café front portal: store login face snapshot reference on each successful sign-in.

ALTER TABLE public.cafe_portal_auth
  ADD COLUMN IF NOT EXISTS last_login_selfie_url text;

COMMENT ON COLUMN public.cafe_portal_auth.last_login_selfie_url IS
  'storage:// or URL ref for live face snapshot captured during café front login';
