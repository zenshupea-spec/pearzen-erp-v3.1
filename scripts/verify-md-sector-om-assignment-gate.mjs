#!/usr/bin/env node
/**
 * CVS — MD Portal Sector → OM assignment automated gate (Step 12).
 *
 * Run: npm run verify:md-sector-om-assignment-gate
 * Writes: audit-evidence/cvs/md-sector-om-assignment-gate.json
 *
 * Gates:
 *   1. Migration + wiring static checks
 *   2. Vitest security suite (scope isolation + assignment role gate)
 *   3. Pure fixture simulation — scoped OM sees one sector tile, not two
 *   4. Optional live Supabase audit (when service role env is present)
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/md-sector-om-assignment-gate.json');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const FILES = {
  steps: join(ROOT, 'CVS_MD_SECTOR_OM_ASSIGNMENT_STEPS.txt'),
  migration: join(
    ROOT,
    'packages/supabase/migrations/20260701250000_sector_om_assignments.sql',
  ),
  sectorOmActions: join(ROOT, 'apps/back-office/app/om/actions/sector-om-assignments.ts'),
  operationsPage: join(ROOT, 'apps/back-office/app/executive/operations/page.tsx'),
  fieldRadar: join(ROOT, 'apps/back-office/app/om/actions/field-radar.ts'),
  omScope: join(ROOT, 'apps/back-office/lib/om-sector-scope.ts'),
  scopeBuild: join(ROOT, 'apps/back-office/lib/om-sector-scope-build.ts'),
  assignmentSpec: join(ROOT, 'apps/back-office/lib/om-sector-assignment-spec.ts'),
};

const VITEST_CMD =
  'npx vitest run apps/back-office/lib/om-sector-assignment.test.ts apps/back-office/lib/om-sector-scope.test.ts apps/back-office/lib/portal-isolation.test.ts';

const failures = [];
const warnings = [];
const gates = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function gate(label, fn) {
  const started = Date.now();
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          const durationMs = Date.now() - started;
          gates.push({ gate: label, status: 'PASS', durationMs });
          console.log(`✓ ${label}`);
        })
        .catch((err) => {
          const durationMs = Date.now() - started;
          const message = err instanceof Error ? err.message : String(err);
          failures.push(`${label}: ${message}`);
          gates.push({ gate: label, status: 'FAIL', durationMs, error: message });
          console.error(`✗ ${label}: ${message}`);
        });
    }
    const durationMs = Date.now() - started;
    gates.push({ gate: label, status: 'PASS', durationMs });
    console.log(`✓ ${label}`);
    return Promise.resolve();
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${label}: ${message}`);
    gates.push({ gate: label, status: 'FAIL', durationMs, error: message });
    console.error(`✗ ${label}: ${message}`);
    return Promise.resolve();
  }
}

function mustInclude(label, source, needle) {
  if (!source.includes(needle)) {
    throw new Error(`missing "${needle}"`);
  }
}

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const env = read(join(ROOT, file));
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

/** Minimal scope builder mirror for gate fixture (matches om-sector-scope.test.ts). */
function normalizeSmEpf(value) {
  const key = String(value ?? '').trim().toUpperCase();
  return key || null;
}

function sectorManagerEpfKey(manager) {
  for (const field of [manager.emp_number, manager.epf_no, manager.epf_num]) {
    const key = normalizeSmEpf(field);
    if (key) return key;
  }
  return null;
}

function buildFixtureScope(assignedSmEpfs) {
  const managers = [
    { id: 'sm-1', emp_number: '144', full_name: 'DAVID', site: 'COLOMBO 1', status: 'ACTIVE' },
    { id: 'sm-2', emp_number: '200', full_name: 'PERERA', site: 'KANDY', status: 'ACTIVE' },
  ];
  const sites = [
    { site_name: 'Test Site 196', assigned_sm_epf: '144' },
    { site_name: 'Royal Site', assigned_sm_epf: '200' },
  ];
  const assigned = new Set(assignedSmEpfs.map((k) => normalizeSmEpf(k)).filter(Boolean));
  const smEpfKeys = new Set();
  const siteKeys = new Set();
  const guardEmployeeIds = new Set();

  for (const manager of managers) {
    const canonical = sectorManagerEpfKey(manager);
    if (!canonical || !assigned.has(canonical)) continue;
    smEpfKeys.add(canonical);
  }

  for (const site of sites) {
    const smEpf = normalizeSmEpf(site.assigned_sm_epf);
    if (smEpf && smEpfKeys.has(smEpf)) {
      siteKeys.add(String(site.site_name).trim().toLowerCase());
    }
  }

  const guards = [
    { id: 'g-1', emp_number: '007', site: 'Test Site 196', group: 'GUARD', status: 'ACTIVE' },
    { id: 'g-3', emp_number: '111', site: 'Royal Site', group: 'GUARD', status: 'ACTIVE' },
  ];

  for (const guard of guards) {
    const siteKey = String(guard.site ?? '').trim().toLowerCase();
    if (siteKeys.has(siteKey)) guardEmployeeIds.add(guard.id);
  }

  return { smEpfKeys, guardEmployeeIds, sectorTileCount: smEpfKeys.size };
}

