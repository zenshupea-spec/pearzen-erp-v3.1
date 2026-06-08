/**
 * Scale demo: 400 sites, 800 guards, 20 SMs, ~6 months SM + attendance history.
 * Tagged SD-* / SEED_SCALE_DEMO for safe purge.
 *
 * Run: npm run seed:scale-demo
 * Purge first: npm run seed:scale-demo:purge
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const PREFIX = 'SD';
const SITE_NAME_PREFIX = 'SD DEMO — ';
const SYNC = 'SEED_SCALE_DEMO';
const PHOTO = (seed) => `https://picsum.photos/seed/${PREFIX}-${seed}/400/400`;

const NUM_SITES = Number(process.env.SEED_SITES) || 400;
const NUM_GUARDS = Number(process.env.SEED_GUARDS) || 800;
const NUM_SMS = Number(process.env.SEED_SMS) || 20;
const MONTHS_BACK = Number(process.env.SEED_MONTHS) || 6;
const SHIFT_DAY_PROB = Number(process.env.SEED_SHIFT_PROB) || 0.32;
const BATCH = 400;

const SITE_TYPES = ['BANK', 'HOTEL', 'OFFICE', 'PHARMACY', 'RESIDENTIAL', 'STORAGE', 'OTHER'];
const VERIFICATION_MODES = ['A', 'B', 'C'];
const RANKS = ['JSO', 'JSO', 'JSO', 'LSO', 'SSO', 'CSO', 'OIC'];
const BANKS = ['COMMERCIAL BANK', 'HNB', 'BOC', 'SAMPATH BANK', 'NTB'];
const FIRST = ['PERERA', 'SILVA', 'FERNANDO', 'JAYAWARDENA', 'RATNAYAKE', 'KUMARA', 'MENDIS', 'WIJESINGHE'];
const LAST = ['K.A.N.', 'R.M.', 'S.P.', 'T.L.', 'M.D.', 'P.S.', 'A.B.', 'N.K.'];
const CLIENTS = [
  'LANKA HOSPITALS',
  'COMMERCIAL BANK',
  'BOC',
  'DIALOG',
  'HEMAS',
  'CARGILLS',
  'CINNAMON',
  'KEELLS',
  'ARPICO',
  'SOFTLOGIC',
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

function pad(n, width) {
  return String(n).padStart(width, '0');
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

async function batchInsert(supabase, table, rows, label) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`${label} batch ${i}: ${error.message}`);
    if ((i + BATCH) % 4000 === 0 || i + BATCH >= rows.length) {
      console.log(`  ${label}: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
    }
  }
}

/** Remove demo shift history only (safe to run before every seed). */
async function purgeShiftHistory(supabase) {
  console.log('Clearing demo shift history (attendance + SM rows)…');
  const { error: logErr } = await supabase
    .from('attendance_logs')
    .delete()
    .like('sync_type', `${SYNC}%`);
  if (logErr) console.warn('  attendance_logs:', logErr.message);

  let from = 0;
  const page = 1000;
  for (;;) {
    const { data: epfRows, error } = await supabase
      .from('employees')
      .select('emp_number')
      .like('emp_number', `${PREFIX}-G-%`)
      .range(from, from + page - 1);
    if (error) {
      console.warn('  list guards for purge:', error.message);
      break;
    }
    if (!epfRows?.length) break;
    const epfs = epfRows.map((r) => r.emp_number);
    for (let i = 0; i < epfs.length; i += 100) {
      const { error: delErr } = await supabase
        .from('sm_guard_attendance')
        .delete()
        .in('guard_epf', epfs.slice(i, i + 100));
      if (delErr) console.warn('  sm_guard_attendance:', delErr.message);
    }
    if (epfRows.length < page) break;
    from += page;
  }

  const { error: smDelErr } = await supabase
    .from('sm_guard_attendance')
    .delete()
    .like('sm_epf', `${PREFIX}-SM-%`);
  if (smDelErr) console.warn('  sm_guard_attendance (sm_epf):', smDelErr.message);
}

