#!/usr/bin/env node
/**
 * R-6 — Reset SM / café / Shalom portal auth (not head_office_portal_auth).
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r6.mjs
 *   node scripts/apply-cvs-fresh-handover-r6.mjs --dry-run
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

async function deleteAllRows(db, table, log, notNullColumn = 'epf_number') {
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
    log.push(`  ${table}: would delete ${before} rows`);
    return before;
  }
  const { error } = await db.from(table).delete().not(notNullColumn, 'is', null);
  if (error) {
    // fallback for tables keyed by id
    const { error: err2 } = await db.from(table).delete().not('id', 'is', null);
    if (err2) throw new Error(`${table}: ${error.message}`);
  }
  log.push(`  ${table}: deleted ${before} rows`);
  return before;
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
    console.error(`Refusing R-6 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-6 — SM / café / Shalom portal auth`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
    'Actions (head_office_portal_auth NOT touched):',
  ];

  console.log(`\nR-6 portal auth reset — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  let total = 0;

  total += await deleteAllRows(db, 'sm_portal_auth', log, 'epf_number');
  total += await deleteAllRows(db, 'cafe_portal_auth', log, 'epf_number');
  total += await deleteAllRows(db, 'shalom_portal_auth', log, 'epf_number');
  total += await deleteByCompany(db, 'shalom_portal_daily_logins', log);
  total += await deleteByCompany(db, 'shalom_caretaker_property_assignments', log);

  const hoBefore = await countTable(db, 'head_office_portal_auth');
  log.push(`  head_office_portal_auth: ${hoBefore} rows (preserved — R-7)`);

  log.push('', 'Post-check:');
  const smAfter = await countTable(db, 'sm_portal_auth');
  const cafeAfter = await countTable(db, 'cafe_portal_auth');
  const shalomAfter = await countTable(db, 'shalom_portal_auth');
  const hoAfter = await countTable(db, 'head_office_portal_auth');
  log.push(`  sm_portal_auth: ${smAfter}`);
  log.push(`  cafe_portal_auth: ${cafeAfter}`);
  log.push(`  shalom_portal_auth: ${shalomAfter}`);
  log.push(`  head_office_portal_auth: ${hoAfter} (unchanged expected)`);

  const gatePass = smAfter === 0 && cafeAfter === 0 && shalomAfter === 0 && hoAfter === hoBefore;
  log.push('', `GATE: ${gatePass ? 'PASS' : 'FAIL'}`);
  log.push(`Total portal auth rows removed: ${total}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-6-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  for (const line of log.slice(5)) console.log(line);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-6 gate FAIL');
    process.exit(1);
  }

  console.log(`\n${dryRun ? 'Dry-run complete' : '✓ R-6 complete'} — ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
