-- F3: Forge contact inbox RLS — service_role only (platform operator + inbound webhook).

ALTER TABLE public.forge_contact_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_forge_contact_threads ON public.forge_contact_threads;
DROP POLICY IF EXISTS service_role_all_forge_contact_messages ON public.forge_contact_messages;

CREATE POLICY service_role_all_forge_contact_threads
  ON public.forge_contact_threads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY service_role_all_forge_contact_messages
  ON public.forge_contact_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY service_role_all_forge_contact_threads ON public.forge_contact_threads IS
  'Forge operators and inbound email webhook access contact threads via service_role.';

COMMENT ON POLICY service_role_all_forge_contact_messages ON public.forge_contact_messages IS
  'Forge operators and inbound email webhook access contact messages via service_role.';
