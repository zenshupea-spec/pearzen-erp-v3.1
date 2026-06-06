/**
 * Provision a new tenant (or re-seed defaults on an existing company).
 *
 * Run from repo root:
 *   COMPANY_NAME="APEX SECURITY" SLUG=apex-security \
 *   MD_EMAIL=md@apex.com OD_EMAIL=owner@pearzen.com \
 *   npm run db:provision-tenant
 *
 * Re-seed an existing company:
 *   SEED_COMPANY_ID=<uuid> MD_EMAIL=... OD_EMAIL=... npm run db:provision-tenant
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_RANK_PAY_MATRIX = [
  { id: 'rp-1', rankCode: 'CSO', fullTitle: 'Chief Security Officer', basicPay: 35000, annualIncrement: 2000, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-2', rankCode: 'OIC', fullTitle: 'Officer In Charge', basicPay: 33000, annualIncrement: 1800, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-3', rankCode: 'SSO', fullTitle: 'Senior Security Officer', basicPay: 32000, annualIncrement: 1500, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-4', rankCode: 'JSO', fullTitle: 'Junior Security Officer', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
  { id: 'rp-5', rankCode: 'LSO', fullTitle: 'Lady Security Officer', basicPay: 30000, annualIncrement: 1200, salaryType: 'BANK', operationalGroup: 'GUARD_FIELD' },
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
      /* try next */
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyIdArg = process.env.SEED_COMPANY_ID?.trim();
const companyName = (process.env.COMPANY_NAME ?? '').trim().toUpperCase();
const slug = (process.env.SLUG ?? '').trim().toLowerCase();
const mdEmail = (process.env.MD_EMAIL ?? '').trim().toLowerCase();
const odEmail = (process.env.OD_EMAIL ?? '').trim().toLowerCase();

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!mdEmail || !odEmail) {
  console.error('Set MD_EMAIL and OD_EMAIL');
  process.exit(1);
}
if (!companyIdArg && (!companyName || !slug)) {
  console.error('Set COMPANY_NAME + SLUG for a new tenant, or SEED_COMPANY_ID to re-seed an existing one.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const today = new Date().toISOString().split('T')[0];

async function probeColumn(table, col) {
  const { error } = await supabase.from(table).select(col).limit(1);
  return !error;
}

async function upsertExecutive(companyId, companyLabel, empNumber, rank, email) {
  const hasGroup = await probeColumn('employees', 'group');
  const hasEmail = await probeColumn('employees', 'email');

  const row = {
    company_id: companyId,
    emp_number: empNumber,
    full_name: `${companyLabel} — ${rank === 'MD' ? 'MANAGING DIRECTOR' : 'OPERATIONS DIRECTOR'}`,
    rank,
    status: 'ACTIVE',
    date_joined: today,
    salary_type: 'BANK',
  };
  if (hasGroup) row.group = 'HEAD_OFFICE';
  if (hasEmail) row.email = email;

  const { data: existing } = await supabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('emp_number', empNumber)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('employees').update(row).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('employees').insert([row]);
    if (error) throw new Error(error.message);
  }
  console.log(`  ✓ ${empNumber} (${email})`);
}

async function seedMdSettings(companyId) {
  const payload = {
    company_id: companyId,
    vat_rate: 18,
    sscl_rate: 2.5641,
    wb_working_days: 26,
    wb_hours: 200,
    wb_ot_multiplier: 1.5,
    so_working_days: 20,
    so_hours: 180,
    so_ot_multiplier: 1.5,
    statutory_takehome_floor: 40,
    max_deduction_pct: 20,
    default_geofence_radius_m: 150,
    rank_pay_matrix: DEFAULT_RANK_PAY_MATRIX,
    penalty_catalog: [],
    replacement_catalog: [],
  };

  let { error } = await supabase.from('md_settings').upsert(payload, { onConflict: 'company_id' });
  if (error) {
    ({ error } = await supabase.from('md_settings').upsert(
      {
        company_id: companyId,
        vat_rate: 18,
        sscl_rate: 2.5641,
        setting_value: JSON.stringify({ rankPayMatrix: DEFAULT_RANK_PAY_MATRIX }),
      },
      { onConflict: 'company_id' },
    ));
  }
  if (error) throw new Error(error.message);
  console.log('  ✓ md_settings defaults');
}

let companyId = companyIdArg;

if (!companyId) {
  const { data: company, error } = await supabase
    .from('companies')
    .insert([{ name: companyName, slug, is_suspended: false }])
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  companyId = company.id;
  console.log(`\nCreated company ${companyName} (${companyId})`);
} else {
  const { data: company, error } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  console.log(`\nRe-seeding company ${company?.name ?? companyId}`);
}

const label = companyName || (await supabase.from('companies').select('name').eq('id', companyId).maybeSingle()).data?.name || 'TENANT';
const companyLabel = String(label).toUpperCase();

console.log('Seeding executives…');
await upsertExecutive(companyId, companyLabel, 'MD-001', 'MD', mdEmail);
await upsertExecutive(companyId, companyLabel, 'OD-001', 'OD', odEmail);

console.log('Seeding MD settings…');
await seedMdSettings(companyId);

console.log(`
Done. Next steps:
  1. MD signs in at /login/head-office with ${mdEmail}
  2. Executive Settings → customize rank pay, invoice letterhead
  3. FM Sites or Executive Sites → register real sites (saved to site_profiles)
  4. HR Onboarding → induct guards & SMs (saved to employees with company_id)
  5. OM verification queue → live once guards check in via Field PWA
`);
