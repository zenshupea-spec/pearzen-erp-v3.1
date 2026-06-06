-- Tenant subdomain routing (SaaS Forge)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique
  ON public.companies (slug)
  WHERE slug IS NOT NULL;

-- Backfill Classic Venture (primary seed tenant)
UPDATE public.companies
SET
  slug = 'classic-venture',
  is_suspended = COALESCE(
    is_suspended,
    CASE WHEN is_active = false THEN true ELSE false END
  )
WHERE (
  id = '9111dd55-9935-4e26-a630-60e36dcb57b5'
  OR name ILIKE '%CLASSIC%VENTURE%'
)
AND (slug IS NULL OR slug = '');

-- Slugify any other tenants missing slugs (name-based fallback)
UPDATE public.companies
SET slug = lower(
  regexp_replace(
    regexp_replace(trim(name), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-|-$)',
    '',
    'g'
  )
)
WHERE slug IS NULL
  AND name IS NOT NULL
  AND name <> 'HQ_MASTER_ACCOUNT';
