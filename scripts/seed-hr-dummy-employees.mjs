/**
 * Seed diverse dummy employees for HR / Master Nominal Roll testing.
 * Run: npm run seed:hr-employees
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CLASSIC_VENTURE_COMPANY_ID = '9111dd55-9935-4e26-a630-60e36dcb57b5';

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
const today = new Date().toISOString().split('T')[0];
const PHOTO = (seed) => `https://picsum.photos/seed/pearzen-${seed}/400/400`;

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;

/** Columns that may not exist on older DBs — probed before write */
const OPTIONAL_COLUMNS = [
  'group',
  'site',
  'mod_expiry',
  'police_expiry',
  'base_salary',
  'epf_no',
  'passport_no',
];

const presentOptional = new Set();
for (const col of OPTIONAL_COLUMNS) {
  const { error } = await supabase.from('employees').select(col).limit(1);
  if (!error) presentOptional.add(col);
}

const hasBasicSalary = presentOptional.has('base_salary');
const hasEpfNo = presentOptional.has('epf_no');
const hasEpfNum = !hasEpfNo;
let hasEpfNumConfirmed = false;
if (!hasEpfNo) {
  const { error } = await supabase.from('employees').select('epf_num').limit(1);
  hasEpfNumConfirmed = !error;
}

function buildPayload(row) {
  const payload = { ...row, company_id: companyId };

  if (row.epf_no != null) {
    if (hasEpfNo) payload.epf_no = row.epf_no;
    else if (hasEpfNumConfirmed) payload.epf_num = row.epf_no;
    delete payload.epf_no;
  }

  const salary = row.basic_salary ?? row.base_salary;
  if (salary != null) {
    if (hasBasicSalary) {
      payload.base_salary = salary;
      delete payload.basic_salary;
    } else {
      payload.basic_salary = salary;
    }
  }

  for (const key of Object.keys(payload)) {
    if (OPTIONAL_COLUMNS.includes(key) && !presentOptional.has(key)) {
      delete payload[key];
    }
  }

  return payload;
}

