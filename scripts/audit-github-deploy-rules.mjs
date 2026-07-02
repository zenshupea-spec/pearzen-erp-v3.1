#!/usr/bin/env node
/**
 * S-28 — verify GitHub deploy rules (workflows, PR template, local gates).
 *
 * Run: npm run audit:github-deploy-rules
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-28-github-deploy-rules.txt');

const REQUIRED = [
  '.github/workflows/cvs-production-deploy.yml',
  '.github/workflows/secret-scan.yml',
  '.github/pull_request_template.md',
];

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function main() {
  const missing = REQUIRED.filter((p) => !existsSync(join(ROOT, p)));
  if (missing.length) {
    console.error('Missing files:', missing.join(', '));
    process.exit(1);
  }

  const deployYml = read('.github/workflows/cvs-production-deploy.yml');
  const secretScan = read('.github/workflows/secret-scan.yml');
  const prTemplate = read('.github/pull_request_template.md');

  const checks = [
    ['cvs-production-deploy triggers on cvs-production', /branches:\s*\[cvs-production\]/s.test(deployYml)],
    ['cvs-production-deploy has workflow_dispatch', /workflow_dispatch/.test(deployYml)],
    ['cvs-production-deploy runs verify:forge-actions', /verify:forge-actions/.test(deployYml)],
    ['cvs-production-deploy runs verify:platform-no-cvs-default', /verify:platform-no-cvs-default/.test(deployYml)],
    ['cvs-production-deploy tenant-erp build', /PEARZEN_DEPLOYMENT_MODE:\s*tenant-erp/.test(deployYml)],
    ['cvs-production-deploy uses VERCEL_TENANT_ERP_PROJECT_ID', /VERCEL_TENANT_ERP_PROJECT_ID/.test(deployYml)],
    ['secret-scan runs on pull_request', /pull_request:/.test(secretScan)],
    ['secret-scan runs verify:forge-actions', /verify:forge-actions/.test(secretScan)],
    ['secret-scan runs verify:platform-no-cvs-default', /verify:platform-no-cvs-default/.test(secretScan)],
    ['secret-scan push includes cvs-production', /cvs-production/.test(secretScan)],
    ['PR template forge deploy note', /CVS deploy not automatic/i.test(prTemplate)],
    ['PR template /forge question', /\/forge/.test(prTemplate)],
  ];

  console.log('\nS-28 GitHub deploy rules audit\n');
  const failures = [];
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failures.push(label);
  }

  if (failures.length) {
    console.error('\nStatic checks failed:', failures.join(', '));
    process.exit(1);
  }

  console.log('\nLocal gate scripts:');
  run('npm run verify:forge-actions --silent');
  run('npm run verify:platform-no-cvs-default --silent');

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-28 GitHub deploy rules',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Workflows:',
    '  · .github/workflows/cvs-production-deploy.yml',
    '      push cvs-production + workflow_dispatch → gates + tenant Vercel deploy',
    '  · .github/workflows/secret-scan.yml',
    '      pull_request + push (main, cvs-production) → secrets + isolation gates + profile builds',
    '',
    'PR template:',
    '  · .github/pull_request_template.md — deploy impact checklist',
    '',
    'GitHub secrets required (repo settings → Secrets and variables → Actions):',
    '  · VERCEL_TOKEN',
    '  · VERCEL_ORG_ID          (team id, e.g. team_…)',
    '  · VERCEL_TENANT_ERP_PROJECT_ID  (prj_5jgAc0UkB252l5UzEp8XfzVDC6A4)',
    '',
    'Recommended branch protection (operator — GitHub repo settings):',
    '',
    '  cvs-production:',
    '    · Require pull request before merging',
    '    · Require status checks: Isolation gates + tenant-erp build, secrets, deployment-profiles',
    '    · Restrict direct pushes to operators only',
    '    · Do not allow force pushes',
    '',
    '  main:',
    '    · Same CI status checks (secret-scan jobs)',
    '    · Production deploys Forge project only (Vercel production branch = main)',
    '',
    'Deploy behavior after S-27 + S-28:',
    '  · merge/push to main → Forge Vercel production (not CVS)',
    '  · merge/push to cvs-production → CVS workflow gates + tenant Vercel deploy',
    '',
    'Note: Vercel Git integration on tenant project also watches cvs-production;',
    '      workflow deploy runs after gates pass (belt-and-suspenders).',
    '',
    'Static checks: PASS',
    'Local verify:forge-actions + verify:platform-no-cvs-default: PASS',
    '',
    'Repeatable: npm run audit:github-deploy-rules',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);
}

main();
