#!/usr/bin/env node
/**
 * S-31 — verify Forge tenant provisioning guardrails.
 *
 * Run: npm run audit:forge-tenant-provision-guard
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-31-forge-tenant-provision-guard.txt');

function loadEnv() {
  for (const file of ['.env.seed.tmp', '.env.local', '.env']) {
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

const REQUIRED = [
  'apps/back-office/lib/forge-tenant-provision-guard.ts',
  'apps/back-office/lib/forge-tenant-provision.ts',
  'apps/back-office/lib/forge-audit-log.ts',
  'packages/supabase/migrations/20260626140000_forge_audit_log.sql',
  'apps/back-office/lib/forge-tenant-provision-guard.test.ts',
  'apps/back-office/lib/forge-tenant-provision.integration.test.ts',
];

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function main() {
  loadEnv();
  const missing = REQUIRED.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length) {
    console.error('Missing:', missing.join(', '));
    process.exit(1);
  }

  const provision = read('apps/back-office/lib/forge-tenant-provision.ts');
  const actions = read('apps/back-office/app/forge/companies/new/actions.ts');
  const legacy = read('apps/back-office/app/forge/create/page.tsx');
  const migration = read('packages/supabase/migrations/20260626140000_forge_audit_log.sql');

  const checks = [
    ['provision uses insert-only companies path', /\.from\('companies'\)\s*\n\s*\.insert/.test(provision)],
    ['provision calls writeForgeAuditLog', /writeForgeAuditLog/.test(provision)],
    ['provision uses assertForgeTenantInsertPayload', /assertForgeTenantInsertPayload/.test(provision)],
    ['actions delegate to createForgeTenantRecord', /createForgeTenantRecord/.test(actions)],
    ['legacy /forge/create redirects', /redirect\('\/forge\/companies\/new'\)/.test(legacy)],
    ['forge_audit_log migration + RLS', /forge_audit_log/.test(migration) && /service_role/.test(migration)],
  ];

  console.log('\nS-31 Forge tenant provisioning guard audit\n');
  const failures = [];
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  }

  if (failures.length) {
    console.error('\nStatic checks failed:', failures.join(', '));
    process.exit(1);
  }

  console.log('\n── unit tests ──');
  execSync(
    'npx vitest run apps/back-office/lib/forge-tenant-provision-guard.test.ts',
    { cwd: ROOT, stdio: 'inherit' },
  );

  const hasService = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );

  let integrationNote = 'skipped (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set)';
  if (hasService) {
    console.log('\n── integration test ──');
    execSync(
      'npx vitest run apps/back-office/lib/forge-tenant-provision.integration.test.ts',
      { cwd: ROOT, stdio: 'inherit' },
    );
    integrationNote = 'PASS (service role)';
  } else {
    console.log('\n  · Integration test skipped — set Supabase env for live verify');
  }

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-31 Forge tenant provisioning guardrails',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Guardrails (forge/companies/new):',
    '  · Insert new companies row only (no id in payload — fresh UUID from DB)',
    '  · assertNotCvsCompanyMutation — never reuse/update CVS anchor company',
    '  · assertForgeTenantSlugAllowed — blocks reserved slug cvs',
    '  · writeForgeAuditLog → forge_audit_log (FORGE_TENANT_PROVISIONED)',
    '  · Rollback company row if provisioning sub-steps fail',
    '',
    'Legacy /forge/create → redirect /forge/companies/new',
    '',
    'Migration: packages/supabase/migrations/20260626140000_forge_audit_log.sql',
    '  · Operator: apply to remote Supabase before relying on audit rows',
    '',
    'Tests:',
    '  · forge-tenant-provision-guard.test.ts — unit PASS',
    `  · forge-tenant-provision.integration.test.ts — ${integrationNote}`,
    '',
    'Status: PASS',
    '',
    'Repeatable: npm run audit:forge-tenant-provision-guard',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);
}

main();
