#!/usr/bin/env npx tsx
/**
 * Bulk roster Step 17 — live staging import + DB verification (local / staging Supabase).
 *
 * Usage:
 *   npm run verify:cvs-bulk-roster-staging-live
 *   npm run verify:cvs-bulk-roster-staging-live -- --cleanup
 *
 * Writes: audit-evidence/cvs/bulk-roster-staging-live.json
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { buildBulkDataWorkbook } from '../apps/back-office/lib/bulk-data-workbook.ts';
import {
  collectSmLinksFromRosterRows,
  deriveSitesFromRosterRows,
  employeeBalanceDebtPatch,
  employeeDbPayloadFromUnified,
  ensureRanksFromRosterRows,
  mapUnifiedEmployeeExportRow,
  mapUnifiedRosterRow,
  parseBulkDataWorkbook,
  validateBulkImport,
} from '../apps/back-office/lib/bulk-data-import.ts';
import { encryptEmployeePiiRecord } from '../apps/back-office/lib/employee-pii.ts';
import {
  clampGeofenceRadiusM,
  DEFAULT_GEOFENCE_RADIUS_M,
} from '../apps/back-office/lib/site-geofence.ts';
import { parseRankPayMatrix } from '../packages/rank-pay-matrix/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/bulk-roster-staging-live.json');
const TEST_PREFIX = `BRSTG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const SHARED_SITE = `${TEST_PREFIX} Staging Verify Gate`;
const TEST_RANK = `${TEST_PREFIX}_RANK`;

const args = new Set(process.argv.slice(2));
const cleanupOnly = args.has('--cleanup');

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(ROOT, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

function buildTestRows(): Record<string, unknown>[] {
  return [
    {
      emp_number: `${TEST_PREFIX}-G1`,
      epf_no: `${TEST_PREFIX}01`,
      full_name: `${TEST_PREFIX} GUARD ONE`,
      group: 'GUARD',
      rank: TEST_RANK,
      rank_title: `${TEST_PREFIX} TEST RANK`,
      rank_basic_pay: 40500,
      rank_salary_type: 'BANK',
      rank_operational_group: 'GUARD_FIELD',
      site_name: SHARED_SITE,
      site_type: 'BANK',
      site_address: 'NO 1, TEST ROAD, COLOMBO',
      required_guards: 3,
      assigned_sm_epf: '13650',
      verification_mode: 'B',
      status: 'ACTIVE',
      salary_type: 'BANK',
      base_salary: 42000,
      uniform_outstanding_lkr: 1500,
      meals_advance_other_outstanding_lkr: 800,
    },
    {
      emp_number: `${TEST_PREFIX}-G2`,
      epf_no: `${TEST_PREFIX}02`,
      full_name: `${TEST_PREFIX} GUARD TWO`,
      group: 'GUARD',
      rank: 'JSO',
      site_name: SHARED_SITE,
      site_type: 'BANK',
      assigned_sm_epf: '13650',
      verification_mode: 'B',
      status: 'ACTIVE',
      salary_type: 'BANK',
      base_salary: 42000,
      uniform_outstanding_lkr: 2000,
    },
    {
      emp_number: `${TEST_PREFIX}-G3`,
      epf_no: `${TEST_PREFIX}03`,
      full_name: `${TEST_PREFIX} GUARD THREE`,
      group: 'GUARD',
      rank: 'JSO',
      site_name: SHARED_SITE,
      site_type: 'BANK',
      assigned_sm_epf: '13650',
      verification_mode: 'B',
      status: 'ACTIVE',
      salary_type: 'BANK',
      base_salary: 42000,
      uniform_outstanding_lkr: 2500,
    },
  ];
}

async function loadRankMatrix(db: SupabaseClient) {
  const { data, error } = await db
    .from('md_settings')
    .select('id, rank_pay_matrix')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('md_settings row missing for CVS');
  return { settingsId: data.id as string, matrix: parseRankPayMatrix(data.rank_pay_matrix) };
}

async function saveRankMatrix(db: SupabaseClient, matrix: ReturnType<typeof parseRankPayMatrix>) {
  const { error } = await db
    .from('md_settings')
    .update({ rank_pay_matrix: matrix })
    .eq('company_id', CVS_COMPANY_ID);
  if (error) throw error;
}

async function upsertDerivedSite(
  db: SupabaseClient,
  mapped: ReturnType<typeof deriveSitesFromRosterRows>[number],
) {
  const { siteName, payload } = mapped;
  const record: Record<string, unknown> = {
    ...payload,
    company_id: CVS_COMPANY_ID,
    geofence_radius: clampGeofenceRadiusM(
      (payload.geofence_radius as number | null) ?? DEFAULT_GEOFENCE_RADIUS_M,
    ),
  };

  const { data: existing } = await db
    .from('site_profiles')
    .select('id')
    .eq('site_name', siteName)
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from('site_profiles').update(record).eq('id', existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: inserted, error } = await db
    .from('site_profiles')
    .insert(record)
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id as string;
}

async function upsertEmployee(db: SupabaseClient, row: Record<string, unknown>) {
  const { employee } = mapUnifiedRosterRow(row);
  const { empNumber, payload } = employee;
  const record = encryptEmployeePiiRecord(employeeDbPayloadFromUnified(employee, CVS_COMPANY_ID));

  const { data: existing } = await db
    .from('employees')
    .select('id')
    .eq('emp_number', empNumber)
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await db.from('employees').update(record).eq('id', existing.id);
    if (error) throw error;
    return existing.id as string;
  }

  const { data: inserted, error } = await db
    .from('employees')
    .insert(record)
    .select('id')
    .single();
  if (error) throw error;
  return inserted.id as string;
}

async function applyDebts(db: SupabaseClient, employeeId: string, row: Record<string, unknown>) {
  const { debts } = mapUnifiedRosterRow(row);
  const { error } = await db
    .from('employees')
    .update(employeeBalanceDebtPatch(debts))
    .eq('id', employeeId)
    .eq('company_id', CVS_COMPANY_ID);
  if (error) throw error;
}

async function upsertSmLink(
  db: SupabaseClient,
  link: { sm_epf: string; guard_epf: string },
) {
  const { error } = await db
    .from('sm_guard_assignments')
    .upsert({ sm_epf: link.sm_epf, guard_epf: link.guard_epf }, { onConflict: 'sm_epf,guard_epf' });
  if (error) throw error;
}

async function cleanupTestData(db: SupabaseClient) {
  const { data: employees } = await db
    .from('employees')
    .select('id, emp_number')
    .eq('company_id', CVS_COMPANY_ID)
    .like('emp_number', 'BRSTG-%');

  for (const row of employees ?? []) {
    await db.from('sm_guard_assignments').delete().eq('guard_epf', row.emp_number);
    await db.from('employees').delete().eq('id', row.id);
  }

  await db
    .from('site_profiles')
    .delete()
    .eq('company_id', CVS_COMPANY_ID)
    .like('site_name', 'BRSTG%');
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const db = createClient(url, key, { auth: { persistSession: false } });
  const runAt = new Date().toISOString();
  const checks: { id: string; label: string; status: 'PASS' | 'FAIL'; detail?: string }[] = [];

  if (cleanupOnly) {
    await cleanupTestData(db);
    console.log('Cleaned up BRSTG-* staging test rows.');
    return;
  }

  await cleanupTestData(db);

  const rows = buildTestRows();
  const { base64: exportBase64 } = await buildBulkDataWorkbook({
    mode: 'export',
    employees: rows,
    sites: [],
  });
  const buffer = Buffer.from(exportBase64, 'base64');
  const parsed = parseBulkDataWorkbook(buffer);
  checks.push({
    id: 'M.1',
    label: 'Single Roster sheet workbook',
    status: parsed.rows.length === 3 ? 'PASS' : 'FAIL',
    detail: `${parsed.rows.length} rows`,
  });

  let { matrix } = await loadRankMatrix(db);
  const validationErrors = validateBulkImport(parsed, matrix);
  checks.push({
    id: 'M.2',
    label: '3 guards same site_name validate',
    status: validationErrors.length === 0 ? 'PASS' : 'FAIL',
    detail: validationErrors.join('; ') || undefined,
  });
  if (validationErrors.length) throw new Error(validationErrors.join('\n'));

  const { createdRankCodes, matrix: nextMatrix } = ensureRanksFromRosterRows(rows, matrix);
  if (createdRankCodes.length) {
    await saveRankMatrix(db, nextMatrix);
    matrix = nextMatrix;
  }
  checks.push({
    id: 'M.9',
    label: 'Unknown rank auto-created in matrix',
    status: createdRankCodes.includes(TEST_RANK) ? 'PASS' : 'FAIL',
    detail: createdRankCodes.join(', ') || 'none',
  });

  const sites = deriveSitesFromRosterRows(rows);
  for (const site of sites) {
    await upsertDerivedSite(db, site);
  }

  const employeeIds: string[] = [];
  for (const row of rows) {
    const id = await upsertEmployee(db, row);
    await applyDebts(db, id, row);
    employeeIds.push(id);
  }

  for (const link of collectSmLinksFromRosterRows(rows)) {
    await upsertSmLink(db, link);
  }

  const { data: siteRows } = await db
    .from('site_profiles')
    .select('id, site_name')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('site_name', SHARED_SITE);
  checks.push({
    id: 'M.6',
    label: '1 site_profiles row for shared site_name',
    status: siteRows?.length === 1 ? 'PASS' : 'FAIL',
    detail: `count=${siteRows?.length ?? 0}`,
  });

  const { data: empRows } = await db
    .from('employees')
    .select('emp_number, site, group, uniform_balance, accom_balance')
    .eq('company_id', CVS_COMPANY_ID)
    .in('emp_number', rows.map((r) => r.emp_number as string));

  const siteOk =
    empRows?.length === 3 && empRows.every((e) => e.site === SHARED_SITE && e.group === 'GUARD');
  checks.push({
    id: 'M.7',
    label: '3 employees.site set + GUARD group (OM roster)',
    status: siteOk ? 'PASS' : 'FAIL',
    detail: empRows?.map((e) => `${e.emp_number}@${e.site}`).join(', '),
  });

  const uniformOk = Number(empRows?.[0]?.uniform_balance) === 1500;
  checks.push({
    id: 'M.10',
    label: 'uniform_outstanding_lkr → employees.uniform_balance',
    status: uniformOk ? 'PASS' : 'FAIL',
    detail: `uniform_balance=${empRows?.[0]?.uniform_balance}`,
  });

  const exported = rows.map((row, index) => {
    const emp = empRows?.find((e) => e.emp_number === row.emp_number);
    return mapUnifiedEmployeeExportRow(
      {
        id: employeeIds[index],
        emp_number: row.emp_number,
        full_name: row.full_name,
        group: row.group,
        rank: row.rank,
        site: SHARED_SITE,
        uniform_balance: emp?.uniform_balance ?? 0,
        accom_balance: emp?.accom_balance ?? 0,
      },
      sites[0]?.payload,
    );
  });

  const { base64: roundTripBase64 } = await buildBulkDataWorkbook({
    mode: 'export',
    employees: exported,
    sites: [],
  });
  const roundTrip = parseBulkDataWorkbook(Buffer.from(roundTripBase64, 'base64'));
  const roundTripErrors = validateBulkImport(roundTrip, matrix);
  const roundTripOk =
    roundTripErrors.length === 0 &&
    roundTrip.rows.length === 3 &&
    roundTrip.rows.every((r) => r.site_name === SHARED_SITE);
  checks.push({
    id: 'M.12',
    label: 'Export round-trip re-parse + validate',
    status: roundTripOk ? 'PASS' : 'FAIL',
    detail: roundTripErrors.join('; ') || undefined,
  });

  const failed = checks.filter((c) => c.status === 'FAIL');
  const evidence = {
    step: 'bulk-roster-17-live',
    runAt,
    testPrefix: TEST_PREFIX,
    sharedSite: SHARED_SITE,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    checks,
    note: 'M.8 OM UI and M.11 FM offboarding queue require manual portal pass; DB columns verified here.',
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log('\n=== Bulk roster live staging verification ===\n');
  for (const check of checks) {
    console.log(`${check.status === 'PASS' ? '✓' : '✗'} ${check.id} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  console.log(`\nEvidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);

  if (failed.length) {
    console.error(`\nFAIL — ${failed.length} check(s)`);
    process.exit(1);
  }

  console.log('\nPASS — live DB staging checks complete (portal UI M.8 / M.11 still manual).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
