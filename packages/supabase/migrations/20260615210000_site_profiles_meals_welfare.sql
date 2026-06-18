-- Site welfare: per-meal flags and accommodation on site_profiles.

alter table site_profiles
  add column if not exists provides_food boolean not null default false,
  add column if not exists provides_accommodation boolean not null default false,
  add column if not exists meal_breakfast boolean not null default false,
  add column if not exists meal_lunch boolean not null default false,
  add column if not exists meal_dinner boolean not null default false,
  add column if not exists meal_tea boolean not null default false;

comment on column site_profiles.meal_breakfast is 'Client provides breakfast on site';
comment on column site_profiles.meal_lunch is 'Client provides lunch on site';
comment on column site_profiles.meal_dinner is 'Client provides dinner on site';
comment on column site_profiles.meal_tea is 'Client provides tea on site';
comment on column site_profiles.provides_accommodation is 'Client provides free guard accommodation on site';
