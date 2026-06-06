-- Per-section audit trail for MNR drawer edits (personal, employment, bank, vetting)
alter table employees
  add column if not exists section_edits jsonb not null default '{}'::jsonb;
