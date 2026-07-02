/**
 * E-3 — Build remediation-sm-guard-links-patch.csv from remediation-classification.csv
 *
 * Usage: node scripts/build-cvs-mnr-remediation-sm-guard-links-patch.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');

const PATCH_COLUMNS = ['sm_epf', 'guard_epf'];

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

function toCsv(columns, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function fetchDbLinks(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('sm_guard_assignments')
      .select('sm_epf, guard_epf')
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
  const classPath = join(outDir, 'remediation-classification.csv');
  if (!existsSync(classPath)) throw new Error('Missing remediation-classification.csv');

  const classRows = parseCsv(readFileSync(classPath, 'utf8'));
  const intended = classRows
    .filter((r) => r.bucket === 'DEPLOYED' && (r.intended_sm_epf ?? '').trim())
    .map((r) => ({
      sm_epf: r.intended_sm_epf.trim(),
      guard_epf: r.epf_no.trim(),
    }))
    .sort((a, b) => a.guard_epf.localeCompare(b.guard_epf, undefined, { numeric: true }));

  const deduped = [];
  const seen = new Set();
  for (const link of intended) {
    const key = link.guard_epf;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const dbLinks = await fetchDbLinks(supabase);
  const dbSet = new Set(dbLinks.map((l) => `${l.sm_epf}|${l.guard_epf}`));
  const intendedSet = new Set(deduped.map((l) => `${l.sm_epf}|${l.guard_epf}`));

  let missingInDb = 0;
  let wrongInDb = 0;
  const guardToDbSm = new Map();
  for (const l of dbLinks) {
    guardToDbSm.set(String(l.guard_epf), String(l.sm_epf));
  }
  for (const link of deduped) {
    const keyStr = `${link.sm_epf}|${link.guard_epf}`;
    if (!dbSet.has(keyStr)) {
      if (guardToDbSm.has(link.guard_epf) && guardToDbSm.get(link.guard_epf) !== link.sm_epf) {
        wrongInDb += 1;
      } else if (!guardToDbSm.has(link.guard_epf)) {
        missingInDb += 1;
      }
    }
  }
  const extraInDb = dbLinks.filter((l) => !intendedSet.has(`${l.sm_epf}|${l.guard_epf}`)).length;

  const smCounts = {};
  for (const link of deduped) {
    smCounts[link.sm_epf] = (smCounts[link.sm_epf] ?? 0) + 1;
  }

  const outPath = join(outDir, 'remediation-sm-guard-links-patch.csv');
  writeFileSync(outPath, toCsv(PATCH_COLUMNS, deduped));

  const lines = [
    '',
    '=== E-3 SM GUARD LINKS PATCH FILE ===',
    `Run at: ${new Date().toISOString()}`,
    `Output: ${outPath}`,
    `Intended DEPLOYED links: ${deduped.length}`,
    `DB links total: ${dbLinks.length}`,
    `  missing in DB: ${missingInDb}`,
    `  wrong SM for guard: ${wrongInDb}`,
    `  extra DB links (not in intended set): ${extraInDb}`,
    'Per SM:',
    ...Object.entries(smCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([sm, n]) => `  ${sm}: ${n}`),
    '',
    deduped.length === dbLinks.length && missingInDb === 0 && wrongInDb === 0
      ? 'PASS — patch matches DB; F-4 may skip or idempotent re-apply'
      : 'NOTE — F-4 will upsert/replace per patch file',
    '',
    'E-3 COMPLETE — proceed to E-4 (dry-run validation)',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