function runStaticGates() {
  gate('migration sector_om_assignments exists', () => {
    const sql = read(FILES.migration);
    mustInclude('migration', sql, 'sector_om_assignments');
    mustInclude('migration', sql, 'CREATE TABLE IF NOT EXISTS public.sector_om_assignments');
    mustInclude('migration', sql, 'UNIQUE (company_id, sm_epf)');
  });

  gate('assignment spec + role gate', () => {
    const spec = read(FILES.assignmentSpec);
    mustInclude('assignment-spec', spec, 'canManageSectorOmAssignments');
    const actions = read(FILES.sectorOmActions);
    mustInclude('sector-om-actions', actions, 'assignSectorOmAction');
    mustInclude('sector-om-actions', actions, 'clearSectorOmAction');
    mustInclude('sector-om-actions', actions, 'canManageSectorOmAssignments');
  });

  gate('MD portal SectorTile picker wired', () => {
    const page = read(FILES.operationsPage);
    mustInclude('operations-page', page, 'SectorOmAssignmentPicker');
    mustInclude('operations-page', page, 'showOmPicker={!omPortal && canAssignSectorOm}');
    mustInclude('operations-page', page, 'getSectorOmAssignmentBoard');
  });

  gate('OM scope resolver + field-radar filter', () => {
    const scope = read(FILES.omScope);
    mustInclude('om-sector-scope', scope, 'resolveOmSectorScopeForSession');
    const radar = read(FILES.fieldRadar);
    mustInclude('field-radar', radar, 'omScopeAllowsSmKey');
    mustInclude('field-radar', radar, 'resolveOmSectorScopeForSession');
    const build = read(FILES.scopeBuild);
    mustInclude('om-sector-scope-build', build, 'filterGuardsForOmScope');
    mustInclude('om-sector-scope-build', build, 'filterSitesForOmScope');
  });

  gate('all 12 implementation steps marked done', () => {
    const steps = read(FILES.steps);
    const pending = (steps.match(/^STATUS: \[ \]/gm) ?? []).length;
    if (pending > 0) {
      throw new Error(`${pending} step(s) still pending in CVS_MD_SECTOR_OM_ASSIGNMENT_STEPS.txt`);
    }
    if (!steps.includes('STEP 12 — Operator smoke gate')) {
      throw new Error('step file missing Step 12 section');
    }
  });
}

