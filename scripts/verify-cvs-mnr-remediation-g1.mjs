/**
 * G-1 — Post-remediation Supabase count verification (read-only).
 *
 * Usage: node scripts/verify-cvs-mnr-remediation-g1.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const PSEUDO_SITES = ['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'];

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

function near(actual, expected, tolerance = 5) {
  return Math.abs(actual - expected) <= tolerance;
}

async function countEmployees(supabase, filters) {
  let q = supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', CVS_COMPANY_ID);
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) q = q.in(key, value);
    else q = q.eq(key, value);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function fetchAllEmployees(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('emp_number, status, site, group')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function countSmLinks(supabase) {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const { count, error } = await supabase
      .from('sm_guard_assignments')
      .select('guard_epf', { count: 'exact', head: true })
      .range(from, from + 999);
    if (error) throw error;
    total = count ?? 0;
    break;
  }
  return total;
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const classRows = parseCsv(readFileSync(join(outDir, 'remediation-classification.csv'), 'utf8'));
  const expectedDeployed = classRows.filter((r) => r.bucket === 'DEPLOYED').length;
  const expectedReserve = classRows.filter((r) => r.bucket === 'RESERVE').length;
  const expectedClearanceResigned = classRows.filter(
    (r) =>
      r.bucket === 'RESIGNED' &&
      (r.intended_site ?? '').trim().toUpperCase() === 'CLEARANCE',
  ).length;
  const deployedEpfs = new Set(
    classRows.filter((r) => r.bucket === 'DEPLOYED').map((r) => String(r.epf_no)),
  );

  const [
    totalEmployees,
    activeReserve,
    resignedClearance,
    activeClearance,
    smLinks,
    employees,
  ] = await Promise.all([
    countEmployees(supabase, {}),
    countEmployees(supabase, { site: 'RESERVE', status: 'ACTIVE' }),
    countEmployees(supabase, { site: 'CLEARANCE', status: 'Resigned' }),
    countEmployees(supabase, { site: 'CLEARANCE', status: 'ACTIVE' }),
    countSmLinks(supabase),
    fetchAllEmployees(supabase),
  ]);

  const pseudoUpper = new Set(PSEUDO_SITES.map((s) => s.toUpperCase()));
  let deployedBucketOk = 0;
  let deployedBucketBad = 0;
  for (const epf of deployedEpfs) {
    const e = employees.find((row) => String(row.emp_number) === epf);
    if (
      e &&
      normStatus(e.status) === 'active' &&
      !pseudoUpper.has((e.site ?? '').trim().toUpperCase())
    ) {
      deployedBucketOk += 1;
    } else {
      deployedBucketBad += 1;
    }
  }

  const activeNonPseudoOther = employees.filter(
    (e) =>
      normStatus(e.status) === 'active' &&
      !pseudoUpper.has((e.site ?? '').trim().toUpperCase()) &&
      !deployedEpfs.has(String(e.emp_number)),
  ).length;

  const checks = [
    {
      name: 'ACTIVE on RESERVE',
      actual: activeReserve,
      expected: expectedReserve,
      ok: near(activeReserve, expectedReserve, 2),
    },
    {
      name: 'Resigned on CLEARANCE',
      actual: resignedClearance,
      expected: expectedClearanceResigned,
      ok: resignedClearance === expectedClearanceResigned,
    },
    {
      name: 'ACTIVE on CLEARANCE (must be 0)',
      actual: activeClearance,
      expected: 0,
      ok: activeClearance === 0,
    },
    {
      name: 'DEPLOYED bucket (Loc A–J guards)',
      actual: deployedBucketOk,
      expected: expectedDeployed,
      ok: deployedBucketBad === 0 && deployedBucketOk === expectedDeployed,
    },
    {
      name: 'sm_guard_assignments',
      actual: smLinks,
      expected: expectedDeployed,
      ok: smLinks === expectedDeployed,
    },
    {
      name: 'ACTIVE non-pseudo outside DEPLOYED (info)',
      actual: activeNonPseudoOther,
      expected: null,
      ok: true,
    },
  ];

  const siteCounts = {};
  for (const e of employees) {
    const site = (e.site ?? 'UNKNOWN').trim();
    const key = `${site}|${e.status ?? ''}`;
    siteCounts[key] = (siteCounts[key] ?? 0) + 1;
  }

  const topSites = Object.entries(siteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const allOk = checks.every((c) => c.ok);

  const report = [
    '',
    '=== G-1 SUPABASE COUNTS ===',
    `Run at: ${new Date().toISOString()}`,
    `Total employees: ${totalEmployees}`,
    '',
    'Checks:',
    ...checks.map((c) => {
      const exp = c.expected === null ? 'n/a' : c.expected;
      return `  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.actual} (expected ${exp})`;
    }),
    '',
    'Site/status snapshot (top):',
    ...topSites.map(([k, v]) => `  ${k}: ${v}`),
    '',
    allOk ? 'G-1 PASS' : 'G-1 FAIL',
    '',
    'G-1 COMPLETE — proceed to G-2',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${msg}\n`);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [G-1 VERIFY] ${allOk ? 'PASS' : 'FAIL'}\n`,
  );

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
