#!/usr/bin/env node
/**
 * H-14 — verify Pearzen prep for Supabase Pro + PITR operator upgrade.
 *
 * Run: npm run verify:cvs-pitr-prep
 * Does NOT require PITR to be enabled (use audit:cvs-database-backups for live check).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  runbook: join(ROOT, 'docs/runbooks/cvs-supabase-pro-pitr-upgrade.md'),
  recoveryRunbook: join(ROOT, 'docs/runbooks/cvs-database-recovery.md'),
  recordScript: join(ROOT, 'scripts/record-cvs-pitr-enabled.mjs'),
  auditScript: join(ROOT, 'scripts/audit-cvs-database-backups.mjs'),
  constants: join(ROOT, 'packages/supabase/cvs-database-backup.ts'),
  bundle: join(ROOT, 'audit-evidence/cvs/signoff-bundle.json'),
};

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

const runbook = readFileSync(paths.runbook, 'utf8');
for (const needle of [
  'ennbhatdmdwmuzwcjkax',
  'ktfgvcrdfbapmefktgjc',
  'Point-in-time recovery',
  'npm run record:cvs-pitr-enabled',
  'npm run audit:cvs-database-backups',
]) {
  if (!runbook.includes(needle)) failures.push(`H-14 runbook missing: ${needle}`);
}

const recordScript = readFileSync(paths.recordScript, 'utf8');
if (!recordScript.includes('pitr_enabled')) {
  failures.push('record-cvs-pitr-enabled must verify pitr_enabled via Management API');
}

const constants = readFileSync(paths.constants, 'utf8');
if (!constants.includes('CVS_PITR_RPO_MINUTES')) {
  failures.push('cvs-database-backup.ts missing PITR RPO constants');
}

const bundle = JSON.parse(readFileSync(paths.bundle, 'utf8'));
if (!bundle.pitrUpgrade) {
  failures.push('signoff-bundle.json missing pitrUpgrade section');
}

const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
for (const script of ['verify:cvs-pitr-prep', 'record:cvs-pitr-enabled', 'audit:cvs-database-backups']) {
  if (!pkg.includes(script)) failures.push(`package.json missing ${script}`);
}

if (failures.length > 0) {
  console.error('CVS H-14 PITR prep check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-14 Pro + PITR operator prep verified');
console.log('  Operator: docs/runbooks/cvs-supabase-pro-pitr-upgrade.md');
console.log('  Live check: npm run audit:cvs-database-backups');
console.log('  Record when done: npm run record:cvs-pitr-enabled -- --verified-at YYYY-MM-DD');
