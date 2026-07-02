#!/usr/bin/env node
/**
 * Bulk roster single-sheet — Step 17 staging verification (automated pre-checks).
 *
 * Run: npm run verify:cvs-bulk-roster-staging
 * Writes: audit-evidence/cvs/bulk-roster-staging-verification.json
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/bulk-roster-staging-verification.json');
const TEST_FILE = 'apps/back-office/lib/bulk-data-import.test.ts';
const TEST_FILTER = 'staging verification';

const runAt = new Date().toISOString();

try {
  const started = Date.now();
  console.log(`\n▶ vitest — ${TEST_FILTER}`);
  execSync(`npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - started;

  const evidence = {
    step: 'bulk-roster-17',
    runAt,
    status: 'PASS',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
    durationMs,
    checks: [
      { id: '17.1', label: '3 guards same site_name — parse + validate', status: 'PASS' },
      { id: '17.2', label: '1 derived site; employees.site; GUARD group + SM links', status: 'PASS' },
      { id: '17.3', label: 'Unknown rank auto-created in matrix', status: 'PASS' },
      { id: '17.4', label: 'uniform_outstanding_lkr → clearance / FM balances', status: 'PASS' },
      { id: '17.5', label: 'Export round-trip without data loss', status: 'PASS' },
    ],
    manualStaging: [
      'MD Settings → Bulk Data Import → download blank template',
      'Upload 3 test guards (same site_name) on CVS staging tenant',
      'Confirm site_profiles: 1 row; employees.site set on all 3',
      'OM portal: guards appear under shared site',
      'HR clearance modal: uniform debt visible for test guard',
      'FM offboarding queue: uniform_balance shown after HR handoff',
      'Re-download export and re-upload — no validation errors',
    ],
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `\n✓ Bulk roster Step 17 automated checks PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`,
  );
} catch {
  const evidence = {
    step: 'bulk-roster-17',
    runAt,
    status: 'FAIL',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
  };
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(1);
}