async function purgeScaleDemo(supabase) {
  console.log('Purging all prior scale demo data…');
  await purgeShiftHistory(supabase);
  await supabase.from('sm_guard_assignments').delete().like('sm_epf', `${PREFIX}-SM-%`);
  await supabase.from('employees').delete().like('emp_number', `${PREFIX}-%`);
  await supabase.from('site_profiles').delete().like('site_name', `${SITE_NAME_PREFIX}%`);
  console.log('  full purge done');
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const today = new Date().toISOString().split('T')[0];
const rand = mulberry32(42);
const doPurge = process.argv.includes('--purge') || process.env.SEED_PURGE === '1';

if (doPurge) {
  await purgeScaleDemo(supabase);
} else {
  await purgeShiftHistory(supabase);
}

const { count: existingGuards } = await supabase
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .like('emp_number', `${PREFIX}-G-%`);

const skipMasterData =
  !doPurge && (existingGuards ?? 0) >= Math.min(NUM_GUARDS, 100);

console.log(
  `\nSeeding scale demo (company ${companyId}): ${NUM_SITES} sites, ${NUM_GUARDS} guards, ${NUM_SMS} SMs, ${MONTHS_BACK}mo` +
    (skipMasterData ? ' [shifts only — master data already present]' : '') +
    '\n',
);

let guardMeta = [];

const optionalCols = new Set();
const EMP_OPTIONAL = [
  'group',
  'site',
  'role',
  'mod_expiry',
  'police_expiry',
  'base_salary',
  'basic_salary',
  'epf_no',
  'epf_num',
  'id_photo_url',
  'gender',
  'nationality',
  'religion',
  'home_address',
  'dob',
  'bank_name',
  'branch_code',
  'account_number',
  'salary_type',
  'epf_yn',
  'date_joined',
];
for (const col of EMP_OPTIONAL) {
  const { error } = await supabase.from('employees').select(col).limit(1);
  if (!error) optionalCols.add(col);
}

function pickEmployee(row) {
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (!['emp_number', 'full_name', 'company_id', 'rank', 'status', 'phone'].includes(key)) {
      if (!optionalCols.has(key)) delete out[key];
    }
  }
  if (optionalCols.has('base_salary') && out.basic_salary != null) {
    out.base_salary = out.basic_salary;
    delete out.basic_salary;
  }
  if (!optionalCols.has('base_salary') && out.base_salary != null) {
    out.basic_salary = out.base_salary;
    delete out.base_salary;
  }
  if (optionalCols.has('epf_no') && out.epf_no) {
    /* keep */
  } else if (optionalCols.has('epf_num') && out.epf_no) {
    out.epf_num = out.epf_no;
    delete out.epf_no;
  } else {
    delete out.epf_no;
  }
  return out;
}

