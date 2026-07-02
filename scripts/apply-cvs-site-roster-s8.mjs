/**
 * S-8 — Add OD/HR/EA/SM to rank matrix + apply sheet rank fixes.
 *
 * Usage: node scripts/apply-cvs-site-roster-s8.mjs
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { parseRankPayMatrix } from '../packages/rank-pay-matrix/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const classPath = join(outDir, 'site-roster-classification.csv');
const patchPath = join(outDir, 'site-roster-employees-patch.csv');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const VO_EPF_SET = new Set([
  '13650', '13496', '13033', '12410', '12222', '13069', '13085', '12208', '13875', '13470',
]);

const KEY_GROUP_RANK = {
  10000: { group: 'HEAD_OFFICE', rank: 'MD' },
  13400: { group: 'HEAD_OFFICE', rank: 'OD' },
  1874: { group: 'HEAD_OFFICE', rank: 'HR' },
  8820: { group: 'HEAD_OFFICE', rank: 'FM' },
  11560: { group: 'HEAD_OFFICE', rank: 'EA' },
  12761: { group: 'HEAD_OFFICE', rank: 'EA' },
};

/** New matrix codes — pay/group cloned from legacy operator equivalents. */
const NEW_MATRIX_ENTRIES = [
  {
    id: 'rp-sm',
    rankCode: 'SM',
    fullTitle: 'SECTOR MANAGER',
    template: 'VO',
  },
  {
    id: 'rp-hr',
    rankCode: 'HR',
    fullTitle: 'HUMAN RESOURCES',
    template: 'HRA',
  },
  {
    id: 'rp-ea',
    rankCode: 'EA',
    fullTitle: 'EXECUTIVE ADMIN',
    template: 'EXF',
  },
  {
    id: 'rp-od',
    rankCode: 'OD',
    fullTitle: 'OPERATIONS DIRECTOR',
    template: 'MF',
    basicPayOverride: 150000,
  },
];

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

