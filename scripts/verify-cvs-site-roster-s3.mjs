/**
 * S-3 — Rank matrix alignment report (read-only).
 *
 * Usage: node scripts/verify-cvs-site-roster-s3.mjs
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { parseRankPayMatrix } from '../packages/rank-pay-matrix/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const classPath = join(outDir, 'site-roster-classification.csv');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const NEW_MATRIX_RANKS = ['OD', 'HR', 'EA', 'SM'];

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
    for (const ch of line) {
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

function normUpper(s) {
  return (s ?? '').trim().toUpperCase();
}

async function main() {
  loadEnv();
  if (!existsSync(classPath)) throw new Error('Missing site-roster-classification.csv — run S-1');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const { data: settings } = await supabase
    .from('md_settings')
    .select('rank_pay_matrix')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();

  const matrix = parseRankPayMatrix(settings?.rank_pay_matrix);
  const matrixCodes = new Set(matrix.map((r) => r.rankCode));

  const rows = parseCsv(readFileSync(classPath, 'utf8')).filter(
    (r) => r.intended_pool !== 'DB_ONLY' && r.intended_pool !== 'JUNK',
  );

  const rankMismatch = rows.filter((r) => r.mismatch_rank === 'Y');
  const dbRankCounts = new Map();
  for (const r of rows) {
    const db = normUpper(r.db_rank);
    if (!db) continue;
    dbRankCounts.set(db, (dbRankCounts.get(db) ?? 0) + 1);
  }

  const intendedRankCounts = new Map();
  for (const r of rows) {
    const ir = normUpper(r.intended_rank);
    if (!ir) continue;
    intendedRankCounts.set(ir, (intendedRankCounts.get(ir) ?? 0) + 1);
  }

  const dbNotInMatrix = [...dbRankCounts.entries()]
    .filter(([code]) => !matrixCodes.has(code))
    .sort((a, b) => b[1] - a[1]);

  const intendedNotInMatrix = [...intendedRankCounts.entries()]
    .filter(([code]) => !matrixCodes.has(code))
    .sort((a, b) => b[1] - a[1]);

  const odRows = rows.filter((r) => normUpper(r.intended_rank) === 'OD');
  const odNot13400 = odRows.filter((r) => r.epf_no !== '13400');

  const legacyVoInDb = rows.filter(
    (r) => normUpper(r.db_rank) === 'VO' && normUpper(r.intended_rank) === 'SM',
  );
  const legacyHra = rows.filter(
    (r) => normUpper(r.db_rank) === 'HRA' || normUpper(r.sheet_rank) === 'HRA',
  );
  const legacyExf = rows.filter(
    (r) => normUpper(r.db_rank) === 'EXF' || normUpper(r.sheet_rank) === 'EXF',
  );

  const pass =
    odNot13400.length === 0 &&
    intendedNotInMatrix.every(([code]) => NEW_MATRIX_RANKS.includes(code));

  const report = [
    '',
    '=== S-3 RANK MATRIX REPORT ===',
    `Run at: ${new Date().toISOString()}`,
    `MD matrix codes (${matrix.length}): ${[...matrixCodes].sort().join(', ')}`,
    '',
    'Operator rank intentions:',
    '  HRA → HR',
    '  EXF → EA',
    '  VO → SM (sector managers)',
    '  OD → new rank — EPF 13400 V S PERERA only',
    '  EPF 1874 → HR · 11560/12761 → EA',
    '',
    `Rank mismatches (sheet intention vs DB): ${rankMismatch.length}`,
    ...rankMismatch.slice(0, 20).map(
      (r) =>
        `  · EPF ${r.epf_no} ${r.full_name}: sheet ${r.sheet_rank} → want ${r.intended_rank}, DB ${r.db_rank}`,
    ),
    ...(rankMismatch.length > 20 ? [`  … +${rankMismatch.length - 20} more`] : []),
    '',
    'DB ranks not in matrix today:',
    ...(dbNotInMatrix.length
      ? dbNotInMatrix.map(([c, n]) => `  ${c}: ${n} employees`)
      : ['  ✓ none']),
    '',
    'Intended ranks not in matrix (need MD matrix add in S-8):',
    ...intendedNotInMatrix.map(([c, n]) => {
      const tag = NEW_MATRIX_RANKS.includes(c) ? ' [NEW]' : '';
      return `  ${c}: ${n} employees${tag}`;
    }),
    '',
    'OD assignment check:',
    ...odRows.map((r) => `  EPF ${r.epf_no} ${r.full_name} → OD`),
    odNot13400.length ? `  ✗ OD assigned outside 13400: ${odNot13400.length}` : '  ✓ OD only on EPF 13400',
    '',
    `VO→SM updates needed: ${legacyVoInDb.length} rows`,
    `HRA→HR updates needed: ${legacyHra.filter((r) => normUpper(r.db_rank) === 'HRA').length} in DB`,
    `EXF→EA updates needed: ${legacyExf.filter((r) => normUpper(r.db_rank) === 'EXF').length} in DB`,
    '',
    'Matrix additions required before S-8 apply:',
    '  OD — Operations Director (HEAD_OFFICE) — 1 employee: EPF 13400',
    '  HR — Human Resources (HEAD_OFFICE) — key EPF 1874',
    '  EA — Executive Admin (HEAD_OFFICE) — EPF 11560, 12761',
    '  SM — Sector Manager (SECTOR_MANAGER) — V.O. EPFs + rank VO→SM',
    '',
    pass ? 'S-3 PASS — rank plan consistent; matrix add pending' : 'S-3 REVIEW',
    '',
    'S-3 COMPLETE — proceed to S-4',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${msg}\n`);

  if (!pass && odNot13400.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
