#!/usr/bin/env node
/**
 * Record H-5 attendance queue clearance in signoff-bundle.json.
 *
 * Usage:
 *   npm run record:cvs-attendance-clearance -- --period 2026-05 --cleared-at 2026-06-25
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUNDLE_PATH = join(ROOT, 'audit-evidence/cvs/signoff-bundle.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--period') out.period = argv[++i];
    else if (arg === '--cleared-at') out.clearedAt = argv[++i];
    else if (arg === '--operator') out.operator = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.period || !args.clearedAt) {
  console.log(`Usage: npm run record:cvs-attendance-clearance -- --period 2026-05 --cleared-at YYYY-MM-DD`);
  process.exit(args.help ? 0 : 1);
}

const gate = spawnSync('node', ['scripts/audit-cvs-attendance-queue.mjs', '--gate', '--period', args.period], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (gate.status !== 0) {
  console.error('Gate check failed — run npm run audit:cvs-attendance-queue -- --gate first');
  console.error(gate.stdout || gate.stderr);
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.attendanceVerificationClearance = {
  status: 'CLEARED',
  payrollPeriod: args.period,
  clearedAt: args.clearedAt,
  operator: args.operator ?? 'CVS OM/TM',
  runbook: 'docs/runbooks/cvs-om-attendance-clearance.md',
  auditCommand: 'npm run audit:cvs-attendance-queue -- --gate',
  evidence: 'audit-evidence/cvs/h-5-attendance-queue-audit.txt',
};

bundle.deployGate = {
  ...bundle.deployGate,
  attendanceVerifiedForPayrollPeriod: args.period,
};

bundle.handoverStepsCompleted = Math.max(bundle.handoverStepsCompleted ?? 0, 5);

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`✓ H-5 recorded — period ${args.period} cleared ${args.clearedAt}`);
