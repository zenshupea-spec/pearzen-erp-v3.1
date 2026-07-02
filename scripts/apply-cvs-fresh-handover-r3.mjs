#!/usr/bin/env node
/**
 * R-3 — Clear CVS SM operational data (assignments, attendance, visits, shadow roster).
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r3.mjs           # apply
 *   node scripts/apply-cvs-fresh-handover-r3.mjs --dry-run   # counts only
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/migration/classic-venture/fresh-handover');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CVS_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';

const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
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

async function countTable(db, table, filterFn) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filterFn) q = filterFn(q);
  const { count, error } = await q;
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function deleteByCompany(db, table, log) {
  const before = await countTable(db, table, (q) => q.eq('company_id', CVS_COMPANY_ID));
  if (before == null) {
    log.push(`  ${table}: skipped (table missing)`);
    return 0;
  }
  if (before === 0) {
    log.push(`  ${table}: 0 rows (skip)`);
    return 0;
  }
  if (dryRun) {
    log.push(`  ${table}: would delete ${before} rows (company_id)`);
    return before;
  }
  const { error } = await db.from(table).delete().eq('company_id', CVS_COMPANY_ID);
  if (error) throw new Error(`${table}: ${error.message}`);
  log.push(`  ${table}: deleted ${before} rows (company_id)`);
  return before;
}

async function deleteAllRows(db, table, log, notNullColumn = 'id') {
  const before = await countTable(db, table);
  if (before == null) {
    log.push(`  ${table}: skipped (table missing)`);
    return 0;
  }
  if (before === 0) {
    log.push(`  ${table}: 0 rows (skip)`);
    return 0;
  }
  if (dryRun) {
    log.push(`  ${table}: would delete ${before} rows (all)`);
    return before;
  }
  const { error } = await db.from(table).delete().not(notNullColumn, 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);
  log.push(`  ${table}: deleted ${before} rows (all)`);
  return before;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const host = new URL(url).hostname;
  if (!host.includes(CVS_PROJECT_REF)) {
    console.error(`Refusing R-3 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-3 — SM operational data`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
    'Actions:',
  ];

  console.log(`\nR-3 SM operational cleanup — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  let total = 0;

  total += await deleteAllRows(db, 'sm_guard_assignments', log, 'id');
  total += await deleteAllRows(db, 'sm_guard_attendance', log, 'id');
  total += await deleteByCompany(db, 'sm_visit_logs', log);
  total += await deleteByCompany(db, 'sm_incident_reports', log);
  total += await deleteByCompany(db, 'shadow_roster_slots', log);
  total += await deleteAllRows(db, 'sm_attendance_submissions', log, 'id');
  total += await deleteAllRows(db, 'sm_guard_penalties', log, 'id');
  total += await deleteAllRows(db, 'sm_uniform_requests', log, 'id');

  log.push('', 'Post-check:');
  const assignAfter = await countTable(db, 'sm_guard_assignments');
  const attAfter = await countTable(db, 'sm_guard_attendance');
  log.push(`  sm_guard_assignments: ${assignAfter}`);
  log.push(`  sm_guard_attendance: ${attAfter}`);

  const gatePass = assignAfter === 0 && attAfter === 0;
  log.push('', `GATE: ${gatePass ? 'PASS' : 'FAIL'}`);
  log.push(`Total rows removed: ${total}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-3-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  for (const line of log.slice(5)) console.log(line);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-3 gate FAIL');
    process.exit(1);
  }

  console.log(`\n${dryRun ? 'Dry-run complete' : '✓ R-3 complete'} — ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
