/**
 * Backfill md_settings.portal_rbac_matrix for non-locked HEAD_OFFICE staff.
 * Promotes HR-GEOTEST-001 to HEAD_OFFICE with hr-only matrix for RBAC E2E.
 *
 * Run: npm run backfill:portal-rbac-matrix
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const HR_GEOTEST_EMP_NUMBER = 'HR-GEOTEST-001';

const PORTAL_IDS = [
  'om_command',
  'tm_command',
  'sm_portal',
  'checkin_app',
  'finance',
  'deductions',
  'invoice_desk',
  'hr_desk',
  'vacancies',
  'client_portal',
  'cafe',
  'audit_ledger',
];

const LOCKED_RANKS = new Set(['MD', 'OD', 'OM', 'TM']);

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

function makeBlankRow() {
  return Object.fromEntries(PORTAL_IDS.map((id) => [id, 'NONE']));
}

function defaultRowForRank(rank) {
  const row = makeBlankRow();
  const normalized = String(rank ?? '').trim().toUpperCase();
  if (normalized === 'HR') {
    row.hr_desk = 'FULL';
    row.vacancies = 'FULL';
    row.cafe = 'FULL';
    row.audit_ledger = 'READ';
    return row;
  }
  if (normalized === 'FM') {
    row.finance = 'FULL';
    row.deductions = 'FULL';
    row.invoice_desk = 'FULL';
    row.hr_desk = 'READ';
    return row;
  }
  if (normalized === 'EA') {
    row.finance = 'READ';
    row.hr_desk = 'READ';
    row.invoice_desk = 'READ';
    row.audit_ledger = 'FULL';
    row.client_portal = 'FULL';
    return row;
  }
  return row;
}

function hrOnlyDemoRow() {
  const row = makeBlankRow();
  row.hr_desk = 'FULL';
  row.vacancies = 'FULL';
  return row;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const admin = createClient(url, serviceKey);

console.log(`Backfilling portal RBAC matrix for ${companyId}`);

const { data: geotest } = await admin
  .from('employees')
  .select('id, full_name, rank, group')
  .eq('company_id', companyId)
  .eq('emp_number', HR_GEOTEST_EMP_NUMBER)
  .maybeSingle();

if (geotest?.id) {
  const { error: groupError } = await admin
    .from('employees')
    .update({ group: 'HEAD_OFFICE' })
    .eq('id', geotest.id);
  if (groupError) {
    console.error(`  ✗ ${HR_GEOTEST_EMP_NUMBER} group update:`, groupError.message);
  } else {
    console.log(`  ✓ ${HR_GEOTEST_EMP_NUMBER} → HEAD_OFFICE (rbacGated demo)`);
  }
}

const { data: staffRows, error: staffError } = await admin
  .from('employees')
  .select('id, full_name, rank, status, group')
  .eq('company_id', companyId)
  .eq('group', 'HEAD_OFFICE')
  .not('status', 'in', '("RESIGNED","TERMINATED")');

if (staffError) {
  console.error('employees:', staffError.message);
  process.exit(1);
}

const { data: settingsRow, error: settingsError } = await admin
  .from('md_settings')
  .select('portal_rbac_matrix')
  .eq('company_id', companyId)
  .maybeSingle();

if (settingsError && !settingsError.message.includes('portal_rbac_matrix')) {
  console.error('md_settings:', settingsError.message);
  process.exit(1);
}

const existing =
  settingsRow?.portal_rbac_matrix &&
  typeof settingsRow.portal_rbac_matrix === 'object' &&
  !Array.isArray(settingsRow.portal_rbac_matrix)
    ? { ...settingsRow.portal_rbac_matrix }
    : {};

let added = 0;
let skippedLocked = 0;

for (const person of staffRows ?? []) {
  const rank = String(person.rank ?? '').trim().toUpperCase();
  if (LOCKED_RANKS.has(rank)) {
    skippedLocked += 1;
    continue;
  }
  if (existing[person.id]) {
    console.log(`  · ${person.full_name} — matrix row already present`);
    continue;
  }
  const row =
    person.id === geotest?.id ? hrOnlyDemoRow() : defaultRowForRank(rank);
  existing[person.id] = row;
  added += 1;
  console.log(`  ✓ ${person.full_name} (${rank || 'STAFF'}) — portal RBAC row added`);
}

const { error: upsertError } = settingsRow
  ? await admin
      .from('md_settings')
      .update({
        portal_rbac_matrix: existing,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
  : await admin.from('md_settings').upsert(
      {
        company_id: companyId,
        portal_rbac_matrix: existing,
        default_geofence_radius_m: 25,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' },
    );

if (upsertError) {
  console.error('md_settings upsert:', upsertError.message);
  process.exit(1);
}

console.log(
  `\nDone. rows_added=${added} locked_skipped=${skippedLocked} total_matrix_keys=${Object.keys(existing).length}`,
);
