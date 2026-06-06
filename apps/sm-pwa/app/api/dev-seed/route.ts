import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Temporary dev-only seed route — DELETE after testing
// Hit GET /api/dev-seed to create the table + insert tonight's test shift

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing SUPABASE env vars' }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    db: { schema: 'public' },
    auth: { persistSession: false },
  });

  const today = new Date().toISOString().split('T')[0];

  // ── 1. Create table + policy (raw SQL via rpc if available, else skip) ──────
  // Try a direct upsert — if the table doesn't exist this will fail with a
  // schema-cache error and we'll return the SQL the user needs to run once.
  const { error: probeErr } = await supabase
    .from('sm_guard_attendance')
    .select('id')
    .limit(1);

  if (probeErr && probeErr.message.includes('schema cache')) {
    const migrationSQL = `
create table if not exists sm_guard_attendance (
  id          uuid primary key default gen_random_uuid(),
  sm_epf      text not null,
  shift_date  date not null,
  shift_type  text not null default 'DAY' check (shift_type in ('DAY','NIGHT')),
  site_name   text not null,
  guard_epf   text not null,
  status      text not null default 'SUBMITTED' check (status in ('SUBMITTED','CONFIRMED','CANCELLED')),
  created_at  timestamptz not null default now(),
  unique (sm_epf, shift_date, shift_type, guard_epf)
);
create index if not exists idx_sm_guard_attendance_epf_date on sm_guard_attendance (sm_epf, shift_date);
alter table sm_guard_attendance enable row level security;
drop policy if exists "service_role_all_sm_guard_attendance" on sm_guard_attendance;
create policy "service_role_all_sm_guard_attendance" on sm_guard_attendance for all using (auth.role() = 'service_role');`;

    return NextResponse.json({
      error: 'Table does not exist yet. Run the SQL below in your Supabase SQL editor, then reload this page.',
      supabase_sql_editor: `https://supabase.com/dashboard/project/${url.split('//')[1].split('.')[0]}/sql/new`,
      sql: migrationSQL,
    }, { status: 500 });
  }

  if (probeErr) {
    return NextResponse.json({ error: probeErr.message }, { status: 500 });
  }

  // ── 2. Wipe existing test rows for tonight ────────────────────────────────
  await supabase
    .from('sm_guard_attendance')
    .delete()
    .eq('sm_epf', 'SM-001')
    .eq('shift_date', today)
    .eq('shift_type', 'NIGHT');

  // ── 3. Insert 3 test guards across 2 sites ────────────────────────────────
  const { error: insErr } = await supabase
    .from('sm_guard_attendance')
    .insert([
      { sm_epf: 'SM-001', shift_date: today, shift_type: 'NIGHT', site_name: 'Site Alpha', guard_epf: 'G-001', status: 'SUBMITTED' },
      { sm_epf: 'SM-001', shift_date: today, shift_type: 'NIGHT', site_name: 'Site Alpha', guard_epf: 'G-002', status: 'SUBMITTED' },
      { sm_epf: 'SM-001', shift_date: today, shift_type: 'NIGHT', site_name: 'Site Bravo', guard_epf: 'G-003', status: 'SUBMITTED' },
    ]);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `Inserted 3 SUBMITTED night-shift rows for SM-001 on ${today}`,
    next: 'Now open /attendance/confirm in the SM PWA to verify.',
  });
}
