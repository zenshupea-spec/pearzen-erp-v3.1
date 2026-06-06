-- Invoice tax rates and supplier letterhead for Tax Invoice Desk
ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS sscl_rate NUMERIC DEFAULT 2.5641,
  ADD COLUMN IF NOT EXISTS invoice_head_office TEXT,
  ADD COLUMN IF NOT EXISTS invoice_telephone TEXT,
  ADD COLUMN IF NOT EXISTS invoice_email TEXT,
  ADD COLUMN IF NOT EXISTS invoice_pv_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_tin TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address TEXT;
