#!/usr/bin/env node
/**
 * R-4 — Clear CVS OM / field operational data.
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r4.mjs
 *   node scripts/apply-cvs-fresh-handover-r4.mjs --dry-run
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
    log.push(`  ${table}: would delete ${before} rows`);
    return before;
  }
  const { error } = await db.from(table).delete().eq('company_id', CVS_COMPANY_ID);
  if (error) throw new Error(`${table}: ${error.message}`);
  log.push(`  ${table}: deleted ${before} rows`);
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
    console.error(`Refusing R-4 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-4 — OM / field data`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
    'Actions:',
  ];

  console.log(`\nR-4 OM / field cleanup — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  let total = 0;

  // Recovery plans before attendance_logs (FK from plans → logs; delete by company is safer first)
  total += await deleteByCompany(db, 'discrepancy_recovery_plans', log);
  total += await deleteByCompany(db, 'attendance_logs', log);
  total += await deleteByCompany(db, 'time_shifts', log);
  total += await deleteByCompany(db, 'time_rosters', log);
  total += await deleteByCompany(db, 'guard_blacklist_vault', log);
  total += await deleteByCompany(db, 'incidents', log);

  log.push('', 'Post-check:');
  const attAfter = await countTable(db, 'attendance_logs', (q) => q.eq('company_id', CVS_COMPANY_ID));
  const shiftsAfter = await countTable(db, 'time_shifts', (q) => q.eq('company_id', CVS_COMPANY_ID));
  const rostersAfter = await countTable(db, 'time_rosters', (q) => q.eq('company_id', CVS_COMPANY_ID));
  log.push(`  attendance_logs (CVS): ${attAfter}`);
  log.push(`  time_shifts (CVS): ${shiftsAfter}`);
  log.push(`  time_rosters (CVS): ${rostersAfter}`);

  const gatePass = attAfter === 0 && shiftsAfter === 0 && rostersAfter === 0;
  log.push('', `GATE: ${gatePass ? 'PASS' : 'FAIL'}`);
  log.push(`Total rows removed: ${total}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-4-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  for (const line of log.slice(5)) console.log(line);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-4 gate FAIL');
    process.exit(1);
  }

  console.log(`\n${dryRun ? 'Dry-run complete' : '✓ R-4 complete'} — ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
