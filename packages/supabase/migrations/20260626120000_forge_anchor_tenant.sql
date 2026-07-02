-- Pears super-app anchor tenant (defaults to Classic Venture for existing installs).

ALTER TABLE public.forge_settings
  ADD COLUMN IF NOT EXISTS anchor_tenant_id uuid REFERENCES public.companies (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.forge_settings.anchor_tenant_id IS
  'Forge PEARS export anchor company — store profile / inventory examples and seed actions.';

UPDATE public.forge_settings
SET anchor_tenant_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
WHERE singleton = true
  AND anchor_tenant_id IS NULL;
