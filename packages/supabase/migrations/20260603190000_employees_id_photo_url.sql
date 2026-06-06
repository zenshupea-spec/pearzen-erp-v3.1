-- HR Master ID photo for OM 3-point shift verification (MNR vs field selfies)
alter table employees
  add column if not exists id_photo_url text;
