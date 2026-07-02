#!/usr/bin/env node
/**
 * H-5 — audit CVS attendance verification backlog (production read-only).
 *
 * Usage:
 *   npm run audit:cvs-attendance-queue
 *   npm run audit:cvs-attendance-queue -- --gate          # exit 1 if May 2026 not ready for payroll
 *   npm run audit:cvs-attendance-queue -- --period 2026-05
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.seed.tmp
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(ROOT, 'audit-evidence/cvs');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const args = process.argv.slice(2);
const gateMode = args.includes('--gate');
const periodIdx = args.indexOf('--period');
const payrollPeriod = periodIdx >= 0 ? args[periodIdx + 1] : '2026-05';

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

function periodRange(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  const start = `${yyyyMm}-01T00:00:00+05:30`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00+05:30`;
  return { start, end, label: yyyyMm };
}

async function fetchLogs(supabase, { start, end } = {}) {
  let query = supabase
    .from('attendance_logs')
    .select('id, emp_number, action_type, device_time, status, sync_type')
    .eq('company_id', CVS_COMPANY_ID)
    .in('action_type', ['CHECK_IN', 'CHECK_OUT']);

  if (start && end) {
    query = query.gte('device_time', start).lt('device_time', end);
  }

  const { data, error } = await query.limit(10000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function countByStatus(logs) {
  const counts = {};
  for (const row of logs) {
    const status = row.status ?? 'NULL';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function assessPayrollReadiness(logs, periodLabel) {
  const checkIns = logs.filter((r) => r.action_type === 'CHECK_IN');
  const approvedCheckIns = checkIns.filter((r) => r.status === 'APPROVED');
  const pendingOrFlagged = logs.filter(
    (r) => r.status === 'PENDING' || r.status === 'FLAGGED',
  );

  return {
    periodLabel,
    totalLogs: logs.length,
    checkInCount: checkIns.length,
    approvedCheckIns: approvedCheckIns.length,
    pendingOrFlagged: pendingOrFlagged.length,
    ready: approvedCheckIns.length > 0 && pendingOrFlagged.length === 0,
    materialBacklog: pendingOrFlagged.length > 0,
  };
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
  const range = periodRange(payrollPeriod);

  console.log(`\nCVS attendance verification audit — company ${CVS_COMPANY_ID}\n`);

  const allLogs = await fetchLogs(supabase);
  const periodLogs = await fetchLogs(supabase, range);

  const allStatus = countByStatus(allLogs);
  const periodStatus = countByStatus(periodLogs);
  const readiness = assessPayrollReadiness(periodLogs, payrollPeriod);

  console.log('ALL TIME (CHECK_IN + CHECK_OUT, tenant-scoped)');
  for (const [status, n] of Object.entries(allStatus).sort()) {
    console.log(`  ${status}: ${n}`);
  }

  console.log(`\nPAYROLL PERIOD ${payrollPeriod} (Colombo device_time)`);
  for (const [status, n] of Object.entries(periodStatus).sort()) {
    console.log(`  ${status}: ${n}`);
  }

  console.log('\nPAYROLL READINESS');
  console.log(`  Approved CHECK_IN rows: ${readiness.approvedCheckIns}`);
  console.log(`  PENDING/FLAGGED (period): ${readiness.pendingOrFlagged}`);
  console.log(`  Ready for FM regenerate: ${readiness.ready ? 'YES' : 'NO'}`);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = join(EVIDENCE_DIR, 'h-5-attendance-queue-audit.txt');
  const lines = [
    'CVS Handover H-5 — attendance verification queue audit',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    `Payroll period: ${payrollPeriod}`,
    '',
    'ALL TIME STATUS COUNTS',
    ...Object.entries(allStatus)
      .sort()
      .map(([s, n]) => `  ${s}: ${n}`),
    '',
    `PERIOD ${payrollPeriod} STATUS COUNTS`,
    ...Object.entries(periodStatus)
      .sort()
      .map(([s, n]) => `  ${s}: ${n}`),
    '',
    `Approved CHECK_IN (period): ${readiness.approvedCheckIns}`,
    `PENDING/FLAGGED (period): ${readiness.pendingOrFlagged}`,
    `Ready for payroll: ${readiness.ready ? 'YES' : 'NO'}`,
    '',
    'OM ACTION',
    '  Portal: https://cvsom.pearzen.tech or https://cvstm.pearzen.tech',
    '  Shift Verification → review each date in period → Approve valid pairs',
    '  Runbook: docs/runbooks/cvs-om-attendance-clearance.md',
    '',
    'RECORD WHEN CLEAR',
    '  npm run record:cvs-attendance-clearance -- --period 2026-05 --cleared-at YYYY-MM-DD',
    '',
  ];
  writeFileSync(evidencePath, `${lines.join('\n')}\n`);
  console.log(`\n  Evidence: ${evidencePath}`);

  if (gateMode) {
    if (!readiness.ready) {
      console.log('\n✗ Gate FAIL — clear OM verification queue before May payroll (H-7).\n');
      process.exit(1);
    }
    console.log('\n✓ Gate PASS — period ready for FM payroll regenerate.\n');
  } else if (readiness.materialBacklog) {
    console.log('\n⚠ Backlog remains — OM/TM action required (see runbook).\n');
    process.exit(1);
  } else {
    console.log('\n✓ No material backlog in payroll period.\n');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
