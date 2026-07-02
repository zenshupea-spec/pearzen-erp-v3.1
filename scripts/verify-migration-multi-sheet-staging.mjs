#!/usr/bin/env node
/**
 * Multi-sheet migration workbook — Step 20 staging verification (automated pre-checks).
 *
 * Run: npm run verify:migration-multi-sheet-staging
 * Writes: audit-evidence/cvs/migration-multi-sheet-staging-verification.json
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(
  ROOT,
  'audit-evidence/cvs/migration-multi-sheet-staging-verification.json',
);
const TEST_FILE = 'apps/back-office/lib/bulk-data-import.test.ts';
const TEST_FILTER = 'migration multi-sheet staging verification';

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
    step: 'migration-multi-sheet-20',
    runAt,
    status: 'PASS',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
    durationMs,
    checks: [
      {
        id: '20.1',
        label: 'Blank template — 9 sheets + GUARD dropdown validations',
        status: 'PASS',
      },
      {
        id: '20.2',
        label: '2 sites + 2 SMs + 3 guards — validate + MNR site join',
        status: 'PASS',
      },
      {
        id: '20.3',
        label: 'Partial re-import — blank cells do not wipe existing fields',
        status: 'PASS',
      },
      {
        id: '20.4',
        label: 'Export split — sheet counts match on re-parse',
        status: 'PASS',
      },
      {
        id: '20.5',
        label: 'Legacy single Roster upload still works',
        status: 'PASS',
      },
    ],
    manualStaging: [
      'MD Settings → Bulk Data Import → download blank migration template',
      'Confirm 9 tabs in Excel (8 workforce/site + hidden Lookups); GUARD site_code dropdown',
      'Fill 2 Sites rows, 2 SM rows, 3 GUARD rows → upload on CVS staging tenant',
      'HR MNR: verify site, rank, bank, uniform debt on imported guards',
      'Re-upload workbook with half the rows and blank optional columns — no data wiped',
      'Export live roster → confirm sheet split (SM/GUARD/Sites counts)',
      'Upload legacy single-sheet Roster workbook — still accepted',
    ],
    relatedDocs: [
      'MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt',
      'audit-evidence/cvs/migration-multi-sheet-staging-verification.md',
      'CVS_LEGACY_MNR_MIGRATION_STEPS.txt',
    ],
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `\n✓ Migration Step 20 automated checks PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`,
  );
} catch {
  const evidence = {
    step: 'migration-multi-sheet-20',
    runAt,
    status: 'FAIL',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
  };
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(1);
}
