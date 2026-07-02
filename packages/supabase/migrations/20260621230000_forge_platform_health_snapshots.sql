-- SaaS Forge — platform health snapshot history (aggregates computed server-side).

CREATE TABLE IF NOT EXISTS public.forge_platform_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL,
  created_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_platform_health_snapshots_captured_idx
  ON public.forge_platform_health_snapshots (captured_at DESC);

ALTER TABLE public.forge_platform_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_forge_platform_health_snapshots
  ON public.forge_platform_health_snapshots FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.forge_platform_health_snapshots IS
  'Point-in-time Forge platform health aggregates — tenants, MRR, overdue invoices, partners, workforce volume.';
