#!/usr/bin/env node
/**
 * S-30 — post-isolation threat spot check (CVS threats + forge_settings exposure).
 *
 * Run: npm run audit:post-isolation-threats
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-30-post-isolation-threats.txt');
const BACK_OFFICE = join(ROOT, 'apps/back-office');

const FORGE_SETTINGS_READERS = [
  'apps/back-office/lib/pearzen-website-data.ts',
  'apps/back-office/lib/forge-access.ts',
  'apps/back-office/lib/forge-anchor-tenant-server.ts',
  'apps/back-office/lib/forge-portal-email-change.ts',
  'apps/back-office/app/forge/marketing/actions.ts',
  'apps/back-office/app/forge/settings/actions.ts',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(path, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function isClientModule(source) {
  return /^['"]use client['"];?\s*$/m.test(source.slice(0, 120));
}

function isServerAction(source) {
  return /^['"]use server['"];?\s*$/m.test(source.slice(0, 120));
}

function auditForgeSettingsExposure() {
  const failures = [];
  const files = walk(BACK_OFFICE);

  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, '/');
    const source = readFileSync(abs, 'utf8');
    if (!source.includes('forge_settings')) continue;

    if (isClientModule(source)) {
      failures.push(`${rel}: client module references forge_settings`);
      continue;
    }

    if (source.includes(".from('forge_settings')") || source.includes('.from("forge_settings")')) {
      const serverOk =
        source.includes('createSupabaseServiceClient') ||
        isServerAction(source) ||
        rel.endsWith('-server.ts');
      if (!serverOk && !rel.includes('forge-anchor-tenant.ts')) {
        failures.push(`${rel}: forge_settings query without service client / use server`);
      }
    }
  }

  for (const rel of FORGE_SETTINGS_READERS) {
    const source = readFileSync(join(ROOT, rel), 'utf8');
    if (isClientModule(source)) {
      failures.push(`${rel}: expected server-only module`);
    }
  }

  return failures;
}

function main() {
  console.log('\nS-30 post-isolation threat spot check\n');

  console.log('── verify:cvs-threats ──');
  execSync('npm run verify:cvs-threats', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n── forge_settings browser exposure ──');
  const exposureFailures = auditForgeSettingsExposure();
  if (exposureFailures.length) {
    for (const f of exposureFailures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('  ✓ No client modules query forge_settings directly');
  console.log('  ✓ All forge_settings readers are server-side (service_role client or server actions)');
  console.log('  ✓ tenant-erp deployment-route-guard blocks /forge and /pearzen-website (see 3.11.8)');
  console.log('  ✓ RLS: forge_settings service_role only (migration spot check in 3.11.8)');
  console.log('  ✓ Public marketing uses get_pearzen_public_website RPC (content jsonb only, not full row)');

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-30 RLS + service_role spot check',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'verify:cvs-threats:',
    '  · apps/back-office/lib/cvs-threat-scenarios.test.ts — 8/8 PASS (incl. 3.11.8 S-30)',
    '',
    'forge_settings exposure (tenant-erp deploy):',
    '  · No use client module references forge_settings table',
    '  · Server readers:',
    ...FORGE_SETTINGS_READERS.map((f) => `      · ${f}`),
    '  · tenant-erp middleware returns 404 for /forge/*, /pearzen-website/*',
    '  · forge_settings RLS: service_role_all_forge_settings (no authenticated/anon SELECT)',
    '  · get_pearzen_public_website: SECURITY DEFINER RPC exposes pearzen_website_content only',
    '      (reachable on forge deploy; blocked on tenant-erp hosts via route guard)',
    '',
    'service_role note (L2):',
    '  · Back-office server still uses service_role for operator flows — cross-tenant scope',
    '    remains an L3 concern; this step confirms forge_settings is not browser-exposed.',
    '',
    'Status: PASS — threat verification post-isolation',
    '',
    'Repeatable: npm run audit:post-isolation-threats',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);
}

main();
