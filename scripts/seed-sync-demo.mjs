/**
 * 4-site sync demo: 8 guards, 1 SM, 2 months shifts + SM visits (all modules aligned).
 * Prefix CV4-* / SEED_SYNC_DEMO — purges bulk SD-* demo first.
 *
 * Run: npm run seed:sync-demo
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CLASSIC_VENTURE_COMPANY_ID = '9111dd55-9935-4e26-a630-60e36dcb57b5';
const PREFIX = 'CV4';
const SM_EPF = `${PREFIX}-SM-01`;
const SYNC = 'SEED_SYNC_DEMO';
const PHOTO = (seed) => `https://picsum.photos/seed/${seed}/400/400`;
const MONTHS_BACK = 2;
const BATCH = 200;

/** Matches FM portfolio names so HR / OM / SM / visits line up. */
const SITES = [
  {
    site_name: 'Lanka Hospitals — Main Gate',
    site_type: 'HOTEL',
    address: 'NO 578, ELVITIGALA MAWATHA, COLOMBO 05',
    latitude: 6.9105,
    longitude: 79.8648,
    verification_mode: 'B',
    required_guards: 2,
    provides_food: false,
  },
  {
    site_name: 'Lanka Hospitals — Blood Bank',
    site_type: 'HOTEL',
    address: 'LANKA HOSPITALS COMPOUND, COLOMBO 05',
    latitude: 6.9112,
    longitude: 79.8655,
    verification_mode: 'A',
    required_guards: 2,
    provides_food: false,
  },
  {
    site_name: 'Sampath Bank — Nugegoda Branch',
    site_type: 'BANK',
    address: 'NO 45, HIGH LEVEL ROAD, NUGEGODA',
    latitude: 6.8642,
    longitude: 79.8886,
    verification_mode: 'B',
    required_guards: 2,
    provides_food: true,
    food_allowance_lkr: 1500,
  },
  {
    site_name: 'Dialog HQ — Headquarters Tower',
    site_type: 'OFFICE',
    address: 'NO 475, UNION PLACE, COLOMBO 02',
    latitude: 6.918,
    longitude: 79.848,
    verification_mode: 'C',
    required_guards: 2,
    provides_food: false,
    needs_om_gps_capture: true,
  },
];

const GUARDS = [
  { epf: `${PREFIX}-G-01`, name: 'PERERA K.A.N.', rank: 'OIC', site: 0, mod: 8, police: 10 },
  { epf: `${PREFIX}-G-02`, name: 'BANDARA M.S.', rank: 'SSO', site: 0, mod: 3, police: 6 },
  { epf: `${PREFIX}-G-03`, name: 'SILVA R.M.', rank: 'JSO', site: 1, mod: -2, police: 12 },
  { epf: `${PREFIX}-G-04`, name: 'FERNANDO S.P.', rank: 'JSO', site: 1, mod: 14, police: 14 },
  { epf: `${PREFIX}-G-05`, name: 'WEERASINGHE P.L.', rank: 'SSO', site: 2, mod: 6, police: 8 },
  { epf: `${PREFIX}-G-06`, name: 'RATNAYAKE M.D.', rank: 'JSO', site: 2, mod: 1, police: 4 },
  { epf: `${PREFIX}-G-07`, name: 'JAYAWARDENA T.L.', rank: 'JSO', site: 3, mod: 9, police: 11 },
  {
    epf: `${PREFIX}-G-08`,
    name: 'AMARASINGHE P.R.',
    rank: 'JSO',
    site: 3,
    status: 'Resigned',
    mod: 5,
    police: 7,
  },
];

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
      /* next */
    }
  }
}

function mulberry32(seed) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function dateRangeMonthsBack(months) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function missingColumn(err, col) {
  const msg = err?.message ?? '';
  return msg.includes(col) && msg.includes('does not exist');
}

