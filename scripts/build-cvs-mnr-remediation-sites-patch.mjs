/**
 * E-2 — Build remediation-sites-patch.csv from remediation-classification.csv
 *
 * Usage: node scripts/build-cvs-mnr-remediation-sites-patch.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const PSEUDO_SITES = new Set(['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE']);

const PATCH_COLUMNS = [
  'site_name',
  'required_guards',
  'assigned_sm_epf',
  'db_required_guards',
  'db_assigned_sm_epf',
  'change_reason',
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

function aggregateSites(classRows) {
  const bySite = new Map();

  for (const row of classRows) {
    const site = (row.intended_site ?? '').trim();
    if (!site) continue;

    if (!bySite.has(site)) {
      bySite.set(site, { guardCount: 0, smCounts: new Map() });
    }
    const entry = bySite.get(site);

    if (normStatus(row.intended_status) !== 'resigned') {
      entry.guardCount += 1;
    }

    const sm = (row.intended_sm_epf ?? '').trim();
    if (sm) {
      entry.smCounts.set(sm, (entry.smCounts.get(sm) ?? 0) + 1);
    }
  }

  const sites = [];
  for (const [siteName, entry] of bySite) {
    let assignedSm = '';
    let max = 0;
    for (const [sm, cnt] of entry.smCounts) {
      if (cnt > max) {
        max = cnt;
        assignedSm = sm;
      }
    }
    if (!assignedSm && PSEUDO_SITES.has(siteName.toUpperCase())) {
      assignedSm = '';
    }

    sites.push({
      site_name: siteName,
      required_guards: entry.guardCount,
      assigned_sm_epf: assignedSm,
    });
  }

  return sites.sort((a, b) => a.site_name.localeCompare(b.site_name));
}

async function fetchDbSites(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('site_profiles')
      .select('site_name, required_guards, assigned_sm_epf')
      .eq('company_id', CVS_COMPANY_ID)
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
  if (!existsSync(classPath)) throw new Error('Missing remediation-classification.csv — run D-3 first');

  const classRows = parseCsv(readFileSync(classPath, 'utf8'));
  const intended = aggregateSites(classRows);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const dbSites = await fetchDbSites(supabase);
  const dbByName = new Map(
    dbSites.map((s) => [(s.site_name ?? '').trim().toUpperCase(), s]),
  );

  const patches = [];
  for (const site of intended) {
    const db = dbByName.get(site.site_name.toUpperCase());
    const dbGuards = db?.required_guards ?? null;
    const dbSm = (db?.assigned_sm_epf ?? '').trim();

    const reasons = [];
    if (!db) {
      reasons.push('missing_in_db');
    } else {
      if (Number(dbGuards) !== site.required_guards) reasons.push('required_guards');
      if (dbSm !== site.assigned_sm_epf) reasons.push('assigned_sm_epf');
    }

    if (reasons.length) {
      patches.push({
        site_name: site.site_name,
        required_guards: site.required_guards,
        assigned_sm_epf: site.assigned_sm_epf,
        db_required_guards: dbGuards ?? '',
        db_assigned_sm_epf: dbSm,
        change_reason: reasons.join('+'),
      });
    }
  }

  const outPath = join(outDir, 'remediation-sites-patch.csv');
  writeFileSync(outPath, toCsv(PATCH_COLUMNS, patches));

  const clearance = intended.find((s) => s.site_name === 'CLEARANCE');
  const reserve = intended.find((s) => s.site_name === 'RESERVE');

  const byReason = {};
  for (const p of patches) {
    for (const r of p.change_reason.split('+')) {
      byReason[r] = (byReason[r] ?? 0) + 1;
    }
  }

  const lines = [
    '',
    '=== E-2 SITES PATCH FILE ===',
    `Run at: ${new Date().toISOString()}`,
    `Output: ${outPath}`,
    `Intended sites from classification: ${intended.length}`,
    `Patch rows (DB delta): ${patches.length}`,
    `  CLEARANCE required_guards: ${clearance?.required_guards ?? 'n/a'} (was 305 ACTIVE — drops to 0 after F-1)`,
    `  RESERVE required_guards: ${reserve?.required_guards ?? 'n/a'}`,
    'Change types:',
    ...Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    '',
    'E-2 COMPLETE — proceed to E-3 (remediation-sm-guard-links-patch.csv)',
  ];

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
