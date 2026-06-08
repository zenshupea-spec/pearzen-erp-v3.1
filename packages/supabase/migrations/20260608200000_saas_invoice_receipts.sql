-- Payment receipt uploads for Pearzen.tech platform invoices (FM → Forge)

ALTER TABLE saas_platform_invoices
  ADD COLUMN IF NOT EXISTS receipt_storage_path text,
  ADD COLUMN IF NOT EXISTS receipt_file_name text,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_by text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('saas-platform-receipts', 'saas-platform-receipts', true)
ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN saas_platform_invoices.receipt_storage_path IS
  'Supabase storage object path in saas-platform-receipts bucket';
