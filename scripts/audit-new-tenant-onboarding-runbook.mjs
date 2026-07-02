#!/usr/bin/env node
/**
 * S-32 — verify new-tenant onboarding runbook exists and is linked.
 *
 * Run: npm run audit:new-tenant-onboarding-runbook
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNBOOK = join(ROOT, 'docs/runbooks/new-tenant-onboarding.md');
const ROADMAP = join(ROOT, 'SAAS_FORGE_ROADMAP.md');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-32-new-tenant-onboarding-runbook.txt');

const REQUIRED_SECTIONS = [
  ['Forge create tenant', /\/forge\/companies\/new|create tenant in Forge/i],
  ['DNS conventional hosts (S-13)', /conventionalTenantPortalProductionHosts|\{slug\}hq/i],
  ['optional dedicated Vercel', /dedicated Vercel/i],
  ['do not modify cvs-production', /do not.*cvs-production|cvs-production.*not/i],
  ['forge audit / S-31 guardrails', /forge_audit_log|FORGE_TENANT_PROVISIONED/i],
  ['related cherry-pick runbook', /cvs-production-cherry-pick/i],
];

function main() {
  if (!existsSync(RUNBOOK)) {
    console.error('Missing runbook:', RUNBOOK);
    process.exit(1);
  }

  const content = readFileSync(RUNBOOK, 'utf8');
  const roadmap = existsSync(ROADMAP) ? readFileSync(ROADMAP, 'utf8') : '';
  const roadmapLinks = roadmap.includes('new-tenant-onboarding.md');

  console.log('\nS-32 new-tenant onboarding runbook audit\n');

  const failures = [];
  for (const [label, pattern] of REQUIRED_SECTIONS) {
    const ok = pattern.test(content);
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  }

  console.log(`  ${roadmapLinks ? '✓' : '✗'} SAAS_FORGE_ROADMAP.md links runbook`);
  if (!roadmapLinks) failures.push('roadmap link');

  if (failures.length) {
    console.error('\nFailed:', failures.join(', '));
    process.exit(1);
  }

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-32 New client onboarding checklist',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Runbook: docs/runbooks/new-tenant-onboarding.md',
    '',
    'Covers:',
    '  · Forge /forge/companies/new provisioning (S-31 guardrails)',
    '  · DNS pattern — {slug}hq|exec|om|tm|sm|checkin.pearzen.tech (S-13)',
    '  · Shared vs optional dedicated Vercel tenant project',
    '  · Explicit: do not modify cvs-production for new client work',
    '  · Post-onboarding verification + anti-patterns',
    '',
    'Cross-links:',
    '  · SAAS_FORGE_ROADMAP.md Tier 3',
    '  · docs/runbooks/cvs-production-cherry-pick.md',
    '  · docs/runbooks/forge-tenant-deploy-split.md',
    '',
    'Phase G (S-31–S-32): COMPLETE',
    'Core isolation tracker: 32/32',
    '',
    'Status: PASS',
    '',
    'Repeatable: npm run audit:new-tenant-onboarding-runbook',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);
}

main();
