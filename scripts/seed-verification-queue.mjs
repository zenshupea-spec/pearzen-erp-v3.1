/**
 * Seed guard + SM verification queue rows for today.
 * Run: node scripts/seed-verification-queue.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* try next */
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const today = process.env.SEED_DATE ?? new Date().toISOString().split('T')[0];

/** Day shift ~06:05–18:02 Colombo (UTC+5:30) — passes timing so rows show under Active verification. */
const DAY_CHECK_IN = `${today}T00:35:00+00:00`;
const DAY_CHECK_OUT = `${today}T12:32:00+00:00`;

const PHOTO = {
  guardIn:
    'https://ktfgvcrdfbapmefktgjc.supabase.co/storage/v1/object/public/attendance_selfies/G-001-CHECK_IN-1778575280816.webp',
  guardOut:
    'https://ktfgvcrdfbapmefktgjc.supabase.co/storage/v1/object/public/attendance_selfies/G-001-CHECK_OUT-1778575589393.webp',
  mnr: 'https://picsum.photos/seed/pearzen-mnr/400/400',
  smVisit: 'https://picsum.photos/seed/pearzen-sm-visit/400/400',
};

// ── Ensure test employees exist ───────────────────────────────────────────────
const testEmployees = [
  { emp_number: 'G-001', full_name: 'TEST GUARD ONE', id_photo_url: PHOTO.mnr },
  { emp_number: 'G-002', full_name: 'TEST GUARD TWO', id_photo_url: PHOTO.mnr },
  { emp_number: 'G1234', full_name: 'TEST GUARD 1234', id_photo_url: PHOTO.mnr },
  { emp_number: 'SM-001', full_name: 'TEST SECTOR MANAGER', id_photo_url: PHOTO.mnr },
];

const { data: anchorEmp } = await supabase
  .from('employees')
  .select('company_id')
  .eq('emp_number', 'G-001')
  .maybeSingle();

const companyId =
  process.env.SEED_COMPANY_ID ??
  anchorEmp?.company_id ??
  '9111dd55-9935-4e26-a630-60e36dcb57b5';

for (const row of testEmployees) {
  const { data: existing } = await supabase
    .from('employees')
    .select('emp_number')
    .eq('emp_number', row.emp_number)
    .maybeSingle();

  const payload = { ...row, company_id: companyId };
  if (existing) {
    await supabase
      .from('employees')
      .update({
        full_name: row.full_name,
        id_photo_url: row.id_photo_url,
        company_id: companyId,
      })
      .eq('emp_number', row.emp_number);
  } else {
    await supabase.from('employees').insert(payload);
  }
}

// ── Wipe prior seed rows for today ────────────────────────────────────────────
await supabase
  .from('attendance_logs')
  .delete()
  .gte('device_time', `${today}T00:00:00`)
  .lt('device_time', `${today}T23:59:59.999`)
  .like('sync_type', 'SEED_OM_VERIFY%');

await supabase
  .from('sm_visit_logs')
  .delete()
  .gte('created_at', `${today}T00:00:00`)
  .lt('created_at', `${today}T23:59:59.999`)
  .like('notes', 'SEED_OM_VERIFY%');

// ── Guard shifts (attendance_logs) ────────────────────────────────────────────
const guardShifts = [
  {
    emp: 'G-001',
    status: 'PENDING',
    checkIn: DAY_CHECK_IN,
    checkOut: DAY_CHECK_OUT,
    photos: true,
  },
  {
    emp: 'G1234',
    status: 'FLAGGED',
    checkIn: `${today}T00:38:00+00:00`,
    checkOut: `${today}T12:34:00+00:00`,
    photos: true,
  },
  {
    emp: 'G-002',
    status: 'PENDING',
    checkIn: `${today}T00:40:00+00:00`,
    checkOut: `${today}T12:36:00+00:00`,
    photos: false,
  },
];

const guardRows = [];
for (const shift of guardShifts) {
  guardRows.push({
    emp_number: shift.emp,
    company_id: companyId,
    action_type: 'CHECK_IN',
    device_time: shift.checkIn,
    latitude: 6.9271,
    longitude: 79.8612,
    sync_type: shift.photos ? 'SEED_OM_VERIFY|TIMING_OK' : 'SEED_OM_VERIFY',
    photo_url: shift.photos ? PHOTO.guardIn : null,
    status: shift.status,
  });
  guardRows.push({
    emp_number: shift.emp,
    company_id: companyId,
    action_type: 'CHECK_OUT',
    device_time: shift.checkOut,
    latitude: 6.9271,
    longitude: 79.8612,
    sync_type: shift.photos ? 'SEED_OM_VERIFY|TIMING_OK' : 'SEED_OM_VERIFY',
    photo_url: shift.photos ? PHOTO.guardOut : null,
    status: shift.status,
  });
}

const { error: guardErr } = await supabase.from('attendance_logs').insert(guardRows);
if (guardErr) {
  console.error('Guard insert error:', guardErr.message);
  process.exit(1);
}

// ── SM visit logs ─────────────────────────────────────────────────────────────
const smVisits = [
  {
    sm_epf: 'SM-001',
    site_name: 'Site Alpha',
    created_at: `${today}T08:15:00+00:00`,
    verification_status: 'PENDING',
    photo_url: PHOTO.smVisit,
    notes: 'SEED_OM_VERIFY pending visit',
  },
  {
    sm_epf: 'SM-001',
    site_name: 'Site Bravo',
    created_at: `${today}T11:40:00+00:00`,
    verification_status: 'FLAGGED',
    photo_url: PHOTO.smVisit,
    notes: 'SEED_OM_VERIFY flagged visit',
  },
  {
    sm_epf: 'SM-001',
    site_name: 'Site Charlie',
    created_at: `${today}T15:20:00+00:00`,
    verification_status: 'PENDING',
    photo_url: null,
    notes: 'SEED_OM_VERIFY missing photo visit',
  },
];

const { error: smErr } = await supabase.from('sm_visit_logs').insert(
  smVisits.map((v) => ({
    sm_epf: v.sm_epf,
    visit_type: 'VISIT',
    site_name: v.site_name,
    latitude: 6.9271,
    longitude: 79.8612,
    photo_url: v.photo_url,
    verification_status: v.verification_status,
    notes: v.notes,
    created_at: v.created_at,
  })),
);

if (smErr) {
  console.error('SM visit insert error:', smErr.message);
  process.exit(1);
}

console.log(`✓ Seeded verification queue for ${today} (company ${companyId})`);
console.log(`  Guards: ${guardShifts.length} shifts (${guardRows.length} attendance logs)`);
console.log(`  Sector Managers: ${smVisits.length} visit logs`);
console.log('  → OM → Shift Verification tab → date above → Guards:');
console.log('     Active verification: G-001, G1234 | On hold: G-002 (missing selfies)');
