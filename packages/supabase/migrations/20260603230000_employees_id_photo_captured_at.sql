-- When the HR master (MNR) ID photo was captured / uploaded
alter table employees
  add column if not exists id_photo_captured_at timestamptz;
