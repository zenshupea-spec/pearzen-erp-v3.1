-- OM Guard Cards: permanent blacklist vault until MD approves removal

CREATE TABLE IF NOT EXISTS guard_blacklist_vault (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  employee_id         UUID NOT NULL,
  emp_number          TEXT NOT NULL,
  guard_name          TEXT,
  guard_rank          TEXT,
  reason              TEXT,
  blacklisted_by      UUID,
  blacklisted_by_name TEXT NOT NULL DEFAULT '',
  blacklisted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'REMOVED')),
  removed_at          TIMESTAMPTZ,
  removed_by          UUID,
  removed_by_name     TEXT,
  md_removal_notes    TEXT
);

-- Only one ACTIVE blacklist row per guard per company (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS guard_blacklist_vault_one_active_per_guard
  ON guard_blacklist_vault (company_id, employee_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS guard_blacklist_vault_company_status_idx
  ON guard_blacklist_vault (company_id, status, blacklisted_at DESC);

ALTER TABLE guard_blacklist_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_guard_blacklist_vault"
  ON guard_blacklist_vault FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "authenticated_read_guard_blacklist_vault"
  ON guard_blacklist_vault FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_guard_blacklist_vault"
  ON guard_blacklist_vault FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