/** @type {Record<string, unknown>[]} */
const dummyEmployees = [
  {
    emp_number: 'D-101',
    full_name: 'PERERA K.A.N.',
    rank: 'OIC',
    group: 'GUARD',
    site: 'Lanka Hospitals',
    status: 'ACTIVE',
    phone: '+94771234501',
    dob: '1988-04-12',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 12, TEMPLE ROAD, NUGEGODA',
    date_joined: '2022-03-15',
    basic_salary: 72000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '052',
    account_number: '8001234567',
    epf_yn: true,
    epf_no: 'EPF-D101',
    mod_expiry: addMonths(today, 8),
    police_expiry: addMonths(today, 10),
    id_photo_url: PHOTO('d101'),
  },
  {
    emp_number: 'D-102',
    full_name: 'SILVA R.M.',
    rank: 'CSO',
    group: 'GUARD',
    site: 'Commercial Bank HQ',
    status: 'ACTIVE',
    phone: '+94771234502',
    dob: '1995-08-22',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'CATHOLIC',
    home_address: 'NO 45, GALLE ROAD, MOUNT LAVINIA',
    date_joined: '2023-01-10',
    basic_salary: 48000,
    salary_type: 'BANK',
    bank_name: 'HNB',
    branch_code: '101',
    account_number: '0012345678',
    epf_yn: true,
    epf_no: 'EPF-D102',
    mod_expiry: addMonths(today, 2),
    police_expiry: addMonths(today, 6),
    id_photo_url: PHOTO('d102'),
  },
  {
    emp_number: 'D-103',
    full_name: 'FERNANDO S.P.',
    rank: 'JSO',
    group: 'GUARD',
    site: 'Cargills HQ',
    status: 'ACTIVE',
    phone: '+94771234503',
    dob: '1999-11-03',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 7, STATION ROAD, PANADURA',
    date_joined: '2024-06-01',
    basic_salary: 42000,
    salary_type: 'CASH',
    epf_yn: false,
    mod_expiry: addMonths(today, -10),
    police_expiry: addMonths(today, 12),
    id_photo_url: PHOTO('d103'),
  },
  {
    emp_number: 'D-104',
    full_name: 'JAYAWARDENA T.L.',
    rank: 'SGT',
    group: 'GUARD',
    site: 'BOC Main Branch',
    status: 'Resigned',
    phone: '+94771234504',
    dob: '1985-02-18',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    date_joined: '2019-09-20',
    date_resigned: '2025-12-31',
    resignation_type: 'VOLUNTARY',
    basic_salary: 55000,
    salary_type: 'BANK',
    epf_yn: true,
    id_photo_url: PHOTO('d104'),
  },
  {
    emp_number: 'D-105',
    full_name: 'RATNAYAKE M.D.',
    rank: 'CPL',
    group: 'GUARD',
    site: 'Hemas Holdings',
    status: 'ACTIVE',
    phone: '+94771234505',
    dob: '1992-07-30',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 22, KANDY ROAD, KADAWATHA',
    date_joined: '2021-11-05',
    basic_salary: 50000,
    salary_type: 'BANK',
    bank_name: 'SAMPATH BANK',
    branch_code: '045',
    account_number: '1122334455',
    epf_yn: true,
    epf_no: 'EPF-D105',
    mod_expiry: addMonths(today, 14),
    police_expiry: addMonths(today, 1),
    id_photo_url: PHOTO('d105'),
  },
  {
    emp_number: 'D-106',
    full_name: 'WIJESURIYA H.K.',
    rank: 'SM',
    group: 'SECTOR_MANAGER',
    status: 'ACTIVE',
    phone: '+94771234506',
    dob: '1980-12-01',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 3, LAKE DRIVE, COLOMBO 08',
    date_joined: '2018-04-02',
    basic_salary: 95000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '001',
    account_number: '9988776655',
    epf_yn: true,
    epf_no: 'EPF-D106',
    id_photo_url: PHOTO('d106'),
  },
  {
    emp_number: 'D-107',
    full_name: 'AMARASINGHE P.R.',
    rank: 'GARD',
    group: 'GUARD',
    site: 'Lanka Hospitals',
    status: 'ACTIVE',
    phone: '+94771234507',
    dob: '1998-05-14',
    gender: 'FEMALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 18, HILL STREET, KANDY',
    date_joined: '2025-02-01',
    basic_salary: 38000,
    salary_type: 'BANK',
    bank_name: 'BOC',
    branch_code: '210',
    account_number: '5566778899',
    epf_yn: true,
    epf_no: 'EPF-D107',
    id_photo_url: PHOTO('d107'),
  },
  {
    emp_number: 'D-108',
    full_name: 'BANDARA K.S.',
    rank: 'AOIC',
    group: 'GUARD',
    site: 'Commercial Bank HQ',
    status: 'ACTIVE',
    phone: '+94771234508',
    dob: '1990-09-09',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    religion: 'BUDDHIST',
    home_address: 'NO 55, MAIN STREET, MATARA',
    date_joined: '2020-07-14',
    basic_salary: 65000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '078',
    account_number: '3344556677',
    epf_yn: true,
    epf_no: 'EPF-D108',
    id_photo_url: PHOTO('d108'),
  },
  {
    emp_number: 'D-109',
    full_name: 'KARUNARATNE L.W.',
    rank: 'JSO',
    group: 'GUARD',
    site: 'Cargills HQ',
    status: 'Terminated',
    phone: '+94771234509',
    dob: '1994-03-25',
    gender: 'MALE',
    nationality: 'SRI LANKAN',
    date_joined: '2023-08-15',
    date_resigned: '2026-01-20',
    resignation_type: 'DISCIPLINARY',
    basic_salary: 40000,
    salary_type: 'BANK',
    epf_yn: true,
    id_photo_url: PHOTO('d109'),
  },
  {
    emp_number: 'G-001',
    full_name: 'TEST GUARD ONE',
    rank: 'JSO',
    group: 'GUARD',
    site: 'Lanka Hospitals',
    status: 'ACTIVE',
    phone: '+94770000011',
    date_joined: '2024-02-01',
    basic_salary: 45000,
    salary_type: 'BANK',
    epf_yn: true,
    epf_no: 'EPF-G001',
    mod_expiry: addMonths(today, 5),
    police_expiry: addMonths(today, 5),
    id_photo_url: PHOTO('g001'),
  },
  {
    emp_number: 'G-002',
    full_name: 'TEST GUARD TWO',
    rank: 'JSO',
    group: 'GUARD',
    site: 'BOC Main Branch',
    status: 'ACTIVE',
    phone: '+94770000012',
    date_joined: '2024-03-01',
    basic_salary: 44000,
    salary_type: 'BANK',
    epf_yn: true,
    id_photo_url: PHOTO('g002'),
  },
  {
    emp_number: 'SM-001',
    full_name: 'TEST SECTOR MANAGER ONE',
    rank: 'SM',
    group: 'SECTOR_MANAGER',
    status: 'ACTIVE',
    phone: '+94770000001',
    date_joined: '2017-01-01',
    basic_salary: 90000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    account_number: '7700000001',
    epf_yn: true,
    epf_no: 'EPF-SM001',
    id_photo_url: PHOTO('sm001'),
  },
  {
    emp_number: 'SM-002',
    full_name: 'TEST SECTOR MANAGER TWO',
    rank: 'SM',
    group: 'SECTOR_MANAGER',
    status: 'ACTIVE',
    phone: '+94770000002',
    date_joined: '2018-06-01',
    basic_salary: 92000,
    salary_type: 'BANK',
    bank_name: 'HNB',
    account_number: '7700000002',
    epf_yn: true,
    epf_no: 'EPF-SM002',
    id_photo_url: PHOTO('sm002'),
  },
  {
    emp_number: 'SM-003',
    full_name: 'TEST SECTOR MANAGER THREE',
    rank: 'SM',
    group: 'SECTOR_MANAGER',
    status: 'ACTIVE',
    phone: '+94770000003',
    date_joined: '2019-03-10',
    basic_salary: 91000,
    salary_type: 'BANK',
    bank_name: 'BOC',
    account_number: '7700000003',
    epf_yn: true,
    epf_no: 'EPF-SM003',
    id_photo_url: PHOTO('sm003'),
  },
  {
    emp_number: 'OM-001',
    full_name: 'TEST OPERATIONS MANAGER',
    rank: 'OM',
    group: 'HEAD_OFFICE',
    status: 'ACTIVE',
    phone: '+94770000101',
    date_joined: '2016-01-01',
    basic_salary: 120000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    account_number: '7700000101',
    epf_yn: true,
    epf_no: 'EPF-OM001',
    id_photo_url: PHOTO('om001'),
  },
  {
    emp_number: 'TM-001',
    full_name: 'TEST TERRITORY MANAGER',
    rank: 'TM',
    group: 'HEAD_OFFICE',
    status: 'ACTIVE',
    phone: '+94770000102',
    date_joined: '2016-02-01',
    basic_salary: 115000,
    salary_type: 'BANK',
    bank_name: 'COMMERCIAL BANK',
    account_number: '7700000102',
    epf_yn: true,
    epf_no: 'EPF-TM001',
    id_photo_url: PHOTO('tm001'),
  },
  {
    emp_number: 'G1234',
    full_name: 'TEST GUARD 1234',
    rank: 'JSO',
    group: 'GUARD',
    site: 'Hemas Holdings',
    status: 'ACTIVE',
    phone: '+94770001234',
    date_joined: '2024-01-15',
    basic_salary: 45000,
    salary_type: 'BANK',
    epf_yn: true,
    mod_expiry: addMonths(today, 20),
    police_expiry: addMonths(today, 20),
    id_photo_url: PHOTO('g1234'),
  },
];