function log(line) {
  const msg = `[S-8 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

function groupForRank(epf, rank, pool) {
  if (KEY_GROUP_RANK[epf]) return KEY_GROUP_RANK[epf].group;
  if (pool === 'RESIGNED' || pool === 'INACTIVE' || pool === 'TEMPORY') return 'GUARD';
  if (normUpper(rank) === 'SM' && (VO_EPF_SET.has(epf) || pool === 'SECTOR_MANAGER')) {
    return 'SECTOR_MANAGER';
  }
  if (pool === 'HEAD_OFFICE') return 'HEAD_OFFICE';
  if (pool === 'CAFE') return 'CAFE';
  return 'GUARD';
}

function buildNewEntry(def, matrix) {
  const template = matrix.find((r) => r.rankCode === def.template);
  if (!template && !def.basicPayOverride) {
    throw new Error(`Missing template rank ${def.template} for ${def.rankCode}`);
  }
  return {
    id: def.id,
    rankCode: def.rankCode,
    fullTitle: def.fullTitle,
    basicPay: def.basicPayOverride ?? template.basicPay,
    annualIncrement: template?.annualIncrement ?? 1200,
    salaryType: template?.salaryType ?? 'BANK',
    operationalGroup:
      def.rankCode === 'SM' ? 'SECTOR_MANAGER' : template?.operationalGroup ?? 'HEAD_OFFICE',
  };
}

async function updateEmployee(supabase, epf, payload) {
  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('company_id', CVS_COMPANY_ID)
    .eq('emp_number', epf)
    .select('emp_number, group, rank');
  if (error) throw error;
  if (data?.length) return data[0];

  const { data: fb, error: e2 } = await supabase
    .from('employees')
    .update(payload)
    .eq('company_id', CVS_COMPANY_ID)
    .eq('epf_no', epf)
    .select('emp_number, group, rank');
  if (e2) throw e2;
  return fb?.[0] ?? null;
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(classPath)) throw new Error('Missing site-roster-classification.csv');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  const { data: settings, error: settingsErr } = await supabase
    .from('md_settings')
    .select('id, rank_pay_matrix')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settings?.id) throw new Error('md_settings row missing for CVS');

  let matrix = parseRankPayMatrix(settings.rank_pay_matrix);
  const codes = new Set(matrix.map((r) => r.rankCode));
  const added = [];

  for (const def of NEW_MATRIX_ENTRIES) {
    if (codes.has(def.rankCode)) {
      log(`Matrix already has ${def.rankCode}`);
      continue;
    }
    const entry = buildNewEntry(def, matrix);
    matrix.push(entry);
    codes.add(def.rankCode);
    added.push(def.rankCode);
    log(`Matrix add ${def.rankCode} — ${entry.fullTitle} (${entry.operationalGroup})`);
  }

  if (added.length) {
    const { error: matrixErr } = await supabase
      .from('md_settings')
      .update({ rank_pay_matrix: matrix })
      .eq('company_id', CVS_COMPANY_ID);
    if (matrixErr) throw matrixErr;
  }

  const classRows = parseCsv(readFileSync(classPath, 'utf8')).filter(
    (r) =>
      r.mismatch_rank === 'Y' &&
      r.intended_rank &&
      r.intended_pool !== 'DB_ONLY' &&
      r.intended_pool !== 'JUNK',
  );

  let updated = 0;
  let skipped = 0;
  const failures = [];

  for (const row of classRows) {
    const epf = row.epf_no.trim();
    const targetRank = normUpper(row.intended_rank);
    const targetGroup = groupForRank(epf, targetRank, row.intended_pool);
    const dbRank = normUpper(row.db_rank);
    const dbGroup = normUpper(row.db_group);

    const payload = {};
    if (dbRank !== targetRank) payload.rank = targetRank;
    if (dbGroup !== targetGroup) payload.group = targetGroup;
    if (!Object.keys(payload).length) {
      skipped += 1;
      continue;
    }

    const after = await updateEmployee(supabase, epf, payload);
    if (!after) {
      failures.push({ epf, reason: 'not found' });
      log(`WARN not found EPF ${epf}`);
      continue;
    }

    updated += 1;
    log(
      `EPF ${epf} ${row.full_name}: ` +
        `${row.db_group || '—'}/${row.db_rank || '—'} → ${after.group}/${after.rank}`,
    );
  }

  const verifyMatrix = parseRankPayMatrix(
    (
      await supabase
        .from('md_settings')
        .select('rank_pay_matrix')
        .eq('company_id', CVS_COMPANY_ID)
        .maybeSingle()
    ).data?.rank_pay_matrix,
  );
  const verifyCodes = new Set(verifyMatrix.map((r) => r.rankCode));
  const matrixOk = ['OD', 'HR', 'EA', 'SM'].every((c) => verifyCodes.has(c));

  const remaining = parseCsv(readFileSync(classPath, 'utf8')).filter(
    (r) => r.mismatch_rank === 'Y' && r.intended_pool !== 'DB_ONLY',
  ).length;

  const report = [
    '',
    '=== S-8 APPLY SUMMARY ===',
    `Run at: ${new Date().toISOString()}`,
    `Matrix codes added: ${added.length ? added.join(', ') : 'none (already present)'}`,
    `Matrix verify OD/HR/EA/SM: ${matrixOk ? 'PASS' : 'FAIL'}`,
    `Rank patches from classification: ${classRows.length}`,
    `Employees updated: ${updated}`,
    `Already correct: ${skipped}`,
    `Not found: ${failures.length}`,
    `Classification rank mismatches remaining (stale CSV): ${remaining}`,
    failures.length === 0 && matrixOk ? 'S-8 PASS' : 'S-8 REVIEW',
    '',
    'S-8 COMPLETE — proceed to S-9',
  ];

  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (!matrixOk || failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'site-roster-apply-log.txt'),
    `${new Date().toISOString()} [S-8 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
