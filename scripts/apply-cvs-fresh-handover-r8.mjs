#!/usr/bin/env node
/**
 * R-8 — Delete all non-MD/OD CVS employees (largest mutation).
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r8.mjs
 *   node scripts/apply-cvs-fresh-handover-r8.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/migration/classic-venture/fresh-handover');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CVS_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';
const BATCH = 200;

const PRESERVE_IDS = new Set([
  '59957583-deb6-4492-931d-b313c9b04a99', // MD
  '47ea02d0-6b05-41f3-8be4-060dd706e580', // OD
]);

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

async function countEmployees(db) {
  const { count, error } = await db
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchDeleteBatch(db) {
  const { data, error } = await db
    .from('employees')
    .select('id, rank, emp_number')
    .eq('company_id', CVS_COMPANY_ID)
    .not('rank', 'in', '("MD","OD")')
    .limit(BATCH);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => !PRESERVE_IDS.has(row.id));
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
    console.error(`Refusing R-8 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-8 — delete non-MD/OD employees`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
  ];

  console.log(`\nR-8 employee purge — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  const beforeTotal = await countEmployees(db);
  log.push(`Employees before: ${beforeTotal}`);

  const { data: executives, error: execErr } = await db
    .from('employees')
    .select('id, rank, emp_number, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .in('rank', ['MD', 'OD']);
  if (execErr) throw new Error(execErr.message);

  for (const id of PRESERVE_IDS) {
    if (!(executives ?? []).some((e) => e.id === id)) {
      throw new Error(`Preserve employee missing before delete: ${id}`);
    }
  }

  log.push('Preserve:');
  for (const e of executives ?? []) {
    log.push(`  ${e.rank} EPF ${e.emp_number} ${e.id} ${e.full_name}`);
  }

  let deleted = 0;
  let batches = 0;

  if (dryRun) {
    const { count } = await db
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', CVS_COMPANY_ID)
      .not('rank', 'in', '("MD","OD")');
    deleted = count ?? 0;
    log.push('', `Would delete: ${deleted} employees in batches of ${BATCH}`);
  } else {
    log.push('', 'Deleting in batches:');
    for (;;) {
      const batch = await fetchDeleteBatch(db);
      if (!batch.length) break;

      const ids = batch.map((r) => r.id);
      const { error } = await db.from('employees').delete().in('id', ids);
      if (error) throw new Error(`Batch ${batches + 1}: ${error.message}`);

      deleted += ids.length;
      batches += 1;
      if (batches <= 3 || batches % 10 === 0) {
        log.push(`  batch ${batches}: deleted ${ids.length} (total ${deleted})`);
        console.log(`  batch ${batches}: ${deleted} deleted…`);
      }
    }
    if (batches > 3) {
      log.push(`  … ${batches} batches total`);
    }
  }

  const afterTotal = dryRun ? beforeTotal - deleted : await countEmployees(db);

  const { data: remaining, error: remErr } = await db
    .from('employees')
    .select('id, rank, emp_number, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .order('rank');
  if (remErr) throw new Error(remErr.message);

  log.push('', `Employees after: ${afterTotal}`);
  log.push('Remaining:');
  for (const e of remaining ?? []) {
    log.push(`  ${e.rank} EPF ${e.emp_number} ${e.id} ${e.full_name}`);
  }

  const gatePass =
    afterTotal === 2 &&
    (remaining ?? []).length === 2 &&
    remaining?.every((e) => e.rank === 'MD' || e.rank === 'OD') &&
    remaining?.every((e) => PRESERVE_IDS.has(e.id));

  log.push('', `Deleted: ${deleted}`);
  log.push(`GATE: ${gatePass ? 'PASS' : 'FAIL'}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-8-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-8 gate FAIL');
    process.exit(1);
  }

  console.log(`\n✓ R-8 ${dryRun ? 'dry-run' : 'complete'} — deleted ${deleted}, remaining ${afterTotal}`);
  console.log(`Evidence: ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
