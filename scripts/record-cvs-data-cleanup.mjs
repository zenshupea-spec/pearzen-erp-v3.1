#!/usr/bin/env node
/**
 * Record H-6 data cleanup completion in signoff-bundle.json.
 *
 * Usage:
 *   npm run record:cvs-data-cleanup -- --cleared-at YYYY-MM-DD
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
    if (arg === '--cleared-at') out.clearedAt = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.clearedAt) {
  console.log('Usage: npm run record:cvs-data-cleanup -- --cleared-at YYYY-MM-DD');
  process.exit(args.help ? 0 : 1);
}

const gate = spawnSync('node', ['scripts/cleanup-cvs-handover-data.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (gate.status !== 0) {
  console.error('Gate check failed — run npm run audit:cvs-data-cleanup -- --apply first');
  console.error(gate.stdout || gate.stderr);
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.productionDataCleanup = {
  status: 'CLEARED',
  clearedAt: args.clearedAt,
  handoverStep: 'H-6',
  evidence: 'audit-evidence/cvs/h-6-data-cleanup-audit.txt',
  actions: [
    'MNR-R001 post-resign sm_guard_attendance → CANCELLED',
    'SEED_MASTER_HUB PENDING_RESOLUTION → REJECTED',
    'TEMP-* roster audit',
  ],
};

bundle.handoverStepsCompleted = Math.max(bundle.handoverStepsCompleted ?? 0, 6);

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`✓ H-6 recorded — cleared ${args.clearedAt}`);
