#!/usr/bin/env node
/**
 * Record H-7 first live payroll cycle completion.
 *
 * Usage:
 *   npm run record:cvs-payroll-live -- --period 2026-05 --completed-at 2026-06-25
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_PATH = join(ROOT, 'audit-evidence/cvs/signoff-bundle.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--period') out.period = argv[++i];
    else if (arg === '--completed-at') out.completedAt = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.period || !args.completedAt) {
  console.log(
    'Usage: npm run record:cvs-payroll-live -- --period 2026-05 --completed-at YYYY-MM-DD',
  );
  process.exit(args.help ? 0 : 1);
}

const gate = spawnSync(
  'node',
  ['scripts/audit-cvs-payroll-readiness.mjs', '--gate', '--period', args.period],
  { cwd: ROOT, encoding: 'utf8' },
);

if (gate.status !== 0) {
  console.error('Payroll gate FAIL — runs must be PAID (or approved per policy)');
  console.error(gate.stdout || gate.stderr);
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.firstLivePayrollCycle = {
  status: 'COMPLETE',
  period: args.period,
  completedAt: args.completedAt,
  runbook: 'docs/runbooks/cvs-first-payroll-cycle.md',
  evidence: 'audit-evidence/cvs/h-7-payroll-readiness-audit.txt',
};

bundle.deployGate = {
  ...bundle.deployGate,
  payrollApprovedOrPaid: true,
  notes: `May ${args.period} payroll cycle recorded ${args.completedAt}.`,
};

bundle.handoverStepsCompleted = Math.max(bundle.handoverStepsCompleted ?? 0, 7);

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`✓ H-7 recorded — period ${args.period} completed ${args.completedAt}`);
