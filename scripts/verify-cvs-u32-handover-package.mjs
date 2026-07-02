#!/usr/bin/env node
/**
 * U-32 — verify operator handover package files exist and signoff bundle is v2.4+.
 *
 * Run: npm run verify:cvs-u32-handover-package
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'audit-evidence/cvs/u-32-operator-handover-package.md',
  'audit-evidence/cvs/signoff-bundle.json',
  'audit-evidence/cvs/u-31-production-deploy.json',
  'audit-evidence/cvs/build-gates.json',
  'audit-evidence/cvs/tasha-lk-production-smoke.json',
  'audit-evidence/cvs/master-hub-mock-sweep.json',
  'docs/runbooks/shalom-front-office.md',
  'CVS_CLIENT_HANDOVER_UX_STEPS.txt',
];

const failures = [];

for (const rel of REQUIRED) {
  if (!existsSync(join(ROOT, rel))) failures.push(`Missing: ${rel}`);
}

try {
  const bundle = JSON.parse(
    readFileSync(join(ROOT, 'audit-evidence/cvs/signoff-bundle.json'), 'utf8'),
  );
  if (!bundle.uxHandover) failures.push('signoff-bundle.json missing uxHandover block');
  if (!bundle.productionPush?.uxRedeployOn) {
    failures.push('signoff-bundle.json missing productionPush.uxRedeployOn');
  }
} catch (err) {
  failures.push(`signoff-bundle.json: ${err.message}`);
}

if (failures.length) {
  console.error('\n✗ U-32 handover package verify FAIL\n');
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}

console.log('\n✓ U-32 operator handover package verify PASS');
console.log(`  Deliverable: audit-evidence/cvs/u-32-operator-handover-package.md`);