let inserted = 0;
let updated = 0;

console.log(`Seeding company ${companyId}`);
console.log(`Optional columns: ${[...presentOptional].join(', ') || '(none)'}`);

for (const row of dummyEmployees) {
  const { data: existing } = await supabase
    .from('employees')
    .select('emp_number')
    .eq('emp_number', row.emp_number)
    .maybeSingle();

  const payload = buildPayload(row);

  if (existing) {
    const { error } = await supabase
      .from('employees')
      .update(payload)
      .eq('emp_number', row.emp_number);
    if (error) {
      console.error(`Update failed for ${row.emp_number}:`, error.message);
    } else {
      updated++;
      console.log(`Updated ${row.emp_number} — ${row.full_name}`);
    }
  } else {
    const { error } = await supabase.from('employees').insert(payload);
    if (error) {
      console.error(`Insert failed for ${row.emp_number}:`, error.message);
    } else {
      inserted++;
      console.log(`Inserted ${row.emp_number} — ${row.full_name}`);
    }
  }
}

const activeGuards = ['D-101', 'D-102', 'D-105', 'G-001', 'G1234'];
const checkInTime = `${today}T00:35:00+00:00`;

await supabase
  .from('attendance_logs')
  .delete()
  .gte('device_time', `${today}T00:00:00`)
  .lt('device_time', `${today}T23:59:59.999`)
  .like('sync_type', 'SEED_HR_DUMMY%');

