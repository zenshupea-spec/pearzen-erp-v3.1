/**
 * F-3 — Refresh site_profiles required_guards + assigned_sm_epf.
 *
 * Usage: node scripts/apply-cvs-mnr-remediation-f3.mjs
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
  const msg = `[F-3 APPLY] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const patchPath = join(outDir, 'remediation-sites-patch.csv');
  if (!existsSync(patchPath)) throw new Error('Missing remediation-sites-patch.csv');

  const patches = parseCsv(readFileSync(patchPath, 'utf8'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  let updated = 0;
  let skipped = 0;
  const noSm = [];

  for (const row of patches) {
    const siteName = row.site_name?.trim();
    if (!siteName) continue;

    if (row.change_reason?.includes('missing_in_db')) {
      log(`SKIP insert "${siteName}" — seed/bench row not in production directory`);
      skipped += 1;
      continue;
    }

    const requiredGuards = Number(row.required_guards);
    const payload = {
      required_guards: Number.isFinite(requiredGuards) ? requiredGuards : 0,
    };
    if (row.assigned_sm_epf?.trim()) {
      payload.assigned_sm_epf = row.assigned_sm_epf.trim();
    }

    const { data, error } = await supabase
      .from('site_profiles')
      .update(payload)
      .eq('company_id', CVS_COMPANY_ID)
      .eq('site_name', siteName)
      .select('site_name, required_guards, assigned_sm_epf');

    if (error) throw error;
    if (!data?.length) {
      log(`WARN site not found: "${siteName}"`);
      skipped += 1;
      continue;
    }

    updated += 1;
    const sm = data[0].assigned_sm_epf;
    if (
      !sm &&
      requiredGuards > 0 &&
      !['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'].includes(siteName)
    ) {
      noSm.push(siteName);
    }
    log(`"${siteName}" required_guards=${data[0].required_guards} sm=${sm ?? '(none)'}`);
  }

  const { count: clearanceGuards } = await supabase
    .from('site_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID)
    .eq('site_name', 'CLEARANCE');

  const { data: clearanceRow } = await supabase
    .from('site_profiles')
    .select('required_guards')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('site_name', 'CLEARANCE')
    .maybeSingle();

  const report = [
    '',
    '=== F-3 APPLY LOG ===',
    `Run at: ${new Date().toISOString()}`,
    `Sites updated: ${updated}`,
    `Skipped: ${skipped}`,
    `CLEARANCE required_guards: ${clearanceRow?.required_guards ?? 'n/a'} (expect 0)`,
    noSm.length ? `SITE_NO_SM flags: ${noSm.join(', ')}` : 'SITE_NO_SM: none in patch set',
    Number(clearanceRow?.required_guards) === 0 ? 'F-3 PASS' : 'F-3 CHECK CLEARANCE COUNT',
    '',
    'F-3 COMPLETE — proceed to F-4',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [F-3 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
