/**
 * Compare repo migration files vs Supabase migration history (remote tracking table).
 * Schema may still be applied via catch-up scripts even when history diverges.
 *
 * Run: npm run audit:migrations
 * Refresh remote list: Supabase MCP list_migrations (project ktfgvcrdfbapmefktgjc)
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'packages/supabase/migrations');

/** Last synced from Supabase MCP list_migrations — 2026-06-15 */
const REMOTE_TRACKED = [
  '01_multi_tenant_patch',
  '20260506000000_inject_company_id_rls',
  '20260605061405_employees_mnr_portal_email',
  '20260605063240_md_settings_vault_session',
  '20260606070536_companies_tenant_slug',
  '20260606103421_ar_cafe_fm_backend',
  '20260608112953_cafe_prep_items_menu_link',
  '20260608185008_audit_logs_portal_tracking',
  '20260608185013_cafe_staff_day_logs',
  '20260609045433_md_settings_finance_extras',
  '20260609081638_cafe_portal_auth',
  '20260609092745_site_staff_assignments',
  '20260609112706_cafe_staff_checkout',
  '20260609121653_cafe_public_branding_rpc',
  '20260610103356_salary_advances_fm',
  '20260610153717_deductions_admin',
  '20260610153718_payroll_deduction_month_lock',
  '20260610153755_deductions_admin_rls',
  '20260610154649_uniform_suppliers_stock',
  '20260610183316_employees_epf_uniqueness_previous_epf',
  '20260610192338_sm_portal_auth_read_own',
];

function migrationStem(filename) {
  return filename.replace(/\.sql$/, '');
}

function migrationName(stem) {
  const idx = stem.indexOf('_');
  return idx === -1 ? stem : stem.slice(idx + 1);
}

const repoStems = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map(migrationStem)
  .sort();

const remoteByName = new Map(REMOTE_TRACKED.map((s) => [migrationName(s), s]));
const remoteStems = new Set(REMOTE_TRACKED);

const matchedByName = [];
const repoOnly = [];
const remoteOnly = [...REMOTE_TRACKED];

for (const stem of repoStems) {
  const name = migrationName(stem);
  const remoteMatch = remoteByName.get(name);
  if (remoteMatch) {
    matchedByName.push({ repo: stem, remote: remoteMatch, exact: stem === remoteMatch });
    const idx = remoteOnly.indexOf(remoteMatch);
    if (idx >= 0) remoteOnly.splice(idx, 1);
  } else if (remoteStems.has(stem)) {
    matchedByName.push({ repo: stem, remote: stem, exact: true });
  } else {
    repoOnly.push(stem);
  }
}

console.log('\nMigration drift audit');
console.log(`  Repo files:          ${repoStems.length}`);
console.log(`  Remote tracked:      ${REMOTE_TRACKED.length}`);
console.log(`  Matched by name:     ${matchedByName.length}`);
console.log(`  Repo-only (untracked): ${repoOnly.length}`);
console.log(`  Remote-only (no file): ${remoteOnly.length}`);

const timestampDrift = matchedByName.filter((m) => !m.exact);
if (timestampDrift.length) {
  console.log('\n  Timestamp drift (same name, different version prefix):');
  for (const row of timestampDrift.slice(0, 8)) {
    console.log(`    repo ${row.repo}`);
    console.log(`    remote ${row.remote}`);
  }
  if (timestampDrift.length > 8) console.log(`    … +${timestampDrift.length - 8} more`);
}

if (repoOnly.length) {
  console.log('\n  Repo migrations not in remote history (first 12):');
  for (const stem of repoOnly.slice(0, 12)) console.log(`    · ${stem}`);
  if (repoOnly.length > 12) console.log(`    … +${repoOnly.length - 12} more`);
}

if (remoteOnly.length) {
  console.log('\n  Remote history entries missing repo file:');
  for (const stem of remoteOnly) console.log(`    · ${stem}`);
}

console.log(
  '\n  Note: many repo migrations were applied via db:apply-* catch-up scripts;',
);
console.log('  drift here is tracking metadata — use check:backend to verify live tables.\n');
