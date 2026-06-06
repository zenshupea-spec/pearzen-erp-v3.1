-- Vault idle auto-lock policy (Executive Settings → Vault PIN Configuration)

alter table md_settings
  add column if not exists vault_auto_lock_enabled boolean not null default true,
  add column if not exists vault_idle_timeout_minutes integer not null default 30
    check (vault_idle_timeout_minutes >= 1 and vault_idle_timeout_minutes <= 60);

comment on column md_settings.vault_auto_lock_enabled is
  'When true, portals soft-lock after vault_idle_timeout_minutes of inactivity';
comment on column md_settings.vault_idle_timeout_minutes is
  'Minutes of inactivity before vault soft-lock (MD Settings)';
