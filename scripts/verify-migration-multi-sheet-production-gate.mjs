#!/usr/bin/env node
/**
 * Multi-sheet migration workbook — Step 22 production gate (engineering checks).
 *
 * Run: npm run verify:migration-multi-sheet-production-gate
 * Writes: audit-evidence/cvs/migration-multi-sheet-production-gate.json
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(
  ROOT,
  'audit-evidence/cvs/migration-multi-sheet-production-gate.json',
);
const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';

const runAt = new Date().toISOString();
const checks = [];
let failed = false;

function pass(id, label, detail = undefined) {
  checks.push({ id, label, status: 'PASS', ...(detail ? { detail } : {}) });
}

function fail(id, label, detail) {
  checks.push({ id, label, status: 'FAIL', detail });
  failed = true;
}

function requireFile(rel, id, label) {
  if (existsSync(join(ROOT, rel))) pass(id, label, rel);
  else fail(id, label, `Missing: ${rel}`);
}

// 22.1 — Step 20 automated staging suite still green
try {
  console.log('\n▶ Step 20 — migration multi-sheet staging verification');
  execSync('npm run verify:migration-multi-sheet-staging', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  pass('22.1', 'Step 20 automated staging checks (20.1–20.5)');
} catch {
  fail('22.1', 'Step 20 automated staging checks (20.1–20.5)', 'verify:migration-multi-sheet-staging failed');
}

// 22.2 — Operator + evidence artifacts
requireFile(
  'audit-evidence/cvs/migration-multi-sheet-operator-note.md',
  '22.2',
  'Operator note present (step 21)',
);
requireFile(
  'audit-evidence/cvs/migration-multi-sheet-staging-verification.json',
  '22.2b',
  'Staging verification evidence JSON',
);
requireFile(
  'audit-evidence/cvs/migration-multi-sheet-production-gate.md',
  '22.2c',
  'MD production gate sign-off form',
);

// 22.3 — Bulk import requires service role at runtime
const bulkActions = readFileSync(
  join(ROOT, 'apps/back-office/app/executive/settings/bulk-import-actions.ts'),
  'utf8',
);
if (
  bulkActions.includes('SUPABASE_SERVICE_ROLE_KEY') &&
  bulkActions.includes('bulk import cannot write to the database')
) {
  pass('22.3', 'bulk-import-actions guards upload when SUPABASE_SERVICE_ROLE_KEY missing');
} else {
  fail(
    '22.3',
    'bulk-import-actions guards upload when SUPABASE_SERVICE_ROLE_KEY missing',
    'Expected explicit guard in uploadBulkDataWorkbook',
  );
}

// 22.4 — Tenant-erp Vercel profile in repo
try {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'apps/back-office/vercel.json'), 'utf8'));
  const build = vercel.buildCommand ?? '';
  if (build.includes('tenant-erp')) {
    pass('22.4', 'apps/back-office/vercel.json builds with PEARZEN_DEPLOYMENT_MODE=tenant-erp');
  } else {
    fail('22.4', 'apps/back-office/vercel.json builds with PEARZEN_DEPLOYMENT_MODE=tenant-erp', build);
  }
} catch (err) {
  fail('22.4', 'apps/back-office/vercel.json builds with PEARZEN_DEPLOYMENT_MODE=tenant-erp', String(err));
}

// 22.5 — Tenant Vercel production env includes SUPABASE_SERVICE_ROLE_KEY
try {
  console.log('\n▶ S-23 — tenant Vercel env matrix audit');
  execSync('npm run split:vercel-forge-tenant-env -- --audit', {
    cwd: ROOT,
    stdio: 'pipe',
    env: process.env,
  });
  const matrix = readFileSync(
    join(ROOT, 'audit-evidence/platform/s-23-vercel-env-matrix.txt'),
    'utf8',
  );
  const tenantSection = matrix.split(`TENANT PROJECT — ${TENANT_PROJECT}`)[1] ?? '';
  const hasServiceRoleLine = /SUPABASE_SERVICE_ROLE_KEY=/.test(tenantSection);
  const hasIssues = matrix.includes('ISSUES');
  if (hasServiceRoleLine && !hasIssues) {
    pass('22.5', `SUPABASE_SERVICE_ROLE_KEY on tenant-erp deploy (${TENANT_PROJECT})`, {
      evidence: 'audit-evidence/platform/s-23-vercel-env-matrix.txt',
      note: 'Secret value masked in audit output; key presence verified via S-23 matrix (0 issues)',
    });
  } else {
    fail('22.5', `SUPABASE_SERVICE_ROLE_KEY on tenant-erp deploy (${TENANT_PROJECT})`, {
      hasServiceRoleLine,
      hasIssues,
    });
  }
} catch (err) {
  fail('22.5', `SUPABASE_SERVICE_ROLE_KEY on tenant-erp deploy (${TENANT_PROJECT})`, String(err));
}

// 22.6 — Signoff bundle index
try {
  const bundle = JSON.parse(
    readFileSync(join(ROOT, 'audit-evidence/cvs/signoff-bundle.json'), 'utf8'),
  );
  if (bundle.legacyMigrationWorkbook?.operatorNote) {
    pass('22.6', 'signoff-bundle.json legacyMigrationWorkbook block indexed');
  } else {
    fail('22.6', 'signoff-bundle.json legacyMigrationWorkbook block indexed', 'Block missing');
  }
} catch (err) {
  fail('22.6', 'signoff-bundle.json legacyMigrationWorkbook block indexed', String(err));
}

const evidence = {
  step: 'migration-multi-sheet-22',
  runAt,
  status: failed ? 'FAIL' : 'PASS',
  command: 'npm run verify:migration-multi-sheet-production-gate',
  checks,
  operatorSignOffPending: [
    'MD completes sanitized sample import on CVS staging (see migration-multi-sheet-production-gate.md)',
    'MD ticks M.1–M.7 on migration-multi-sheet-staging-verification.md',
  ],
  relatedDocs: [
    'MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt',
    'audit-evidence/cvs/migration-multi-sheet-production-gate.md',
    'audit-evidence/cvs/migration-multi-sheet-operator-note.md',
    'audit-evidence/platform/s-23-vercel-env-matrix.txt',
  ],
};

mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

if (failed) {
  console.error(`\n✗ Migration Step 22 production gate FAIL — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
  for (const c of checks.filter((x) => x.status === 'FAIL')) {
    console.error(`  · ${c.id} ${c.label}`);
  }
  process.exit(1);
}

console.log(
  `\n✓ Migration Step 22 engineering gate PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`,
);
console.log('  Operator: complete MD sign-off in audit-evidence/cvs/migration-multi-sheet-production-gate.md');
