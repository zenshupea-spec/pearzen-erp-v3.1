/**
 * F-4 — Reconcile sm_guard_assignments from remediation patch (CVS MNR).
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f4.mjs
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');

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

function log(line) {
  const msg = `[F-4 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

async function fetchAllLinks(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sm_guard_assignments')
      .select('id, sm_epf, guard_epf')
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const patchPath = join(outDir, 'remediation-sm-guard-links-patch.csv');
  if (!existsSync(patchPath)) throw new Error('Missing remediation-sm-guard-links-patch.csv');

  const patchRows = parseCsv(readFileSync(patchPath, 'utf8')).filter(
    (r) => r.sm_epf?.trim() && r.guard_epf?.trim(),
  );
  const intendedSet = new Set(patchRows.map((r) => `${r.sm_epf.trim()}|${r.guard_epf.trim()}`));
  const guardEpfs = [...new Set(patchRows.map((r) => r.guard_epf.trim()))];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const before = await fetchAllLinks(supabase);
  log(`DB links before: ${before.length} · patch intended: ${patchRows.length}`);

  let deletedGuards = 0;
  for (let i = 0; i < guardEpfs.length; i += 100) {
    const chunk = guardEpfs.slice(i, i + 100);
    const { data, error } = await supabase
      .from('sm_guard_assignments')
      .delete()
      .in('guard_epf', chunk)
      .select('id');
    if (error) throw error;
    deletedGuards += data?.length ?? 0;
  }
  log(`Deleted prior rows for ${guardEpfs.length} patch guards (${deletedGuards} rows)`);

  let upserted = 0;
  for (let i = 0; i < patchRows.length; i += 200) {
    const chunk = patchRows.slice(i, i + 200).map((r) => ({
      sm_epf: r.sm_epf.trim(),
      guard_epf: r.guard_epf.trim(),
    }));
    const { error } = await supabase
      .from('sm_guard_assignments')
      .upsert(chunk, { onConflict: 'sm_epf,guard_epf' });
    if (error) throw error;
    upserted += chunk.length;
  }
  log(`Upserted ${upserted} links`);

  const afterFirst = await fetchAllLinks(supabase);
  const extras = afterFirst.filter((l) => !intendedSet.has(`${l.sm_epf}|${l.guard_epf}`));
  let deletedExtras = 0;
  if (extras.length) {
    const extraIds = extras.map((l) => l.id);
    for (let i = 0; i < extraIds.length; i += 100) {
      const chunk = extraIds.slice(i, i + 100);
      const { data, error } = await supabase
        .from('sm_guard_assignments')
        .delete()
        .in('id', chunk)
        .select('id');
      if (error) throw error;
      deletedExtras += data?.length ?? 0;
    }
    log(`Removed ${deletedExtras} extra seed/orphan links: ${extras.map((e) => e.guard_epf).join(', ')}`);
  }

  const after = await fetchAllLinks(supabase);
  const mismatch = after.filter((l) => !intendedSet.has(`${l.sm_epf}|${l.guard_epf}`));

  const report = [
    '',
    '=== F-4 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `Before: ${before.length} links`,
    `After: ${after.length} links (intended ${patchRows.length})`,
    `Deleted guard rows: ${deletedGuards}`,
    `Upserted: ${upserted}`,
    `Removed extras: ${deletedExtras}`,
    mismatch.length === 0 && after.length === patchRows.length ? 'F-4 PASS' : `F-4 CHECK (${mismatch.length} unexpected)`,
    '',
    'F-4 COMPLETE — proceed to F-5',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (mismatch.length || after.length !== patchRows.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-4 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
