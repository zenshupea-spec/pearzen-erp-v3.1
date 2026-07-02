/**
 * E-1 — Build remediation-employees-patch.csv from remediation-classification.csv
 *
 * Usage: node scripts/build-cvs-mnr-remediation-employee-patch.mjs
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');

const VO_EPF_SET = new Set([
  '13650', '13496', '13033', '12410', '12222', '13069', '13085', '12208', '13875', '13470',
]);

/** Operator-confirmed HO / café roster overrides (group + rank). */
const RANK_GROUP_OVERRIDE = {
  10000: { group: 'HEAD_OFFICE', rank: 'MD' },
  13400: { group: 'HEAD_OFFICE', rank: 'OD' },
  1874: { group: 'HEAD_OFFICE', rank: 'HR' },
  8820: { group: 'HEAD_OFFICE', rank: 'FM' },
  11560: { group: 'HEAD_OFFICE', rank: 'EA' },
  12761: { group: 'HEAD_OFFICE', rank: 'EA' },
  8: { group: 'CAFE', rank: 'MOP' },
  9: { group: 'CAFE', rank: 'MOP' },
  10: { group: 'CAFE', rank: 'MOP' },
  20: { group: 'CAFE', rank: 'MOP' },
};

const PATCH_COLUMNS = ['epf_no', 'full_name', 'site', 'status', 'group', 'rank', 'change_reason'];

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

function normUpper(s) {
  return (s ?? '').trim().toUpperCase();
}

function intendedGroupRank(row) {
  const epf = row.epf_no;
  if (RANK_GROUP_OVERRIDE[epf]) return RANK_GROUP_OVERRIDE[epf];
  if (VO_EPF_SET.has(epf)) return { group: 'SECTOR_MANAGER', rank: 'VO' };
  return null;
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

function main() {
  const classPath = join(outDir, 'remediation-classification.csv');
  const rows = parseCsv(readFileSync(classPath, 'utf8'));
  const patches = [];

  for (const row of rows) {
    const reasons = [];
    const patch = {
      epf_no: row.epf_no,
      full_name: row.full_name,
      site: row.db_site,
      status: row.db_status,
      group: row.db_group,
      rank: row.db_rank,
      change_reason: '',
    };

    if (row.mismatch_site === 'Y') {
      patch.site = row.intended_site;
      reasons.push('site');
    }

    if (row.mismatch_status === 'Y') {
      patch.status = row.intended_status;
      reasons.push('status');
    }

    const override = intendedGroupRank(row);
    if (override) {
      if (normUpper(row.db_group) !== normUpper(override.group)) {
        patch.group = override.group;
        reasons.push('group');
      }
      if (normUpper(row.db_rank) !== normUpper(override.rank)) {
        patch.rank = override.rank;
        reasons.push('rank');
      }
      if (
        RANK_GROUP_OVERRIDE[row.epf_no] &&
        row.mismatch_site === 'N' &&
        normUpper(row.db_site) !== normUpper(row.intended_site)
      ) {
        patch.site = row.intended_site;
        if (!reasons.includes('site')) reasons.push('site');
      }
    }

  if (reasons.length) {
      patch.change_reason = reasons.join('+');
      patches.push(patch);
    }
  }

  const outPath = join(outDir, 'remediation-employees-patch.csv');
  writeFileSync(outPath, toCsv(PATCH_COLUMNS, patches));

  const byReason = {};
  for (const p of patches) {
    for (const r of p.change_reason.split('+')) {
      byReason[r] = (byReason[r] ?? 0) + 1;
    }
  }

  const statusOnly = patches.filter((p) => p.change_reason === 'status').length;
  const resigned = patches.filter((p) => normStatus(p.status) === 'resigned').length;

  const lines = [
    '',
    '=== E-1 EMPLOYEE PATCH FILE ===',
    `Run at: ${new Date().toISOString()}`,
    `Output: ${outPath}`,
    `Patch rows: ${patches.length}`,
    `  status-only: ${statusOnly}`,
    `  → Resigned: ${resigned}`,
    'Change types:',
    ...Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    'E-1 COMPLETE — proceed to E-2 (remediation-sites-patch.csv)',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main();