if (skipMasterData) {
  let guardSelect = 'emp_number, full_name, status';
  if (optionalCols.has('site')) guardSelect += ', site';

  const guards = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data: chunk, error: loadErr } = await supabase
      .from('employees')
      .select(guardSelect)
      .like('emp_number', `${PREFIX}-G-%`)
      .order('emp_number', { ascending: true })
      .range(from, from + page - 1);
    if (loadErr) throw new Error(loadErr.message);
    if (!chunk?.length) break;
    guards.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }

  const seenEpf = new Set();

  const { data: sites } = await supabase
    .from('site_profiles')
    .select('site_name, assigned_sm_epf, latitude, longitude')
    .like('site_name', `${SITE_NAME_PREFIX}%`)
    .order('site_name', { ascending: true });

  const siteList = sites ?? [];
  const siteByName = Object.fromEntries(siteList.map((s) => [s.site_name, s]));

  for (const g of guards) {
    if (seenEpf.has(g.emp_number)) continue;
    seenEpf.add(g.emp_number);
    let site =
      g.site && siteByName[g.site]
        ? siteByName[g.site]
        : null;
    if (!site && siteList.length) {
      const m = String(g.emp_number).match(/SD-G-(\d+)/);
      const idx = m ? parseInt(m[1], 10) - 1 : 0;
      site = siteList[Math.floor(idx / 2) % siteList.length];
    }
    if (!site) continue;
    guardMeta.push({
      epf: g.emp_number,
      site: { siteName: site.site_name },
      smEpf: site.assigned_sm_epf ?? `${PREFIX}-SM-01`,
      lat: site.latitude ?? 6.9,
      lng: site.longitude ?? 79.86,
      status: g.status,
    });
  }
  console.log(`Loaded ${guardMeta.length} guards from DB for shift generation.`);
} else {
const smRows = [];
for (let i = 1; i <= NUM_SMS; i++) {
  const epf = `${PREFIX}-SM-${pad(i, 2)}`;
  const row = {
    emp_number: epf,
    full_name: `DEMO SM ${pad(i, 2)}`,
    company_id: companyId,
    rank: 'OIC',
    role: 'SECTOR MANAGER',
    status: 'ACTIVE',
    phone: `+9477${pad(100000 + i, 7)}`,
    date_joined: '2018-01-15',
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    account_number: `9900${pad(i, 6)}`,
    epf_yn: true,
  };
  if (optionalCols.has('group')) row.group = 'SECTOR_MANAGER';
  if (optionalCols.has('base_salary')) row.base_salary = 85000 + i * 500;
  if (optionalCols.has('epf_no')) row.epf_no = `EPF-${epf}`;
  if (optionalCols.has('id_photo_url')) row.id_photo_url = PHOTO(`sm-${i}`);
  smRows.push(pickEmployee(row));
}

console.log('Inserting sector managers…');
await batchInsert(supabase, 'employees', smRows, 'SMs');

const siteOptional = new Set();
for (const col of [
  'required_guards',
  'assigned_sm_epf',
  'geofence_radius',
  'geofence_radius_m',
  'verification_mode',
  'provides_food',
  'food_allowance_lkr',
  'provides_accommodation',
  'needs_om_gps_capture',
  'nfc_tag_id',
]) {
  const { error } = await supabase.from('site_profiles').select(col).limit(1);
  if (!error) siteOptional.add(col);
}

function pickSite(row) {
  const out = { ...row };
  if (siteOptional.has('geofence_radius_m') && out.geofence_radius != null) {
    out.geofence_radius_m = out.geofence_radius;
    delete out.geofence_radius;
  }
  for (const key of Object.keys(out)) {
    if (!['company_id', 'site_name', 'site_type', 'address', 'latitude', 'longitude'].includes(key)) {
      if (!siteOptional.has(key)) delete out[key];
    }
  }
  return out;
}

const siteRows = [];
const siteMeta = [];
for (let i = 1; i <= NUM_SITES; i++) {
  const smIndex = Math.floor((i - 1) / (NUM_SITES / NUM_SMS)) + 1;
  const smEpf = `${PREFIX}-SM-${pad(Math.min(smIndex, NUM_SMS), 2)}`;
  const client = CLIENTS[i % CLIENTS.length];
  const siteName = `${SITE_NAME_PREFIX}${client} — SITE ${pad(i, 3)}`;
  const lat = 6.85 + rand() * 0.12;
  const lng = 79.82 + rand() * 0.18;
  const type = SITE_TYPES[i % SITE_TYPES.length];
  const mode = VERIFICATION_MODES[i % 3];
  siteRows.push({
    company_id: companyId,
    site_name: siteName,
    site_type: type,
    address: `NO ${i}, DEMO STREET, COLOMBO`,
    required_guards: 2,
    assigned_sm_epf: smEpf,
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lng * 1e6) / 1e6,
    geofence_radius: 25,
    verification_mode: mode,
    provides_food: i % 5 === 0,
    food_allowance_lkr: i % 5 === 0 ? 1500 : 0,
    provides_accommodation: i % 17 === 0,
    needs_om_gps_capture: false,
  });
  siteMeta.push({ siteName, smEpf, lat, lng });
}

console.log('Inserting sites…');
await batchInsert(
  supabase,
  'site_profiles',
  siteRows.map(pickSite),
  'sites',
);

