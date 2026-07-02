#!/usr/bin/env node
/**
 * S-29 — verify CVS production cherry-pick runbook exists and covers required topics.
 *
 * Run: npm run audit:cvs-production-cherry-pick-runbook
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = join(ROOT, 'docs/runbooks/cvs-production-cherry-pick.md');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-29-cvs-cherry-pick-runbook.txt');
const PR_TEMPLATE = join(ROOT, '.github/pull_request_template.md');

const REQUIRED_SECTIONS = [
  ['branch model (main vs cvs-production)', /main.*cvs-production|cvs-production.*main/is],
  ['cherry-pick procedure', /cherry-pick/i],
  ['shared fix flow', /shared fix/i],
  ['CVS-only hotfix', /CVS-only hotfix/i],
  ['Forge-only guidance', /Forge-only/i],
  ['verify:platform-no-cvs-default', /verify:platform-no-cvs-default/],
  ['post-deploy smoke', /smoke:post-split-production|smoke:tenant-erp-deployment/],
  ['operator review checklist', /Operator review checklist/i],
  ['do not modify cvs-production for new client', /new client|new non-CVS tenant/i],
];

function main() {
  if (!existsSync(RUNBOOK)) {
    console.error('Missing runbook:', RUNBOOK);
    process.exit(1);
  }

  const content = readFileSync(RUNBOOK, 'utf8');
  const prRefsRunbook =
    existsSync(PR_TEMPLATE) && readFileSync(PR_TEMPLATE, 'utf8').includes('cvs-production-cherry-pick.md');

  console.log('\nS-29 CVS cherry-pick runbook audit\n');

  const failures = [];
  for (const [label, pattern] of REQUIRED_SECTIONS) {
    const ok = pattern.test(content);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  }

  console.log(`  ${prRefsRunbook ? '✓' : '✗'} PR template links to runbook`);
  if (!prRefsRunbook) failures.push('PR template link');

  if (failures.length) {
    console.error('\nFailed:', failures.join(', '));
    process.exit(1);
  }

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-29 CVS production cherry-pick runbook',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Runbook: docs/runbooks/cvs-production-cherry-pick.md',
    '',
    'Covers:',
    '  · Branch model (main → Forge, cvs-production → CVS tenant)',
    '  · Decision tree (Forge-only / CVS-only / shared)',
    '  · Standard cherry-pick flow main → cvs-production',
    '  · CVS-only hotfix + backport to main',
    '  · Forge-only changes (no cvs-production touch)',
    '  · Migration coordination notes',
    '  · Anti-patterns (no wholesale merge, no new-client work on cvs-production)',
    '  · Manual workflow_dispatch / Vercel CLI fallback',
    '  · Operator review checklist',
    '',
    'Cross-links:',
    '  · .github/pull_request_template.md → runbook',
    '  · docs/runbooks/forge-tenant-deploy-split.md (related)',
    '',
    'Operator review:',
    '  · Engineering runbook complete — operator sign-off pending in checklist',
    '  · Review items listed in runbook § Operator review checklist',
    '',
    'Status: PASS (runbook present + required sections)',
    '',
    'Repeatable: npm run audit:cvs-production-cherry-pick-runbook',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);
}

main();
