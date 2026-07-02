/**
 * F-2 — Fix wrongly placed employee sites (CVS MNR remediation).
 * Does NOT apply rank/group (F-6) or status (F-1).
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f2.mjs
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

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
  const msg = `[F-2 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const patchPath = join(outDir, 'remediation-employees-patch.csv');
  const classPath = join(outDir, 'remediation-classification.csv');
  const patches = parseCsv(readFileSync(patchPath, 'utf8')).filter((p) => {
    const reason = (p.change_reason ?? '').toLowerCase();
    return reason.includes('site') && !reason.includes('status');
  });

  const classRows = parseCsv(readFileSync(classPath, 'utf8'));
  const deployedReserve = classRows.filter(
    (r) =>
      r.bucket === 'DEPLOYED' &&
      (r.db_site ?? '').toUpperCase() === 'RESERVE',
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  log(`Site-only patches: ${patches.length}`);
  log(`DEPLOYED on RESERVE (must stay 0 fixes): ${deployedReserve.length}`);

  if (deployedReserve.length > 0) {
    for (const r of deployedReserve.slice(0, 20)) {
      log(`BLOCKED deployed-on-RESERVE EPF ${r.epf_no} ${r.full_name}`);
    }
    throw new Error('Refusing F-2: deployed guards on RESERVE detected');
  }

  let updated = 0;
  for (const row of patches) {
    const epf = row.epf_no?.trim();
    const site = row.site?.trim();
    if (!epf || !site) continue;

    const { data, error } = await supabase
      .from('employees')
      .update({ site })
      .eq('company_id', CVS_COMPANY_ID)
      .eq('emp_number', epf)
      .select('emp_number, site');

    if (error) throw error;
    if (!data?.length) {
      const { data: fb, error: e2 } = await supabase
        .from('employees')
        .update({ site })
        .eq('company_id', CVS_COMPANY_ID)
        .eq('epf_no', epf)
        .select('emp_number, site');
      if (e2) throw e2;
      if (!fb?.length) {
        log(`WARN not found EPF ${epf}`);
        continue;
      }
    }
    updated += 1;
    log(`EPF ${epf} → site "${site}"`);
  }

  const report = [
    '',
    '=== F-2 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `Site patches applied: ${updated}`,
    `DEPLOYED on RESERVE errors: ${deployedReserve.length}`,
    updated === patches.length ? 'F-2 PASS' : 'F-2 PARTIAL',
    '',
    'F-2 COMPLETE — proceed to F-3',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-2 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
