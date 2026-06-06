-- Company logo URL (Supabase Storage public URL or data URL) — synced from MD portal settings.

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS company_logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-branding', 'company-branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;