const guardRows = [];
for (let i = 1; i <= NUM_GUARDS; i++) {
  const siteIndex = Math.floor((i - 1) / 2);
  const site = siteMeta[Math.min(siteIndex, NUM_SITES - 1)];
  const epf = `${PREFIX}-G-${pad(i, 4)}`;
  const fn = FIRST[i % FIRST.length];
  const ln = LAST[(i * 3) % LAST.length];
  const statusRoll = rand();
  const status = statusRoll < 0.88 ? 'ACTIVE' : statusRoll < 0.94 ? 'Resigned' : 'ACTIVE';
  const salaryType = rand() < 0.92 ? 'BANK' : 'CASH';
  const row = {
    emp_number: epf,
    full_name: `${fn} ${ln}`,
    company_id: companyId,
    rank: RANKS[i % RANKS.length],
    role: 'SECURITY OFFICER',
    status,
    phone: `+9476${pad(1000000 + i, 7)}`,
    dob: `${1985 + (i % 15)}-${pad((i % 12) + 1, 2)}-15`,
    gender: i % 7 === 0 ? 'FEMALE' : 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: `NO ${i}, DEMO LANE, COLOMBO`,
    date_joined: addMonths(today, -(24 + (i % 60))),
    salary_type: salaryType,
    bank_name: BANKS[i % BANKS.length],
    branch_code: pad((i % 99) + 1, 3),
    account_number: `8${pad(10000000 + i, 9)}`,
    epf_yn: salaryType === 'BANK',
  };
  if (optionalCols.has('group')) row.group = 'GUARD';
  if (optionalCols.has('site')) row.site = site.siteName;
  if (optionalCols.has('base_salary')) row.base_salary = 38000 + (i % 12) * 1500;
  if (optionalCols.has('epf_no')) row.epf_no = `EPF-${epf}`;
  if (optionalCols.has('mod_expiry')) {
    row.mod_expiry = addMonths(today, (i % 24) - 6);
  }
  if (optionalCols.has('police_expiry')) {
    row.police_expiry = addMonths(today, (i % 18) - 3);
  }
  if (optionalCols.has('id_photo_url')) row.id_photo_url = PHOTO(`g-${i}`);
  guardRows.push(pickEmployee(row));
  guardMeta.push({ epf, site, smEpf: site.smEpf, lat: site.lat, lng: site.lng, status });
}

console.log('Inserting guards…');
await batchInsert(supabase, 'employees', guardRows, 'guards');

const linkRows = guardMeta.map((g) => ({
  sm_epf: g.smEpf,
  guard_epf: g.epf,
}));

const { error: linksProbe } = await supabase
  .from('sm_guard_assignments')
  .select('id')
  .limit(1);

if (linksProbe?.message?.includes('schema cache')) {
  console.warn(
    '  ⚠ sm_guard_assignments missing — run scripts/sql/sm-portal-tables.sql in Supabase SQL editor, then re-run seed.',
  );
} else if (linksProbe) {
  console.warn(`  ⚠ sm_guard_assignments: ${linksProbe.message}`);
} else {
  await supabase.from('sm_guard_assignments').delete().like('sm_epf', `${PREFIX}-SM-%`);
  console.log('Inserting SM guard links…');
  await batchInsert(supabase, 'sm_guard_assignments', linkRows, 'sm links');
}
} // end skipMasterData else

const { error: smAttProbe } = await supabase
  .from('sm_guard_attendance')
  .select('id')
  .limit(1);
if (smAttProbe?.message?.includes('schema cache')) {
  console.error(
    'sm_guard_attendance table missing — run packages/supabase/migrations/20260602120000_sm_guard_attendance.sql',
  );
  process.exit(1);
}

const calendarDays = dateRangeMonthsBack(MONTHS_BACK);
const statuses = ['PENDING', 'FLAGGED', 'APPROVED', 'REJECTED'];
const smAttendance = [];
const attendanceLogs = [];

