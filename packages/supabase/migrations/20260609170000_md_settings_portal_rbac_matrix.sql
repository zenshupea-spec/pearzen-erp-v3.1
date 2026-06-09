-- Per-employee portal permissions for Head Office staff (configured in MD Settings → RBAC).

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS portal_rbac_matrix JSONB;

COMMENT ON COLUMN md_settings.portal_rbac_matrix IS
  'Head Office employee portal access matrix keyed by employees.id';