for (const emp of activeGuards) {
  const { error } = await supabase.from('attendance_logs').insert({
    emp_number: emp,
    company_id: companyId,
    action_type: 'CHECK_IN',
    device_time: checkInTime,
    sync_type: 'SEED_HR_DUMMY',
    om_status: 'PENDING',
    status: 'PENDING',
    photo_url: PHOTO(`shift-${emp}`),
  });
  if (error) console.error(`Shift seed failed for ${emp}:`, error.message);
  else console.log(`Shift check-in seeded for ${emp}`);
}

/** Sites for OM assignment / SM linkage (MNR site names must match). */
const seedSites = [
  { site_name: 'Lanka Hospitals', site_type: 'HOTEL', address: 'Colombo 05', required_guards: 4, assigned_sm_epf: 'SM-001' },
  { site_name: 'Commercial Bank HQ', site_type: 'BANK', address: 'Colombo 01', required_guards: 3, assigned_sm_epf: 'SM-002' },
  { site_name: 'BOC Main Branch', site_type: 'BANK', address: 'Colombo 11', required_guards: 2, assigned_sm_epf: 'SM-003' },
  { site_name: 'Cargills HQ', site_type: 'OFFICE', address: 'Colombo 03', required_guards: 2, assigned_sm_epf: null },
  { site_name: 'Hemas Holdings', site_type: 'OFFICE', address: 'Colombo 03', required_guards: 2, assigned_sm_epf: null },
];

const SITE_OPTIONAL_COLUMNS = ['required_guards', 'assigned_sm_epf', 'address'];
const presentSiteOptional = new Set();
for (const col of SITE_OPTIONAL_COLUMNS) {
  const { error } = await supabase.from('site_profiles').select(col).limit(1);
  if (!error) presentSiteOptional.add(col);
}

function buildSitePayload(row) {
  const payload = { site_name: row.site_name, site_type: row.site_type, company_id: companyId };
  for (const key of SITE_OPTIONAL_COLUMNS) {
    if (key in row && presentSiteOptional.has(key)) payload[key] = row[key];
  }
  return payload;
}

let sitesUpserted = 0;
for (const site of seedSites) {
  const { data: existing } = await supabase
    .from('site_profiles')
    .select('id')
    .eq('site_name', site.site_name)
    .eq('company_id', companyId)
    .maybeSingle();

  const payload = buildSitePayload(site);
  if (existing?.id) {
    const { error } = await supabase.from('site_profiles').update(payload).eq('id', existing.id);
    if (!error) sitesUpserted++;
    else console.error(`Site update failed for ${site.site_name}:`, error.message);
  } else {
    const { error } = await supabase.from('site_profiles').insert(payload);
    if (!error) sitesUpserted++;
    else console.error(`Site insert failed for ${site.site_name}:`, error.message);
  }
}
console.log(`Sites synced: ${sitesUpserted}/${seedSites.length}`);

const { count } = await supabase
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId);

console.log(`\nDone — ${inserted} inserted, ${updated} updated. Employees for company: ${count}`);
console.log('Test chain: MNR → OM site assignment → SM roster → TM verify → FM payroll');
console.log('Sector managers: SM-001, SM-002, SM-003 | Portal roles: OM-001, TM-001 (employees + users table for login)');
