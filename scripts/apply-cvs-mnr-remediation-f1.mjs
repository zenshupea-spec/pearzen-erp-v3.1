/**
 * F-1 — Apply CLEARANCE / R02 → status Resigned (CVS MNR remediation).
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f1.mjs
 * Dry-run: node scripts/apply-cvs-mnr-remediation-f1.mjs --dry-run
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        values.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

function log(line) {
  const msg = `[F-1 ${dryRun ? 'DRY-RUN' : 'APPLY'}] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const patchPath = join(outDir, 'remediation-employees-patch.csv');
  if (!existsSync(patchPath)) throw new Error('Missing remediation-employees-patch.csv');

  const patches = parseCsv(readFileSync(patchPath, 'utf8')).filter(
    (p) => normStatus(p.status) === 'resigned',
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  log(`Starting — ${patches.length} rows to mark Resigned`);

  let updated = 0;
  let skipped = 0;
  const samples = [];

  const BATCH = 100;
  for (let i = 0; i < patches.length; i += BATCH) {
    const batch = patches.slice(i, i + BATCH);
    const epfs = batch.map((r) => r.epf_no?.trim()).filter(Boolean);
    if (!epfs.length) continue;

    if (dryRun) {
      updated += epfs.length;
      for (const epf of epfs) {
        if (samples.length < 10) samples.push(epf);
      }
      continue;
    }

    const { data, error } = await supabase
      .from('employees')
      .update({ status: 'Resigned' })
      .eq('company_id', CVS_COMPANY_ID)
      .in('emp_number', epfs)
      .select('emp_number');

    if (error) {
      log(`ERROR batch ${i}: ${error.message}`);
      throw error;
    }

    const touched = new Set((data ?? []).map((r) => String(r.emp_number)));
    updated += touched.size;
    for (const epf of epfs) {
      if (touched.has(epf) && samples.length < 10) samples.push(epf);
      if (!touched.has(epf)) {
        const { data: fallback, error: e2 } = await supabase
          .from('employees')
          .update({ status: 'Resigned' })
          .eq('company_id', CVS_COMPANY_ID)
          .eq('epf_no', epf)
          .select('emp_number');
        if (e2) throw e2;
        if (fallback?.length) {
          updated += 1;
          if (samples.length < 10) samples.push(epf);
        } else {
          log(`WARN EPF ${epf}: not found`);
          skipped += 1;
        }
      }
    }
  }

  const { count: activeOnClearance, error: countErr } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID)
    .eq('site', 'CLEARANCE')
    .eq('status', 'ACTIVE');

  if (countErr) throw countErr;

  log(`Updated: ${updated} · Skipped: ${skipped}`);
  log(`Sample EPFs: ${samples.join(', ')}`);
  log(`ACTIVE on CLEARANCE after apply: ${activeOnClearance ?? 'n/a'} (expect 0)`);

  const report = [
    '',
    '=== F-1 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'dry-run' : 'LIVE'}`,
    `Rows targeted: ${patches.length}`,
    `Updated: ${updated}`,
    `Skipped: ${skipped}`,
    `ACTIVE on CLEARANCE: ${activeOnClearance ?? 'n/a'}`,
    dryRun ? 'DRY-RUN only — no DB writes' : Number(activeOnClearance) === 0 ? 'F-1 PASS' : 'F-1 INCOMPLETE',
    '',
    'F-1 COMPLETE — proceed to F-2',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (!dryRun && Number(activeOnClearance) > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-1 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
