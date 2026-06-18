-- Master vault PIN for executive soft-lock unlock (4-digit, MFA-gated updates)

alter table md_settings
  add column if not exists vault_pin_hash text;

comment on column md_settings.vault_pin_hash is
  'PBKDF2 hash of the 4-digit master vault PIN used to resume idle/manual soft-lock';
