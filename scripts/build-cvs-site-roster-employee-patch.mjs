/**
 * S-4 — Build site-roster-employees-patch.csv from classification + operator decisions.
 *
 * Rules (2026-06-26):
 *   - Import 6 sheet EPFs missing from DB
 *   - Delete 10 DB-only test/seed rows
 *   - DCSL HEAD OFFICE = client site (not HQ)
 *   - Rank/site/status always follow operator sheet
 *
 * Usage: node scripts/build-cvs-site-roster-employee-patch.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const classPath = join(outDir, 'site-roster-classification.csv');
const sheetPath = join(
  outDir,
  'archive/operator-sources/SITE-CODE-AND-NAMES-2026-06-26.xlsx',
);

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
  8: { group: 'CAFE', rank: 'MOP' },
  9: { group: 'CAFE', rank: 'MOP' },
  10: { group: 'CAFE', rank: 'MOP' },
  20: { group: 'CAFE', rank: 'MOP' },
};

const PATCH_COLUMNS = [
  'action',
  'epf_no',
  'full_name',
  'site',
  'status',
  'group',
  'rank',
  'nic',
  'change_reason',
];

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

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

function normUpper(s) {
  return (s ?? '').trim().toUpperCase();
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

function groupFromPool(pool, epf) {
  if (KEY_GROUP_RANK[epf]) return KEY_GROUP_RANK[epf].group;
  if (VO_EPF_SET.has(epf)) return 'SECTOR_MANAGER';
  switch (pool) {
    case 'HEAD_OFFICE':
      return 'HEAD_OFFICE';
    case 'SECTOR_MANAGER':
      return 'SECTOR_MANAGER';
    case 'CAFE':
      return 'CAFE';
    default:
      return 'GUARD';
  }
}

function rankFromRow(row) {
  if (KEY_GROUP_RANK[row.epf_no]) return KEY_GROUP_RANK[row.epf_no].rank;
  if (VO_EPF_SET.has(row.epf_no)) return 'SM';
  return row.intended_rank || row.sheet_rank || row.db_rank || '';
}

function loadSheetNicByEpf() {
  const XLSX = require(join(root, 'node_modules/xlsx'));
  const wb = XLSX.readFile(sheetPath, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1, {
    defval: '',
    header: [
      'serial',
      'EPF_no',
      'Rank_Code',
      'Name',
      'NIC',
      'Date_Joined',
      'Site_Code',
      'Col7',
      'Site_Name',
      'Col9',
    ],
    range: 0,
  });
  const map = new Map();
  for (const row of rows) {
    const epf = String(row.EPF_no ?? '').trim();
    if (/^\d+$/.test(epf)) map.set(epf, String(row.NIC ?? '').trim());
  }
  return map;
}

function main() {
  if (!existsSync(classPath)) throw new Error('Run S-1 first — missing site-roster-classification.csv');

  const rows = parseCsv(readFileSync(classPath, 'utf8'));
  const nicByEpf = loadSheetNicByEpf();
  const patches = [];

  for (const row of rows) {
    if (row.intended_pool === 'DB_ONLY') {
      patches.push({
        action: 'DELETE',
        epf_no: row.epf_no,
        full_name: row.full_name,
        site: row.db_site,
        status: row.db_status,
        group: row.db_group,
        rank: row.db_rank,
        nic: '',
        change_reason: 'delete_db_only_not_in_sheet',
      });
      continue;
    }

    const missingDb = !row.db_site && !row.db_status && !row.db_rank;
    const targetGroup = groupFromPool(row.intended_pool, row.epf_no);
    const targetRank = rankFromRow(row);
    const targetSite = row.intended_site;
    const targetStatus = row.intended_status;

    if (missingDb) {
      patches.push({
        action: 'IMPORT',
        epf_no: row.epf_no,
        full_name: row.full_name,
        site: targetSite,
        status: targetStatus,
        group: targetGroup,
        rank: targetRank,
        nic: nicByEpf.get(row.epf_no) ?? '',
        change_reason: 'import_sheet_missing_db',
      });
      continue;
    }

    const reasons = [];
    const patch = {
      action: 'UPDATE',
      epf_no: row.epf_no,
      full_name: row.full_name,
      site: row.db_site,
      status: row.db_status,
      group: row.db_group,
      rank: row.db_rank,
      nic: '',
      change_reason: '',
    };

    if (row.mismatch_site === 'Y' && normUpper(row.db_site) !== normUpper(targetSite)) {
      patch.site = targetSite;
      reasons.push('site');
    }
    if (row.mismatch_status === 'Y' && normStatus(row.db_status) !== normStatus(targetStatus)) {
      patch.status = targetStatus;
      reasons.push('status');
    }
    if (normUpper(row.db_group) !== normUpper(targetGroup)) {
      patch.group = targetGroup;
      reasons.push('group');
    }
    if (normUpper(row.db_rank) !== normUpper(targetRank)) {
      patch.rank = targetRank;
      reasons.push('rank');
    }

    if (reasons.length) {
      patch.change_reason = reasons.join('+');
      patches.push(patch);
    }
  }

  const outPath = join(outDir, 'site-roster-employees-patch.csv');
  writeFileSync(outPath, toCsv(PATCH_COLUMNS, patches));

  const byAction = { IMPORT: 0, UPDATE: 0, DELETE: 0 };
  const byReason = {};
  const siteUpdates = patches.filter((p) => p.action === 'UPDATE' && p.change_reason.includes('site'));
  const statusUpdates = patches.filter((p) => p.action === 'UPDATE' && p.change_reason.includes('status'));
  const rankUpdates = patches.filter((p) => p.action === 'UPDATE' && p.change_reason.includes('rank'));

  for (const p of patches) {
    byAction[p.action] = (byAction[p.action] ?? 0) + 1;
    for (const r of p.change_reason.split('+').filter(Boolean)) {
      byReason[r] = (byReason[r] ?? 0) + 1;
    }
  }

  const report = [
    '',
    '=== S-4 SITE + STATUS PATCH REPORT ===',
    `Run at: ${new Date().toISOString()}`,
    `Output: ${outPath}`,
    `Patch rows: ${patches.length}`,
    `  IMPORT (sheet missing DB): ${byAction.IMPORT ?? 0}`,
    `  UPDATE: ${byAction.UPDATE ?? 0}`,
    `  DELETE (DB-only not in sheet): ${byAction.DELETE ?? 0}`,
    '',
    'Operator decisions applied:',
    '  · Import 6 missing EPFs from sheet',
    '  · Delete 10 DB-only test/seed rows',
    '  · DCSL HEAD OFFICE = client site (not HQ HEAD OFFICE)',
    '  · Rank/site/status always follow sheet',
    '',
    'UPDATE breakdown:',
    `  site changes: ${siteUpdates.length}`,
    `  status changes: ${statusUpdates.length}`,
    `  rank changes (apply in S-8): ${rankUpdates.length}`,
    'Change types:',
    ...Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    'IMPORT rows:',
    ...patches
      .filter((p) => p.action === 'IMPORT')
      .map((p) => `  · EPF ${p.epf_no} — ${p.full_name} @ ${p.site} (${p.status})`),
    '',
    'DELETE rows:',
    ...patches
      .filter((p) => p.action === 'DELETE')
      .map((p) => `  · EPF ${p.epf_no} — ${p.full_name}`),
    '',
    ...(siteUpdates.length
      ? [
          'Site mismatch fixes (sample):',
          ...siteUpdates.slice(0, 15).map((p) => {
            const row = rows.find((r) => r.epf_no === p.epf_no);
            return `  · EPF ${p.epf_no}: ${row?.db_site || '—'} → ${p.site}`;
          }),
          ...(siteUpdates.length > 15 ? [`  … +${siteUpdates.length -  15} more`] : []),
        ]
      : ['Site mismatch fixes: none']),
    '',
    'S-4 PASS — patch ready for operator review (no apply yet)',
    '',
    'S-4 COMPLETE — proceed to S-5 (MNR UI) or S-7 (apply patch)',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${msg}\n`);
}

main();