function runVitestGate() {
  gate('vitest OM sector security suite', () => {
    execSync(VITEST_CMD, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  });
}

function runFixtureSimulationGate() {
  gate('fixture: OM-A assigned SM-144 sees 1 sector tile', () => {
    const scopeA = buildFixtureScope(['144']);
    if (scopeA.sectorTileCount !== 1) {
      throw new Error(`expected 1 sector, got ${scopeA.sectorTileCount}`);
    }
    if (!scopeA.smEpfKeys.has('144')) throw new Error('SM-144 not in scope');
    if (scopeA.smEpfKeys.has('200')) throw new Error('SM-200 leaked into OM-A scope');
    if (!scopeA.guardEmployeeIds.has('g-1')) throw new Error('guard g-1 missing from OM-A scope');
    if (scopeA.guardEmployeeIds.has('g-3')) throw new Error('guard g-3 leaked into OM-A scope');
  });

  gate('fixture: unassigned OM sees 0 sector tiles (fail closed)', () => {
    const empty = buildFixtureScope([]);
    if (empty.sectorTileCount !== 0) {
      throw new Error(`expected 0 sectors, got ${empty.sectorTileCount}`);
    }
    if (empty.guardEmployeeIds.size !== 0) {
      throw new Error('unassigned OM must not see guards');
    }
  });

  gate('fixture: OM-B assigned SM-200 has no overlap with OM-A', () => {
    const scopeA = buildFixtureScope(['144']);
    const scopeB = buildFixtureScope(['200']);
    const overlap = [...scopeA.smEpfKeys].filter((key) => scopeB.smEpfKeys.has(key));
    if (overlap.length > 0) {
      throw new Error(`sector overlap between OM-A and OM-B: ${overlap.join(', ')}`);
    }
  });
}

async function runOptionalSupabaseAudit() {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    gates.push({
      gate: 'live Supabase audit (optional)',
      status: 'SKIP',
      reason: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set',
    });
    console.log('○ live Supabase audit skipped (no service role env)');
    return;
  }

  await gate('live: sector_om_assignments table readable', async () => {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase.from('sector_om_assignments').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  await gate('live: CVS roster ready for operator overlap smoke', async () => {
    const supabase = createClient(supabaseUrl, serviceKey);
    const [sms, oms] = await Promise.all([
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', CVS_COMPANY_ID)
        .eq('status', 'ACTIVE')
        .eq('rank', 'SM'),
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', CVS_COMPANY_ID)
        .eq('status', 'ACTIVE')
        .eq('rank', 'OM'),
    ]);
    if (sms.error) throw new Error(sms.error.message);
    if (oms.error) throw new Error(oms.error.message);

    const smCount = sms.count ?? 0;
    const omCount = oms.count ?? 0;
    if (smCount < 1) {
      throw new Error(`need ≥1 active SM, found ${smCount}`);
    }
    if (omCount < 1) {
      throw new Error(`need ≥1 active OM, found ${omCount}`);
    }
    if (smCount < 2) {
      warnings.push(`Only ${smCount} active SM — manual overlap smoke needs ≥2 sector cards`);
    }
    if (omCount < 2) {
      warnings.push(`Only ${omCount} active OM — manual OM-A/OM-B overlap smoke needs ≥2 OMs`);
    }
  });
}

function printOperatorChecklist() {
  console.log(`
────────────────────────────────────────────────────────────────────────────
OPERATOR MANUAL SMOKE (confirm in chat after automated gate passes)
────────────────────────────────────────────────────────────────────────────
1. MD logs in → /executive/operations → assign OM-A to one SM sector card
   (e.g. ROY or live SM name). Dropdown appears under CRITICAL/ATTENTION badge.
2. OM-A logs in → /om → sees only that sector's guards and Sector Manager.
3. OM-B (different assignment) sees a different subset; no overlap with OM-A.
4. MD/OD still see all sectors; dropdown on MD portal only (hidden on /om).
5. Unassigned OM sees empty tactical radar (fail closed).

Local dev: http://127.0.0.1:3002  (NEXT_PUBLIC_DEV_TENANT_SLUG=cvs)
────────────────────────────────────────────────────────────────────────────
`);
}

async function main() {
  const runAt = new Date().toISOString();
  console.log('\nCVS MD sector → OM assignment gate\n');

  runStaticGates();
  runFixtureSimulationGate();
  runVitestGate();
  await runOptionalSupabaseAudit();

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  const evidence = {
    step: 'CVS_MD_SECTOR_OM_ASSIGNMENT_STEP_12',
    runAt,
    status,
    gates,
    failures,
    warnings,
    operatorChecklist: [
      'MD assigns OM-A to one SM card on /executive/operations',
      'OM-A sees only assigned sector guards/SM on /om',
      'OM-B sees different subset with no overlap',
      'MD/OD see all sectors; picker MD portal only',
      'Unassigned OM gets empty tactical radar',
    ],
    vitestCommand: VITEST_CMD,
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  if (failures.length > 0) {
    console.error('\nMD sector OM assignment gate FAILED:\n');
    for (const msg of failures) console.error(`  • ${msg}`);
    process.exit(1);
  }

  console.log(`\n✓ MD sector OM assignment gate PASS`);
  console.log(`  evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
  if (warnings.length > 0) {
    console.log('\nWarnings (manual smoke may need extra roster rows):');
    for (const msg of warnings) console.log(`  ⚠ ${msg}`);
  }
  printOperatorChecklist();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
