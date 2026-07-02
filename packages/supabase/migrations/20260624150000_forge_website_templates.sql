-- SaaS Forge — ready-made website templates for web managers to launch client sites.

CREATE TABLE IF NOT EXISTS public.forge_website_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  description text,
  site_type public.tenant_public_site_type NOT NULL,
  vertical text NOT NULL DEFAULT 'general',
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_website_templates_gallery_idx
  ON public.forge_website_templates (is_active, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS forge_website_templates_site_type_idx
  ON public.forge_website_templates (site_type, is_active);

COMMENT ON TABLE public.forge_website_templates IS
  'Pearzen starter website blueprints — copied into tenant_public_sites when a web manager launches a client site.';

COMMENT ON COLUMN public.forge_website_templates.vertical IS
  'Gallery grouping: general, cafe, retail, salon, security, hospitality, etc.';

COMMENT ON COLUMN public.forge_website_templates.content_json IS
  'Default copy for tenant_public_sites.content_json (shape depends on site_type).';

ALTER TABLE public.forge_website_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_forge_website_templates ON public.forge_website_templates;

CREATE POLICY service_role_forge_website_templates
  ON public.forge_website_templates FOR ALL
  USING (auth.role() = 'service_role');

-- Starter gallery — idempotent on slug.
INSERT INTO public.forge_website_templates (
  slug,
  name,
  tagline,
  description,
  site_type,
  vertical,
  content_json,
  sort_order,
  is_active,
  is_featured
)
VALUES
  (
    'pro-landing',
    'Professional landing',
    'Services & contact',
    'Clean hero, about section, and contact block for local professional services.',
    'landing',
    'general',
    jsonb_build_object(
      'companyName', 'Your company',
      'tagline', 'Trusted local professionals',
      'heroHeadline', 'Quality service your neighbours recommend',
      'heroSubheadline',
      'Replace this copy with your client brand. Publish when DNS and contact details are ready.',
      'heroCtaLabel', 'Contact us',
      'heroCtaHref', 'mailto:hello@example.com',
      'aboutTitle', 'About us',
      'aboutBody',
      'Tell visitors who you are, what you do, and why clients choose you. Keep it short and friendly.',
      'contactEmail', 'hello@example.com',
      'contactPhone', '+94 11 000 0000'
    ),
    10,
    true,
    true
  ),
  (
    'cafe-landing',
    'Café & restaurant',
    'Hospitality landing',
    'Warm landing page for cafés, bakeries, and small restaurants.',
    'landing',
    'cafe',
    jsonb_build_object(
      'companyName', 'Your café',
      'tagline', 'Fresh coffee & bites',
      'heroHeadline', 'Your neighbourhood spot for coffee and comfort food',
      'heroSubheadline',
      'Highlight signature drinks, opening hours, and dine-in or takeaway options.',
      'heroCtaLabel', 'View menu',
      'heroCtaHref', '#menu',
      'aboutTitle', 'Our story',
      'aboutBody',
      'Share how the café started, sourcing, and what makes your menu special.',
      'contactEmail', 'orders@example.com',
      'contactPhone', '+94 11 000 0000'
    ),
    20,
    true,
    true
  ),
  (
    'retail-landing',
    'Retail shop',
    'Product-led landing',
    'Showcase a retail or boutique brand with hero copy and contact.',
    'landing',
    'retail',
    jsonb_build_object(
      'companyName', 'Your shop',
      'tagline', 'Curated for you',
      'heroHeadline', 'Discover what is new in store this week',
      'heroSubheadline',
      'Promote collections, delivery options, and how customers can reach you.',
      'heroCtaLabel', 'Shop with us',
      'heroCtaHref', 'mailto:shop@example.com',
      'aboutTitle', 'Why shop here',
      'aboutBody',
      'Describe product categories, quality, and any delivery or pickup options.',
      'contactEmail', 'shop@example.com',
      'contactPhone', '+94 11 000 0000'
    ),
    30,
    true,
    false
  ),
  (
    'salon-landing',
    'Salon & beauty',
    'Appointment-ready landing',
    'Landing page for salons, barbers, and beauty studios.',
    'landing',
    'salon',
    jsonb_build_object(
      'companyName', 'Your salon',
      'tagline', 'Look and feel your best',
      'heroHeadline', 'Book your next appointment in minutes',
      'heroSubheadline',
      'List signature services, stylists, and how clients can book or walk in.',
      'heroCtaLabel', 'Book now',
      'heroCtaHref', 'tel:+94110000000',
      'aboutTitle', 'Our studio',
      'aboutBody',
      'Introduce your team, hygiene standards, and popular treatments.',
      'contactEmail', 'book@example.com',
      'contactPhone', '+94 11 000 0000'
    ),
    40,
    true,
    false
  ),
  (
    'cafe-menu-link',
    'Café menu link card',
    'QR / PEARS menu',
    'Single-page link card that points customers to the online menu PWA.',
    'menu',
    'cafe',
    jsonb_build_object(
      'title', 'Order online',
      'tagline', 'Browse our full menu on your phone',
      'menuUrl', 'https://example.com/menu',
      'notice', 'Point the menu custom domain at the client PWA deploy, then publish this link card.'
    ),
    50,
    true,
    true
  ),
  (
    'security-marketing',
    'Security company',
    'Full marketing site',
    'Brochure-style security marketing site — merges with platform defaults on publish.',
    'security_marketing',
    'security',
    jsonb_build_object(
      'companyName', 'Your security company',
      'tagline', 'Licensed protection you can trust',
      'heroHeadline', 'Professional security for your site',
      'heroSubheadline',
      'Uniformed officers, supervisor visits, and client-visible proof of attendance.',
      'heroCtaPrimary', 'Request a site assessment',
      'heroCtaSecondary', 'Our services'
    ),
    60,
    true,
    true
  )
ON CONFLICT (slug) DO NOTHING;
