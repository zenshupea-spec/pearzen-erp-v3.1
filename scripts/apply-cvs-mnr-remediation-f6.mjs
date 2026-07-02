/**
 * F-6 — Apply HO / café rank and group fixes (CVS MNR remediation).
 * Does NOT touch status (F-1) or site (F-2).
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f6.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const KEY_HO_EPF = new Set(['10000', '13400', '1874', '8820', '11560', '12761']);
const CAFE_EPF = new Set(['8', '9', '10', '20']);

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

function normUpper(s) {
  return (s ?? '').trim().toUpperCase();
}

function log(line) {
  const msg = `[F-6 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
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

  const patchPath = join(outDir, 'remediation-employees-patch.csv');
  const patches = parseCsv(readFileSync(patchPath, 'utf8')).filter((p) => {
    const reason = (p.change_reason ?? '').toLowerCase();
    return reason.includes('rank') || reason.includes('group');
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  log(`Rank/group patches: ${patches.length}`);

  let updated = 0;
  let skipped = 0;
  const verify = [];

  for (const row of patches) {
    const epf = row.epf_no?.trim();
    const group = row.group?.trim();
    const rank = row.rank?.trim();
    if (!epf || !group || !rank) continue;

    const { data: before, error: readErr } = await supabase
      .from('employees')
      .select('emp_number, full_name, group, rank')
      .eq('company_id', CVS_COMPANY_ID)
      .eq('emp_number', epf)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!before) {
      log(`WARN not found EPF ${epf}`);
      continue;
    }

    const needsGroup = normUpper(before.group) !== normUpper(group);
    const needsRank = normUpper(before.rank) !== normUpper(rank);
    if (!needsGroup && !needsRank) {
      skipped += 1;
      log(`EPF ${epf} already ${group}/${rank}`);
      verify.push({ epf, group, rank, ok: true });
      continue;
    }

    const payload = {};
    if (needsGroup) payload.group = group;
    if (needsRank) payload.rank = rank;

    const after = await updateEmployee(supabase, epf, payload);
    if (!after) {
      log(`WARN update failed EPF ${epf}`);
      continue;
    }
    updated += 1;
    log(
      `EPF ${epf} ${before.full_name}: ` +
        `${before.group}/${before.rank} → ${after.group}/${after.rank}`,
    );
    verify.push({
      epf,
      group: after.group,
      rank: after.rank,
      ok: normUpper(after.group) === normUpper(group) && normUpper(after.rank) === normUpper(rank),
    });
  }

  const { data: mdRow } = await supabase
    .from('employees')
    .select('emp_number, group, rank')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('emp_number', '10000')
    .maybeSingle();
  const mdOk =
    mdRow &&
    normUpper(mdRow.group) === 'HEAD_OFFICE' &&
    normUpper(mdRow.rank) === 'MD';

  const { data: temporyRows, error: tempErr } = await supabase
    .from('employees')
    .select('emp_number, group, rank')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('site', 'TEMPORY')
    .neq('group', 'GUARD');
  if (tempErr) throw tempErr;

  const temporyNonGuard = (temporyRows ?? []).filter(
    (r) => !KEY_HO_EPF.has(String(r.emp_number)) && !CAFE_EPF.has(String(r.emp_number)),
  );

  const allOk = verify.every((v) => v.ok) && mdOk;

  const report = [
    '',
    '=== F-6 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `Patches: ${patches.length}`,
    `Updated: ${updated}`,
    `Already correct: ${skipped}`,
    `EPF 10000 MD verify: ${mdOk ? 'PASS' : 'FAIL'}`,
    `TEMPORY non-GUARD (excl. key HO/café): ${temporyNonGuard.length}`,
    ...(temporyNonGuard.length
      ? temporyNonGuard.slice(0, 10).map((r) => `  EPF ${r.emp_number} ${r.group}/${r.rank}`)
      : []),
    'Verify:',
    ...verify.map((v) => `  ${v.ok ? '✓' : '✗'} EPF ${v.epf} → ${v.group}/${v.rank}`),
    allOk ? 'F-6 PASS' : 'F-6 VERIFY FAIL',
    '',
    'F-6 COMPLETE — proceed to Phase G',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-6 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
