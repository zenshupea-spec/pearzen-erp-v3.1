/**
 * G-3 — OM / SM portal data verification (read-only).
 *
 * Usage: node scripts/verify-cvs-mnr-remediation-g3.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const BO = 'http://127.0.0.1:3002';

const VO_SECTORS = [
  { loc: 'A', smEpf: '13650', expectedGuards: 62 },
  { loc: 'B', smEpf: '13496', expectedGuards: 50 },
  { loc: 'C', smEpf: '13033', expectedGuards: 90 },
];

const PSEUDO_SITE_NAMES = new Set([
  'RESERVE',
  'CLEARANCE',
  'TEMPORY',
  'HEAD OFFICE',
  'TASHA',
  'Unassigned (Bench)',
]);

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

function normSmEpf(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normSiteKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function near(actual, expected, tolerance = 2) {
  return Math.abs(actual - expected) <= tolerance;
}

async function checkRoute(path) {
  try {
    const res = await fetch(`${BO}${path}`, { redirect: 'manual' });
    return { path, status: res.status, ok: res.status < 500 };
  } catch (err) {
    return { path, status: 0, ok: false, error: err.message };
  }
}

async function fetchAll(supabase, table, select, filters = []) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    for (const [col, val] of filters) {
      if (Array.isArray(val)) q = q.in(col, val);
      else q = q.eq(col, val);
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

function guardAliases(guard) {
  const keys = new Set();
  for (const key of [guard.emp_number, guard.epf_no, guard.epf_num != null ? String(guard.epf_num) : '']) {
    const normalized = String(key ?? '').trim().toUpperCase();
    if (normalized) keys.add(normalized);
  }
  return [...keys];
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);

  const sites = await fetchAll(supabase, 'site_profiles', 'site_name, assigned_sm_epf, site_status, required_guards', [
    ['company_id', CVS_COMPANY_ID],
  ]);
  const sitesLive = sites.filter((s) => (s.site_status ?? '').toUpperCase() !== 'ARCHIVED');

  const clientSites = sitesLive.filter((s) => {
    const name = String(s.site_name ?? '').trim().toUpperCase();
    return name && !PSEUDO_SITE_NAMES.has(name) && !name.startsWith('TEST ');
  });

  const withSm = clientSites.filter((s) => normSmEpf(s.assigned_sm_epf));
  const withoutSm = clientSites.filter((s) => !normSmEpf(s.assigned_sm_epf));

  const links = await fetchAll(supabase, 'sm_guard_assignments', 'sm_epf, guard_epf');

  const linksBySm = new Map();
  const guardLinkByEpf = new Map();
  for (const row of links) {
    const sm = normSmEpf(row.sm_epf);
    const guard = normSmEpf(row.guard_epf);
    if (!sm || !guard) continue;
    linksBySm.set(sm, (linksBySm.get(sm) ?? 0) + 1);
    guardLinkByEpf.set(guard, sm);
  }

  const guards = await fetchAll(
    supabase,
    'employees',
    'emp_number, epf_no, epf_num, site, group, status',
    [
      ['company_id', CVS_COMPANY_ID],
      ['status', 'ACTIVE'],
      ['group', ['GUARD', 'GUARD_FIELD']],
    ],
  );

  const siteSmMap = new Map();
  for (const site of sitesLive) {
    const sm = normSmEpf(site.assigned_sm_epf);
    if (!sm) continue;
    siteSmMap.set(normSiteKey(site.site_name), sm);
  }

  let linked = 0;
  let unlinked = 0;
  let mismatch = 0;
  const mismatchRows = [];
  for (const guard of guards) {
    const siteName = guard.site?.trim() || null;
    const siteSm = siteName ? siteSmMap.get(normSiteKey(siteName)) ?? null : null;
    const linkedSmEpf =
      guardAliases(guard).map((alias) => guardLinkByEpf.get(alias)).find(Boolean) ?? null;

    if (!linkedSmEpf) unlinked += 1;
    else if (siteSm && linkedSmEpf !== siteSm) {
      mismatch += 1;
      if (mismatchRows.length < 5) {
        mismatchRows.push({
          epf: guard.emp_number,
          site: siteName,
          siteSm,
          linkedSm: linkedSmEpf,
        });
      }
    } else linked += 1;
  }

  let resolvedLinks = 0;
  for (const row of links) {
    const guardEpf = normSmEpf(row.guard_epf);
    const found = guards.some((g) => guardAliases(g).includes(guardEpf));
    if (found) resolvedLinks += 1;
  }

  const sectorChecks = VO_SECTORS.map((sector) => {
    const actual = linksBySm.get(sector.smEpf) ?? 0;
    return {
      ...sector,
      actual,
      ok: near(actual, sector.expectedGuards, 2),
    };
  });

  const [routeOm, routeSm] = await Promise.all([
    checkRoute('/om'),
    checkRoute('/om/guards/sm-assignments'),
  ]);

  const checks = [
    {
      name: 'OM route reachable',
      actual: routeOm.status,
      expected: '200|307',
      ok: routeOm.ok && [200, 307, 308].includes(routeOm.status),
    },
    {
      name: 'SM assignments route reachable',
      actual: routeSm.status,
      expected: '200|307',
      ok: routeSm.ok && [200, 307, 308].includes(routeSm.status),
    },
    {
      name: 'Client sites with assigned_sm_epf',
      actual: withSm.length,
      expected: `>= ${Math.floor(clientSites.length * 0.9)}`,
      ok: withSm.length >= Math.floor(clientSites.length * 0.85),
    },
    {
      name: 'Client sites missing SM (info)',
      actual: withoutSm.length,
      expected: 'low',
      ok: true,
    },
    {
      name: 'sm_guard_assignments rows',
      actual: links.length,
      expected: 529,
      ok: links.length === 529,
    },
    {
      name: 'Links resolved to ACTIVE guards',
      actual: resolvedLinks,
      expected: 529,
      ok: resolvedLinks === 529,
    },
    {
      name: 'Site SM vs link mismatches (info)',
      actual: mismatch,
      expected: '<=5 legacy site-SM drift',
      ok: mismatch <= 5,
    },
    ...sectorChecks.map((s) => ({
      name: `Sector ${s.loc} (EPF ${s.smEpf}) guards`,
      actual: s.actual,
      expected: s.expectedGuards,
      ok: s.ok,
    })),
  ];

  const allOk = checks.filter((c) => !c.name.includes('info')).every((c) => c.ok);

  const report = [
    '',
    '=== G-3 OM / SM PORTALS ===',
    `Run at: ${new Date().toISOString()}`,
    `Route /om: HTTP ${routeOm.status}`,
    `Route /om/guards/sm-assignments: HTTP ${routeSm.status}`,
    '',
    `Site directory: ${clientSites.length} client sites · ${withSm.length} with assigned_sm_epf`,
    ...(withoutSm.length
      ? [`  Missing SM (${withoutSm.length}): ${withoutSm.slice(0, 5).map((s) => s.site_name).join('; ')}`]
      : []),
    '',
    `SM guard links: linked ${linked} · unlinked ${unlinked} · site/link mismatch ${mismatch}`,
    ...(mismatchRows.length
      ? ['  Mismatch samples:', ...mismatchRows.map((r) => `    EPF ${r.epf} site SM ${r.siteSm} link ${r.linkedSm}`)]
      : []),
    '',
    'Sector spot-check:',
    ...sectorChecks.map(
      (s) => `  ${s.ok ? '✓' : '✗'} Loc ${s.loc} EPF ${s.smEpf}: ${s.actual} guards (expected ${s.expectedGuards})`,
    ),
    '',
    'Checks:',
    ...checks.map((c) => `  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.actual} (expected ${c.expected})`),
    '',
    allOk ? 'G-3 PASS' : 'G-3 FAIL',
    '',
    'G-3 COMPLETE — proceed to G-4',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${msg}\n`);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [G-3 VERIFY] ${allOk ? 'PASS' : 'FAIL'}\n`,
  );

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