async function batchInsert(supabase, table, rows, label) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${label}: ${error.message}`);
  }
  console.log(`  ✓ ${label}: ${rows.length} rows`);
}

async function purgePrefix(supabase, empPrefix, siteLike) {
  await supabase.from('attendance_logs').delete().like('sync_type', `${SYNC}%`);
  await supabase.from('attendance_logs').delete().like('sync_type', 'SEED_SCALE_DEMO%');
  await supabase.from('sm_visit_logs').delete().like('notes', `${SYNC}%`);

  let from = 0;
  for (;;) {
    const { data } = await supabase
      .from('employees')
      .select('emp_number')
      .like('emp_number', `${empPrefix}%`)
      .range(from, from + 999);
    if (!data?.length) break;
    const epfs = data.map((r) => r.emp_number);
    for (let i = 0; i < epfs.length; i += 100) {
      await supabase.from('sm_guard_attendance').delete().in('guard_epf', epfs.slice(i, i + 100));
    }
    if (data.length < 1000) break;
    from += 1000;
  }

  await supabase.from('sm_guard_attendance').delete().like('guard_epf', `${empPrefix}%`);
  await supabase.from('sm_guard_attendance').delete().like('guard_epf', 'SD-G-%');
  await supabase.from('sm_guard_attendance').delete().like('sm_epf', 'SD-SM-%');
  await supabase.from('sm_guard_assignments').delete().like('sm_epf', `${empPrefix}%`);
  await supabase.from('sm_guard_assignments').delete().like('sm_epf', 'SD-SM-%');
  await supabase.from('employees').delete().like('emp_number', `${empPrefix}%`);
  await supabase.from('employees').delete().like('emp_number', 'SD-%');
  if (siteLike) {
    await supabase.from('site_profiles').delete().like('site_name', siteLike);
    await supabase.from('site_profiles').delete().like('site_name', 'SD DEMO%');
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env — run: npm run wire:backend');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const today = new Date().toISOString().split('T')[0];
const rand = mulberry32(202604);

console.log('\nCV4 sync demo — purging old SD/CV4 data…');
await purgePrefix(supabase, PREFIX, '%');
await purgePrefix(supabase, 'SD', '%');
await supabase.from('site_profiles').delete().like('site_name', 'SD DEMO%');

const optionalCols = new Set();
for (const col of [
  'group',
  'site',
  'base_salary',
  'epf_no',
  'id_photo_url',
  'mod_expiry',
  'police_expiry',
]) {
  const { error } = await supabase.from('employees').select(col).limit(1);
  if (!error) optionalCols.add(col);
}

const siteOptional = new Set();
for (const col of [
  'assigned_sm_epf',
  'required_guards',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'needs_om_gps_capture',
  'geofence_radius',
  'geofence_radius_m',
]) {
  const { error } = await supabase.from('site_profiles').select(col).limit(1);
  if (!error) siteOptional.add(col);
}

console.log('Inserting 4 sites…');
const siteRows = SITES.map((s) => {
  const row = {
    company_id: companyId,
    site_name: s.site_name,
    site_type: s.site_type,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    required_guards: s.required_guards,
    assigned_sm_epf: SM_EPF,
    verification_mode: s.verification_mode,
    provides_food: s.provides_food ?? false,
    food_allowance_lkr: s.food_allowance_lkr ?? 0,
    needs_om_gps_capture: s.needs_om_gps_capture ?? false,
    geofence_radius: 25,
  };
  if (!siteOptional.has('assigned_sm_epf')) delete row.assigned_sm_epf;
  if (!siteOptional.has('required_guards')) delete row.required_guards;
  if (!siteOptional.has('verification_mode')) delete row.verification_mode;
  if (!siteOptional.has('provides_food')) delete row.provides_food;
  if (!siteOptional.has('food_allowance_lkr')) delete row.food_allowance_lkr;
  if (!siteOptional.has('needs_om_gps_capture')) delete row.needs_om_gps_capture;
  if (siteOptional.has('geofence_radius_m')) {
    row.geofence_radius_m = row.geofence_radius;
    delete row.geofence_radius;
  } else if (!siteOptional.has('geofence_radius')) {
    delete row.geofence_radius;
  }
  return row;
});
await batchInsert(supabase, 'site_profiles', siteRows, 'sites');

const smRow = {
  emp_number: SM_EPF,
  full_name: 'DEMO SECTOR MANAGER CV4',
  company_id: companyId,
  rank: 'OIC',
  status: 'ACTIVE',
  phone: '+94771110001',
  date_joined: '2017-06-01',
  salary_type: 'BANK',
  bank_name: 'COMMERCIAL BANK',
  account_number: '9900112233',
  epf_yn: true,
};
if (optionalCols.has('group')) smRow.group = 'SECTOR_MANAGER';
if (optionalCols.has('base_salary')) smRow.base_salary = 92000;
if (optionalCols.has('id_photo_url')) smRow.id_photo_url = PHOTO('sm');
await batchInsert(supabase, 'employees', [smRow], 'SM');

const guardRows = GUARDS.map((g) => {
  const site = SITES[g.site];
  const row = {
    emp_number: g.epf,
    full_name: g.name,
    company_id: companyId,
    rank: g.rank,
    status: g.status ?? 'ACTIVE',
    phone: `+9477${g.epf.slice(-7).replace(/\D/g, '0').padStart(7, '1')}`,
    date_joined: addMonths(today, -18 - g.site),
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '052',
    account_number: `8${String(10000000 + g.site * 2)}`,
    epf_yn: true,
  };
  if (optionalCols.has('group')) row.group = 'GUARD';
  if (optionalCols.has('site')) row.site = site.site_name;
  if (optionalCols.has('base_salary')) row.base_salary = 42000 + g.site * 800;
  if (optionalCols.has('epf_no')) row.epf_no = `EPF-${g.epf}`;
  if (optionalCols.has('mod_expiry')) row.mod_expiry = addMonths(today, g.mod);
  if (optionalCols.has('police_expiry')) row.police_expiry = addMonths(today, g.police);
  if (optionalCols.has('id_photo_url')) row.id_photo_url = PHOTO(g.epf);
  return row;
});
await batchInsert(supabase, 'employees', guardRows, 'guards');

const links = GUARDS.filter((g) => g.status !== 'Resigned').map((g) => ({
  sm_epf: SM_EPF,
  guard_epf: g.epf,
}));
const { error: linkProbe } = await supabase.from('sm_guard_assignments').select('id').limit(1);
if (!linkProbe?.message?.includes('schema cache')) {
  await supabase.from('sm_guard_assignments').delete().like('sm_epf', `${PREFIX}%`);
  await batchInsert(supabase, 'sm_guard_assignments', links, 'sm_guard_assignments');
} else {
  console.warn('  ⚠ sm_guard_assignments missing — SM portal uses site + employee.site');
}

const calendarDays = dateRangeMonthsBack(MONTHS_BACK);
const smAttendance = [];
const attendanceLogs = [];
const smVisits = [];

for (const g of GUARDS) {
  if (g.status === 'Resigned') continue;
  const site = SITES[g.site];
  for (const shiftDate of calendarDays) {
    if (rand() > 0.42) continue;
    const shiftType = rand() < 0.7 ? 'DAY' : 'NIGHT';
    smAttendance.push({
      sm_epf: SM_EPF,
      shift_date: shiftDate,
      shift_type: shiftType,
      site_name: site.site_name,
      guard_epf: g.epf,
      status: rand() < 0.9 ? 'CONFIRMED' : 'SUBMITTED',
    });

    const daysAgo = Math.floor((Date.now() - new Date(shiftDate).getTime()) / 86400000);
    if (daysAgo > 75) continue;

    let logStatus = 'APPROVED';
    let syncSuffix = '|TIMING_OK';
    let withPhotos = true;
    if (daysAgo <= 10) {
      const s = rand();
      if (s < 0.15) {
        logStatus = 'PENDING';
      } else if (s < 0.22) {
        logStatus = 'FLAGGED';
        syncSuffix = '|LATE';
      } else if (s < 0.28) {
        logStatus = 'PENDING';
        withPhotos = false;
        syncSuffix = '|NO_PHOTO';
      }
    }

    const checkInHour = shiftType === 'DAY' ? 0 : 12;
    const checkOutHour = shiftType === 'DAY' ? 12 : 23;
    const base = {
      emp_number: g.epf,
      company_id: companyId,
      latitude: site.latitude,
      longitude: site.longitude,
      sync_type: `${SYNC}${syncSuffix}`,
      status: logStatus,
    };
    attendanceLogs.push({
      ...base,
      action_type: 'CHECK_IN',
      device_time: `${shiftDate}T${String(checkInHour).padStart(2, '0')}:35:00+00:00`,
      photo_url: withPhotos ? PHOTO(`in-${g.epf}-${shiftDate}`) : null,
    });
    attendanceLogs.push({
      ...base,
      action_type: 'CHECK_OUT',
      device_time: `${shiftDate}T${String(checkOutHour).padStart(2, '0')}:32:00+00:00`,
      photo_url: withPhotos ? PHOTO(`out-${g.epf}-${shiftDate}`) : null,
    });
  }
}

for (let siteIdx = 0; siteIdx < SITES.length; siteIdx++) {
  const site = SITES[siteIdx];
  for (const shiftDate of calendarDays) {
    if (rand() > 0.12) continue;
    const daysAgo = Math.floor((Date.now() - new Date(shiftDate).getTime()) / 86400000);
    let verification_status = 'APPROVED';
    if (daysAgo <= 7) {
      const s = rand();
      if (s < 0.35) verification_status = 'PENDING';
      else if (s < 0.5) verification_status = 'FLAGGED';
    } else if (daysAgo <= 21 && rand() < 0.08) {
      verification_status = 'FLAGGED';
    }
    const hour = 6 + Math.floor(rand() * 10);
    smVisits.push({
      sm_epf: SM_EPF,
      visit_type: 'VISIT',
      site_name: site.site_name,
      latitude: site.latitude,
      longitude: site.longitude,
      photo_url: rand() < 0.85 ? PHOTO(`visit-${siteIdx}-${shiftDate}`) : null,
      verification_status,
      notes: `${SYNC} ${site.site_name}`,
      created_at: `${shiftDate}T${String(hour).padStart(2, '0')}:15:00+00:00`,
    });
  }
}

await batchInsert(supabase, 'sm_guard_attendance', smAttendance, 'sm_guard_attendance');
await batchInsert(supabase, 'attendance_logs', attendanceLogs, 'attendance_logs');
await batchInsert(supabase, 'sm_visit_logs', smVisits, 'sm_visit_logs');

console.log('\n✓ CV4 sync demo ready (2 months)');
console.log('  Sites: 4 (Lanka Hospitals x2, Sampath Nugegoda, Dialog HQ)');
console.log('  SM login epf: CV4-SM-01  |  Guards: CV4-G-01 … CV4-G-08');
console.log('  MNR filter: search "CV4" or site name');
console.log('  OM → Shift Verification (last 10 days) + SM visit queue');
console.log('  SM PWA → sites-to-visit / visit (after SM auth provisioned)\n');