for (const g of guardMeta) {
  if (g.status === 'Resigned') continue;

  for (const shiftDate of calendarDays) {
    if (rand() > SHIFT_DAY_PROB) continue;

    const shiftType = rand() < 0.72 ? 'DAY' : 'NIGHT';
    const smStatus = rand() < 0.92 ? 'CONFIRMED' : 'SUBMITTED';

    smAttendance.push({
      sm_epf: g.smEpf,
      shift_date: shiftDate,
      shift_type: shiftType,
      site_name: g.site.siteName,
      guard_epf: g.epf,
      status: smStatus,
    });

    const daysAgo = Math.floor((Date.now() - new Date(shiftDate).getTime()) / 86400000);
    if (daysAgo > 120) continue;

    const scenario = rand();
    let logStatus = 'APPROVED';
    let syncSuffix = '|TIMING_OK';
    let withPhotos = true;

    if (daysAgo <= 14) {
      if (scenario < 0.12) {
        logStatus = 'PENDING';
        syncSuffix = '|TIMING_OK';
      } else if (scenario < 0.18) {
        logStatus = 'FLAGGED';
        syncSuffix = '|LATE';
      } else if (scenario < 0.22) {
        logStatus = 'PENDING';
        withPhotos = false;
        syncSuffix = '|NO_PHOTO';
      } else if (scenario < 0.25) {
        logStatus = 'REJECTED';
        syncSuffix = '|EARLY_OUT';
      }
    } else if (scenario < 0.05) {
      logStatus = 'FLAGGED';
      syncSuffix = '|LATE';
    }

    const checkInHour = shiftType === 'DAY' ? 0 : 12;
    const checkOutHour = shiftType === 'DAY' ? 12 : 23;
    const checkIn = `${shiftDate}T${pad(checkInHour, 2)}:35:00+00:00`;
    const checkOut = `${shiftDate}T${pad(checkOutHour, 2)}:32:00+00:00`;
    const sync = `${SYNC}${syncSuffix}`;

    attendanceLogs.push({
      emp_number: g.epf,
      company_id: companyId,
      action_type: 'CHECK_IN',
      device_time: checkIn,
      latitude: g.lat,
      longitude: g.lng,
      sync_type: sync,
      photo_url: withPhotos ? PHOTO(`in-${g.epf}-${shiftDate}`) : null,
      status: logStatus,
    });

    if (scenario > 0.03 || daysAgo > 30) {
      attendanceLogs.push({
        emp_number: g.epf,
        company_id: companyId,
        action_type: 'CHECK_OUT',
        device_time: checkOut,
        latitude: g.lat,
        longitude: g.lng,
        sync_type: sync,
        photo_url: withPhotos ? PHOTO(`out-${g.epf}-${shiftDate}`) : null,
        status: logStatus,
      });
    }
  }
}

const smSeen = new Set();
const smAttendanceUnique = [];
for (const row of smAttendance) {
  const key = `${row.sm_epf}|${row.shift_date}|${row.shift_type}|${row.guard_epf}`;
  if (smSeen.has(key)) continue;
  smSeen.add(key);
  smAttendanceUnique.push(row);
}

console.log(`Inserting ${smAttendanceUnique.length} SM attendance rows…`);
await batchInsert(supabase, 'sm_guard_attendance', smAttendanceUnique, 'sm_guard_attendance');

console.log(`Inserting ${attendanceLogs.length} attendance logs…`);
await batchInsert(supabase, 'attendance_logs', attendanceLogs, 'attendance_logs');

const { count: empCount } = await supabase
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .like('emp_number', `${PREFIX}-%`);

const { count: siteCount } = await supabase
  .from('site_profiles')
  .select('*', { count: 'exact', head: true })
  .like('site_name', `${SITE_NAME_PREFIX}%`);

console.log(`\n✓ Scale demo complete`);
console.log(`  Demo employees (SD-*): ${empCount}`);
console.log(`  Demo sites: ${siteCount}`);
console.log(`  SM attendance rows: ${smAttendanceUnique.length}`);
console.log(`  Attendance logs: ${attendanceLogs.length}`);
console.log('\nTest: Back-office → HR MNR, OM Shift Verification (recent dates)');
console.log('Purge: npm run seed:scale-demo:purge');
