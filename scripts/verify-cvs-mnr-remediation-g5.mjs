/**
 * G-5 — Final remediation report and sign-off.
 *
 * Usage: node scripts/verify-cvs-mnr-remediation-g5.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
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

async function countEmployees(supabase, filters) {
  let q = supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  for (const [key, value] of Object.entries(filters)) {
    q = q.eq(key, value);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  const [total, activeReserve, resignedClearance, activeClearance, smLinks] =
    await Promise.all([
      countEmployees(supabase, {}),
      countEmployees(supabase, { site: 'RESERVE', status: 'ACTIVE' }),
      countEmployees(supabase, { site: 'CLEARANCE', status: 'Resigned' }),
      countEmployees(supabase, { site: 'CLEARANCE', status: 'ACTIVE' }),
      supabase
        .from('sm_guard_assignments')
        .select('guard_epf', { count: 'exact', head: true })
        .then((r) => {
          if (r.error) throw r.error;
          return r.count ?? 0;
        }),
    ]);

  const finalOk =
    total === 5201 &&
    activeReserve === 4185 &&
    resignedClearance === 305 &&
    activeClearance === 0 &&
    smLinks === 529;

  const report = [
    '',
    '================================================================================',
    '=== CVS MNR REMEDIATION — FINAL REPORT (G-5) ===',
    '================================================================================',
    `Completed: ${new Date().toISOString()}`,
    'Tenant: Classic Venture Security (cvs)',
    `company_id: ${CVS_COMPANY_ID}`,
    '',
    'ROOT CAUSE',
    '  Bulk import treated Sheet1 r02/CLEARANCE as ACTIVE payroll staff.',
    '  MNR UI Active/Inactive badges are shift-based (14-day), not pool-based.',
    '',
    'PHASE SUMMARY',
    '  D  Audit & classification — 5201 rows, 305 status mismatches identified',
    '  E  Patch files — 318 emp, 5 sites, 529 SM links; E-4 validation PASS',
    '  F  Live applies:',
    '       F-1  305 CLEARANCE → Resigned',
    '       F-2  4 misplaced guards → HEAD OFFICE',
    '       F-3  Site required_guards refreshed (CLEARANCE=0, RESERVE=4185)',
    '       F-4  SM links 532→529 (removed 3 seed orphans)',
    '       F-5  V.O. phones 8 updated; sm_portal_auth 10/10',
    '       F-6  HO/café rank+group 9 fixes (OD, FM, HR, EA, café)',
    '  G  Verification:',
    '       G-1  Supabase counts PASS',
    '       G-2  HR MNR roster 5201 rows PASS',
    '       G-3  OM/SM portals — sectors A/B/C 62/50/90 PASS',
    '       G-4  Payroll spot-checks 15/15 PASS',
    '',
    'FINAL DB COUNTS',
    `  Total employees:           ${total}`,
    `  ACTIVE on RESERVE:         ${activeReserve}`,
    `  Resigned on CLEARANCE:     ${resignedClearance}`,
    `  ACTIVE on CLEARANCE:       ${activeClearance} (must be 0)`,
    `  sm_guard_assignments:      ${smLinks}`,
    '',
    'KNOWN FOLLOW-UPS (non-blocking)',
    '  · 3 site_profiles assigned_sm_epf vs MNR Loc link drift (OM mismatch badge)',
    '  · 2 client sites without assigned_sm_epf (Kings Hospital, Melstar)',
    '  · 6 TEMPORY pool rows with non-GUARD group (legacy import)',
    '  · 12 ACTIVE employees on non-pseudo sites outside DEPLOYED bucket',
    '  · MNR Active Personnel badge stays low until guards check in',
    '',
    'SCRIPTS',
    '  scripts/build-cvs-mnr-remediation-*.mjs',
    '  scripts/apply-cvs-mnr-remediation-f[1-6].mjs',
    '  scripts/verify-cvs-mnr-remediation-g[1-5].mjs',
    '',
    finalOk ? 'STATUS: REMEDIATION COMPLETE — ALL GATES PASS' : 'STATUS: REVIEW REQUIRED',
    '================================================================================',
    '',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${msg}\n`);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [G-5 FINAL] ${finalOk ? 'REMEDIATION COMPLETE' : 'REVIEW REQUIRED'}\n`,
  );

  if (!finalOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
