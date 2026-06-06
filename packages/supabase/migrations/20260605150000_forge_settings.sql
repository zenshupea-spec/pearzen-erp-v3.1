-- SaaS Forge platform-operator allowlist (editable after login via /forge/settings)

CREATE TABLE IF NOT EXISTS forge_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  operator_emails text[] NOT NULL DEFAULT ARRAY['zenshupea@gmail.com', 'shauvvvv@gmail.com']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO forge_settings (singleton, operator_emails)
VALUES (true, ARRAY['zenshupea@gmail.com', 'shauvvvv@gmail.com'])
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE forge_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_forge_settings"
  ON forge_settings FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE forge_settings IS
  'Singleton row holding Google emails allowed to access SaaS Forge (/login/forge)';
