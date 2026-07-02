#!/usr/bin/env node
/**
 * H-7 — audit May 2026 payroll readiness + remote run state.
 *
 * Usage:
 *   npm run audit:cvs-payroll-readiness
 *   npm run audit:cvs-payroll-readiness -- --period 2026-05
 *   npm run audit:cvs-payroll-readiness -- --gate
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(ROOT, 'audit-evidence/cvs');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const args = process.argv.slice(2);
const gateMode = args.includes('--gate');
const periodIdx = args.indexOf('--period');
const period = periodIdx >= 0 ? args[periodIdx + 1] : '2026-05';
const [year, month] = period.split('-').map(Number);

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

function loadSignoffBundle() {
  try {
    return JSON.parse(
      readFileSync(join(ROOT, 'audit-evidence/cvs/signoff-bundle.json'), 'utf8'),
    );
  } catch {
    return {};
  }
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const bundle = loadSignoffBundle();
  const report = [
    'CVS Handover H-7 — payroll readiness audit',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Period: ${period} (${year}-${String(month).padStart(2, '0')})`,
    '',
  ];

  console.log(`\nCVS payroll readiness — ${period}\n`);

  const attendance = spawnSync(
    'node',
    ['scripts/audit-cvs-attendance-queue.mjs', '--period', period, ...(gateMode ? ['--gate'] : [])],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const attendanceReady = attendance.status === 0;
  report.push(`H-5 attendance gate: ${attendanceReady ? 'PASS' : 'FAIL'}`);
  console.log(`  H-5 attendance: ${attendanceReady ? 'PASS' : 'FAIL'}`);

  const backupAccepted =
    bundle.backupRpoAcceptance?.status === 'ACCEPTED' ||
    bundle.deployGate?.backupRpoAccepted === true;
  report.push(`H-4 backup RPO accepted: ${backupAccepted ? 'YES' : 'PENDING'}`);
  console.log(`  H-4 backup RPO: ${backupAccepted ? 'YES' : 'PENDING'}`);

  const { data: lockRow } = await supabase
    .from('payroll_deduction_month_locks')
    .select('month_start, locked_at, locked_by')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('month_start', `${period}-01`)
    .maybeSingle();

  const deductionsLocked = Boolean(lockRow);
  report.push(`HQ deductions month lock (${period}-01): ${deductionsLocked ? 'LOCKED' : 'NOT LOCKED'}`);
  console.log(`  Deductions lock: ${deductionsLocked ? 'LOCKED' : 'NOT LOCKED'}`);

  const { data: runs, error: runsErr } = await supabase
    .from('payroll_runs')
    .select('group_id, status, payslip_count, gross_total, net_total, approved_at, paid_at')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('period_year', year)
    .eq('period_month', month);

  if (runsErr && !runsErr.message.includes('does not exist')) {
    throw new Error(runsErr.message);
  }

  report.push('');
  report.push('PAYROLL RUNS');
  for (const group of ['security', 'cafe']) {
    const row = (runs ?? []).find((r) => r.group_id === group);
    if (!row) {
      report.push(`  ${group}: (no run row)`);
      console.log(`  ${group}: no run`);
      continue;
    }
    report.push(
      `  ${group}: ${row.status} · slips=${row.payslip_count ?? 0} · gross=${row.gross_total ?? 0} · net=${row.net_total ?? 0}`,
    );
    console.log(`  ${group}: ${row.status} · ${row.payslip_count ?? 0} payslips · net ${row.net_total ?? 0}`);
  }

  const { data: payslips } = await supabase
    .from('payslips')
    .select('status, net_pay, group_id')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('period_year', year)
    .eq('period_month', month);

  const slipByStatus = {};
  let netSum = 0;
  for (const s of payslips ?? []) {
    slipByStatus[s.status] = (slipByStatus[s.status] ?? 0) + 1;
    netSum += Number(s.net_pay ?? 0);
  }

  report.push('');
  report.push(`PAYSLIPS total: ${payslips?.length ?? 0} · Σ net_pay: ${netSum.toFixed(2)}`);
  for (const [st, n] of Object.entries(slipByStatus).sort()) {
    report.push(`  ${st}: ${n}`);
  }

  const allPaid = (runs ?? []).length > 0 && (runs ?? []).every((r) => r.status === 'PAID');
  const allApprovedOrPaid = (runs ?? []).every(
    (r) => r.status === 'APPROVED' || r.status === 'PAID',
  );

  const prereqsOk = attendanceReady && deductionsLocked;
  const payrollComplete = allPaid || (allApprovedOrPaid && bundle.deployGate?.payrollApprovedOrPaid);

  report.push('');
  report.push(`Prerequisites for regenerate: ${prereqsOk ? 'READY' : 'BLOCKED'}`);
  report.push(`Payroll cycle complete (PAID): ${allPaid ? 'YES' : 'NO'}`);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = join(EVIDENCE_DIR, 'h-7-payroll-readiness-audit.txt');
  writeFileSync(evidencePath, `${report.join('\n')}\n`);
  console.log(`\n  Evidence: ${evidencePath}`);

  if (gateMode) {
    if (allPaid) {
      console.log('\n✓ H-7 gate PASS — payroll PAID.\n');
      process.exit(0);
    }
    if (!prereqsOk) {
      console.log('\n✗ H-7 gate FAIL — complete H-5 + HQ deductions lock first.\n');
      process.exit(1);
    }
    console.log('\n⚠ Prerequisites OK — FM/MD can run May payroll cycle.\n');
    process.exit(0);
  }

  process.exit(payrollComplete ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
