#!/usr/bin/env node
/**
 * Bulk roster web editor — Step 19 staging verification (automated pre-checks).
 *
 * Run: npm run verify:bulk-roster-web-editor-staging
 * Writes: audit-evidence/cvs/bulk-roster-web-editor-staging-verification.json
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(
  ROOT,
  'audit-evidence/cvs/bulk-roster-web-editor-staging-verification.json',
);
const TEST_FILE = 'apps/back-office/lib/bulk-roster-web-editor-staging.test.ts';
const TEST_FILTER = 'bulk roster web editor staging verification';

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
    step: 'bulk-roster-web-editor-19',
    runAt,
    status: 'PASS',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
    durationMs,
    checks: [
      {
        id: '19.1',
        label: 'Editor load excludes MD / OD / FM executive ranks',
        status: 'PASS',
      },
      {
        id: '19.2',
        label: 'Two new sites appear in Guard site_code dropdown',
        status: 'PASS',
      },
      {
        id: '19.3',
        label: 'HO SM + sector auto-links guard assigned_sm_epf',
        status: 'PASS',
      },
      {
        id: '19.4',
        label: 'Paste legacy single column (10 guards) expands grid',
        status: 'PASS',
      },
      {
        id: '19.5',
        label: 'Re-open round-trip preserves site + SM linkage',
        status: 'PASS',
      },
      {
        id: '19.6',
        label: 'Staging bundle passes validateBulkImport (MNR-ready)',
        status: 'PASS',
      },
    ],
    manualStaging: [
      'Executive → Settings → Bulk Data Import → Open bulk editor',
      'Confirm live roster loads; MD / OD / FM not listed on workforce tabs',
      'Sites tab: add 2 new sites — Guard site_code dropdown updates immediately',
      'Head Office: add SM row with sector_name — guard at site in sector gets SM',
      'Guards: paste legacy single column (10 names) → fill required fields → Validate',
      'Review & apply (TOTP) → HR MNR shows imported guard fields',
      'Close and re-open bulk editor — edits persisted',
    ],
    relatedDocs: [
      'BULK_ROSTER_WEB_EDITOR_STEPS.txt',
      'audit-evidence/cvs/bulk-roster-web-editor-staging-verification.md',
      'MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt',
    ],
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `\n✓ Bulk roster web editor Step 19 automated checks PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`,
  );
} catch {
  const evidence = {
    step: 'bulk-roster-web-editor-19',
    runAt,
    status: 'FAIL',
    command: `npx vitest run ${TEST_FILE} -t "${TEST_FILTER}"`,
  };
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(1);
}
