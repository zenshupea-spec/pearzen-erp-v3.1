#!/usr/bin/env node
/**
 * U-29 — Master Hub pillar mock / dummy interaction sweep.
 *
 * Run: npm run verify:cvs-master-hub-mock-sweep
 * Writes: audit-evidence/cvs/master-hub-mock-sweep.json
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/master-hub-mock-sweep.json');

/** Master Hub pillar route prefixes (back-office + field PWAs). */
const PILLAR_SCAN_ROOTS = [
  'apps/back-office/app/om',
  'apps/back-office/app/tm',
  'apps/back-office/app/fm',
  'apps/back-office/app/hq/deductions',
  'apps/back-office/app/hq/audit',
  'apps/back-office/app/invoice-desk',
  'apps/back-office/app/hr',
  'apps/back-office/app/executive/cafe',
  'apps/back-office/app/executive/operations',
  'apps/back-office/app/cafe-front',
  'apps/back-office/app/shalom-front',
  'apps/back-office/app/hr/shalom-portal',
  'apps/field-pwa/app',
  'apps/sm-pwa/app',
];

/** Paths allowed to contain demo/mock patterns (documented intentional). */
const ALLOWLIST_PATH_FRAGMENTS = [
  'apps/back-office/app/executive/finance',
  'apps/back-office/app/hq/deductions/actions.ts', // isDemo fallback when migrations missing; UI shows banner
  'apps/back-office/app/fm/page.tsx', // MOCK_* seeds used only for historical portfolio scale math
  'apps/back-office/app/fm/lib/payroll-period.ts',
];

const HIGH_PATTERNS = [
  { id: 'seedIncidents', re: /seedIncidents|EXECUTIVE_PREVIEW_SECTORS|INITIAL_FIELD_INCIDENTS/ },
  { id: 'mock_deficit_seed', re: /DEF-001|DEF-002|Arpico Supercentre.*deficit|INITIAL_DEFICITS:\s*UnresolvedDeficit\[\]\s*=\s*\[\s*\{/ },
  { id: 'fake_async_submit', re: /await new Promise\(\(r\) => setTimeout\(r, 1100\)\)/ },
];

const WARN_PATTERNS = [
  { id: 'isDemo_ui', re: /isDemo/ },
  { id: 'demo_prefix_id', re: /['"]demo-/ },
  { id: 'legacy_mock_redirect', re: /Legacy mock/ },
];

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function isAllowlisted(relPath) {
  return ALLOWLIST_PATH_FRAGMENTS.some((frag) => relPath.includes(frag));
}

function collectFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of execSync(`find "${dir}" -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \\)`, {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)) {
    acc.push(entry.replace(`${ROOT}/`, ''));
  }
  return acc;
}

const failures = [];
const warnings = [];
const passes = [];

for (const root of PILLAR_SCAN_ROOTS) {
  const abs = join(ROOT, root);
  if (!existsSync(abs)) continue;
  for (const rel of collectFiles(abs)) {
    if (isAllowlisted(rel)) continue;
    const text = readText(join(ROOT, rel));
    if (!text) continue;

    for (const { id, re } of HIGH_PATTERNS) {
      if (re.test(text)) {
        failures.push({ pattern: id, file: rel });
      }
    }
    for (const { id, re } of WARN_PATTERNS) {
      if (re.test(text)) {
        warnings.push({ pattern: id, file: rel });
      }
    }
  }
}

// Static regression anchors from prior UX steps
for (const [file, needle] of [
  ['apps/back-office/app/executive/operations/page.tsx', 'getLiveFieldRadar'],
  ['apps/back-office/app/fm/discrepancy-queue/page.tsx', 'No client deficits pending'],
  ['apps/back-office/app/hq/recruitment/page.tsx', "redirect('/hr/onboarding')"],
]) {
  const text = readText(join(ROOT, file));
  if (!text.includes(needle)) {
    failures.push({ pattern: 'regression_anchor', file, detail: `missing ${needle}` });
  } else {
    passes.push({ check: 'regression_anchor', file, needle });
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  step: 'CVS_CLIENT_HANDOVER_UX_STEPS — U-29',
  pillarRoots: PILLAR_SCAN_ROOTS,
  allowlist: ALLOWLIST_PATH_FRAGMENTS,
  highSeverityFailures: failures,
  warnings,
  passes,
  intentionalDemos: [
    'executive/finance vault KPIs (out of scope per master-hub rule)',
    'hq/deductions isDemo fallback when deduction tables missing — banner + disabled writes',
    'fm/page.tsx MOCK_* portfolio scale constants — not rendered as live payroll rows',
  ],
  pass: failures.length === 0,
};

mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error('\nMaster Hub mock sweep FAILED (HIGH severity):\n');
  for (const hit of failures) console.error(`  • [${hit.pattern}] ${hit.file}`);
  process.exit(1);
}

console.log('\n✓ Master Hub mock sweep passed');
console.log(`  HIGH severity hits: 0`);
console.log(`  Warnings (documented demos): ${warnings.length}`);
console.log(`  Evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
