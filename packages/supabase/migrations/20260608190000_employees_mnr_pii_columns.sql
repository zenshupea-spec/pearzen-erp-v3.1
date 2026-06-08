-- Master Nominal Roll: PII + vetting columns required by HR portal
alter table employees
  add column if not exists nic text,
  add column if not exists bank_code text,
  add column if not exists mod_expiry date,
  add column if not exists police_expiry date;

comment on column employees.nic is 'AES-256-CBC encrypted NIC (iv:ciphertext hex)';
comment on column employees.bank_code is 'AES-256-CBC encrypted bank sort code';
comment on column employees.mod_expiry is 'MoD clearance expiry date';
comment on column employees.police_expiry is 'Police clearance expiry date';
