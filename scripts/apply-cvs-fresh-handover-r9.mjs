#!/usr/bin/env node
/**
 * R-9 — Delete all CVS site_profiles.
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r9.mjs
 *   node scripts/apply-cvs-fresh-handover-r9.mjs --dry-run
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
    console.error(`Refusing R-9 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-9 — delete all site_profiles`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
  ];

  console.log(`\nR-9 site purge — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  const { count: before, error: countErr } = await db
    .from('site_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  if (countErr) throw new Error(countErr.message);

  log.push(`site_profiles before: ${before ?? 0}`);

  if (dryRun) {
    log.push(`Would delete: ${before ?? 0} site_profiles`);
  } else if ((before ?? 0) > 0) {
    const { error: delErr } = await db
      .from('site_profiles')
      .delete()
      .eq('company_id', CVS_COMPANY_ID);
    if (delErr) throw new Error(delErr.message);
    log.push(`Deleted: ${before} site_profiles`);
  } else {
    log.push('Nothing to delete');
  }

  const { count: after, error: afterErr } = await db
    .from('site_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  if (afterErr) throw new Error(afterErr.message);

  log.push(`site_profiles after: ${after ?? 0}`);

  const gatePass = (after ?? 0) === 0;
  log.push('', `GATE: ${gatePass ? 'PASS' : 'FAIL'}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-9-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  for (const line of log.slice(4)) console.log(line);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-9 gate FAIL');
    process.exit(1);
  }

  console.log(`\n${dryRun ? 'Dry-run complete' : '✓ R-9 complete'} — ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
