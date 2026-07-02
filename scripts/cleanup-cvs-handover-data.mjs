#!/usr/bin/env node
/**
 * H-6 — audit + one-time CVS production data cleanup.
 *
 * Usage:
 *   npm run audit:cvs-data-cleanup              # audit only (default)
 *   npm run audit:cvs-data-cleanup -- --apply   # apply fixes on production
 *
 * Fixes:
 *   1. Cancel orphan sm_guard_attendance for resigned MNR-R001 (post-resign SUBMITTED)
 *   2. Dismiss seed PENDING_RESOLUTION attendance_logs (sync_type SEED_MASTER_HUB%)
 *   3. Report TEMP-* shadow roster / attendance orphans
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(ROOT, 'audit-evidence/cvs');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const RESIGNED_GUARD_EMP = 'MNR-R001';

const applyMode = process.argv.includes('--apply');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

function writeEvidence(report) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = join(EVIDENCE_DIR, 'h-6-data-cleanup-audit.txt');
  writeFileSync(path, `${report.join('\n')}\n`);
  return path;
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const report = [
    'CVS Handover H-6 — production data cleanup',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Mode: ${applyMode ? 'APPLY' : 'AUDIT'}`,
    '',
  ];

  console.log(`\nCVS data cleanup (H-6) — ${applyMode ? 'APPLY' : 'audit only'}\n`);

  const { data: guard, error: guardErr } = await supabase
    .from('employees')
    .select('id, emp_number, epf_no, status, date_resigned, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('emp_number', RESIGNED_GUARD_EMP)
    .maybeSingle();

  if (guardErr) throw new Error(guardErr.message);

  report.push('MNR-R001 employee');
  if (!guard) {
    report.push('  NOT FOUND — skip roster cancel');
    console.log('  ⚠ MNR-R001 employee not found');
  } else {
    report.push(`  id: ${guard.id}`);
    report.push(`  status: ${guard.status}`);
    report.push(`  date_resigned: ${guard.date_resigned ?? 'null'}`);
    console.log(`  MNR-R001: ${guard.status}, resigned ${guard.date_resigned ?? '?'}`);

    const guardKeys = [...new Set([guard.emp_number, guard.epf_no, RESIGNED_GUARD_EMP].filter(Boolean))];
    const resignDate = guard.date_resigned ?? '2026-05-15';

    const { data: allMnrRows } = await supabase
      .from('sm_guard_attendance')
      .select('id, guard_epf, shift_date, shift_type, status, site_name')
      .in('guard_epf', guardKeys);

    report.push(`  All MNR-R001 sm_guard_attendance: ${allMnrRows?.length ?? 0}`);
    for (const row of allMnrRows ?? []) {
      report.push(`    · ${row.shift_date} ${row.status} ${row.guard_epf}`);
    }

    const { data: orphanRows, error: orphanErr } = await supabase
      .from('sm_guard_attendance')
      .select('id, guard_epf, shift_date, shift_type, status, site_name, sm_epf')
      .in('guard_epf', guardKeys)
      .gt('shift_date', resignDate)
      .in('status', ['SUBMITTED', 'PENDING']);

    if (orphanErr) throw new Error(orphanErr.message);

    report.push(`  Orphan sm_guard_attendance (post-resign SUBMITTED/PENDING): ${orphanRows?.length ?? 0}`);
    for (const row of orphanRows ?? []) {
      report.push(
        `    · ${row.id} ${row.shift_date} ${row.shift_type} ${row.status} @ ${row.site_name}`,
      );
    }
    console.log(`  Orphan SM rows to cancel: ${orphanRows?.length ?? 0}`);

    if (applyMode && orphanRows?.length) {
      const ids = orphanRows.map((r) => r.id);
      const { error: cancelErr } = await supabase
        .from('sm_guard_attendance')
        .update({ status: 'CANCELLED' })
        .in('id', ids);

      if (cancelErr) throw new Error(cancelErr.message);
      report.push(`  APPLIED: cancelled ${ids.length} sm_guard_attendance row(s)`);
      console.log(`  ✓ Cancelled ${ids.length} SM row(s)`);
    }
  }

  report.push('');
  const { data: seedDisc, error: discErr } = await supabase
    .from('attendance_logs')
    .select('id, emp_number, shift_date, sync_type, status, device_time')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('status', 'PENDING_RESOLUTION')
    .ilike('sync_type', '%SEED_MASTER_HUB%');

  if (discErr) throw new Error(discErr.message);

  report.push(`Seed PENDING_RESOLUTION rows: ${seedDisc?.length ?? 0}`);
  for (const row of seedDisc ?? []) {
    report.push(`  · ${row.id} ${row.emp_number} ${row.sync_type} ${row.device_time}`);
  }
  console.log(`  Seed discrepancy rows: ${seedDisc?.length ?? 0}`);

  if (applyMode && seedDisc?.length) {
    for (const row of seedDisc) {
      const { error: rejErr } = await supabase
        .from('attendance_logs')
        .update({
          status: 'REJECTED',
          resolution_method: 'HANDOVER_H6_SEED_DISMISS',
        })
        .eq('id', row.id)
        .eq('company_id', CVS_COMPANY_ID)
        .eq('status', 'PENDING_RESOLUTION');

      if (rejErr) throw new Error(rejErr.message);
    }
    report.push(`  APPLIED: dismissed ${seedDisc.length} seed discrepancy row(s) → REJECTED`);
    console.log(`  ✓ Dismissed ${seedDisc.length} seed discrepancy row(s)`);
  }

  report.push('');
  const { data: tempAttendance, error: tempAttErr } = await supabase
    .from('sm_guard_attendance')
    .select('id, guard_epf, shift_date, status')
    .like('guard_epf', 'TEMP-%')
    .neq('status', 'CANCELLED')
    .limit(50);

  if (tempAttErr) throw new Error(tempAttErr.message);

  const { data: tempSlots, error: tempSlotErr } = await supabase
    .from('shadow_roster_slots')
    .select('id, temp_id, status, sm_epf')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('status', 'ACTIVE')
    .limit(50);

  if (tempSlotErr && !tempSlotErr.message.includes('does not exist')) {
    throw new Error(tempSlotErr.message);
  }

  report.push(`Active TEMP-* sm_guard_attendance: ${tempAttendance?.length ?? 0}`);
  report.push(`Active shadow_roster_slots: ${tempSlots?.length ?? 0}`);
  console.log(`  TEMP-* attendance rows: ${tempAttendance?.length ?? 0}`);
  console.log(`  Active shadow slots: ${tempSlots?.length ?? 0}`);

  const { data: remainingDisc } = await supabase
    .from('attendance_logs')
    .select('id, sync_type, status')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('status', 'PENDING_RESOLUTION');

  report.push('');
  report.push(`PENDING_RESOLUTION remaining: ${remainingDisc?.length ?? 0}`);
  for (const row of remainingDisc ?? []) {
    report.push(`  · ${row.id} ${row.sync_type ?? 'null'}`);
  }

  let mnrActiveFuture = 0;
  if (guard) {
    const keys = [guard.emp_number, guard.epf_no].filter(Boolean);
    const resignDate = guard.date_resigned ?? '2026-05-15';
    const { count } = await supabase
      .from('sm_guard_attendance')
      .select('id', { count: 'exact', head: true })
      .in('guard_epf', keys)
      .gt('shift_date', resignDate)
      .neq('status', 'CANCELLED');
    mnrActiveFuture = count ?? 0;
  }

  const gatePass =
    mnrActiveFuture === 0 &&
    (remainingDisc?.length ?? 0) === 0 &&
    (tempAttendance?.length ?? 0) === 0 &&
    (tempSlots?.length ?? 0) === 0;

  report.push('');
  report.push(`GATE: ${gatePass ? 'PASS' : 'FAIL'}`);
  report.push(`  MNR-R001 future non-cancelled SM rows: ${mnrActiveFuture}`);
  report.push(`  PENDING_RESOLUTION queue: ${remainingDisc?.length ?? 0}`);

  const evidencePath = writeEvidence(report);
  console.log(`\n  Evidence: ${evidencePath}`);

  if (!applyMode) {
    console.log('\n  Dry run — re-run with --apply to mutate production.\n');
    process.exit(gatePass ? 0 : 1);
  }

  if (!gatePass) {
    console.log('\n⚠ Applied partial fixes — gate still FAIL; review evidence.\n');
    process.exit(1);
  }

  console.log('\n✓ H-6 gate PASS — run npm run record:cvs-data-cleanup\n');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
