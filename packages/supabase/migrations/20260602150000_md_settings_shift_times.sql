-- Add shift timing columns to md_settings (used by SM PWA confirm window logic)
alter table md_settings
  add column if not exists security_day_start   text default '07:00',
  add column if not exists security_day_end     text default '19:00',
  add column if not exists security_night_start text default '19:00',
  add column if not exists security_night_end   text default '07:00';
