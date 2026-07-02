-- HR offboarding: statutory/reminder letters (day 0, +3, +7) with uploads and completion

create table if not exists guard_offboarding_letter_tracks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  guard_epf text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  sequence_started_at date not null,
  letter_1_sent_at timestamptz,
  letter_1_doc_url text,
  letter_1_sent_by uuid references auth.users (id),
  letter_2_sent_at timestamptz,
  letter_2_doc_url text,
  letter_2_sent_by uuid references auth.users (id),
  letter_3_sent_at timestamptz,
  letter_3_doc_url text,
  letter_3_sent_by uuid references auth.users (id),
  completed_at timestamptz,
  completed_by uuid references auth.users (id),
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guard_offboarding_letter_tracks_company_status_idx
  on guard_offboarding_letter_tracks (company_id, status, sequence_started_at desc);

create index if not exists guard_offboarding_letter_tracks_employee_idx
  on guard_offboarding_letter_tracks (employee_id, sequence_started_at desc);

create unique index if not exists guard_offboarding_letter_tracks_one_active_per_employee
  on guard_offboarding_letter_tracks (employee_id)
  where status = 'ACTIVE';

comment on table guard_offboarding_letter_tracks is
  'HR offboarding letter sequence: day 0, +3, +7 reminders with sent dates and document uploads.';

alter table guard_offboarding_letter_tracks enable row level security;

do $$ begin
  create policy company_users_guard_offboarding_letter_tracks on guard_offboarding_letter_tracks
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_guard_offboarding_letter_tracks on guard_offboarding_letter_tracks
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
