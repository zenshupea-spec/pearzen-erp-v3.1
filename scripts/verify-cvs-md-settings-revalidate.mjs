#!/usr/bin/env node
/**
 * H-11 — verify MD settings saves call revalidateMdSettingsConsumers().
 *
 * Run: npm run verify:cvs-md-settings-revalidate
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS_DIR = join(ROOT, 'apps/back-office/app/executive/settings');
const HELPER = join(SETTINGS_DIR, 'lib/revalidate-md-settings-consumers.ts');

const REQUIRED_PATHS = [
  '/executive/settings',
  '/fm',
  '/fm/batch',
  '/invoice-desk',
  '/hr/onboarding',
];

const EXEMPT = new Set([
  'portal-auth-actions.ts',
  'portal-security-feed-actions.ts',
  'settings-audit.ts',
  'settings-traceability-actions.ts',
]);

const failures = [];

if (!existsSync(HELPER)) {
  failures.push('Missing revalidate-md-settings-consumers.ts');
} else {
  const helper = readFileSync(HELPER, 'utf8');
  for (const path of REQUIRED_PATHS) {
    if (!helper.includes(`'${path}'`)) {
      failures.push(`Helper missing path ${path}`);
    }
  }
}

const actionFiles = readdirSync(SETTINGS_DIR).filter(
  (name) => name.endsWith('-actions.ts') || name === 'actions.ts',
);

for (const file of actionFiles) {
  if (EXEMPT.has(file)) continue;
  const source = readFileSync(join(SETTINGS_DIR, file), 'utf8');
  if (!source.includes('revalidateMdSettingsConsumers')) {
    failures.push(`${file} does not call revalidateMdSettingsConsumers`);
  }
  if (source.includes("revalidatePath('/executive/settings')")) {
    failures.push(`${file} still revalidates /executive/settings directly`);
  }
}

if (failures.length > 0) {
  console.error('CVS H-11 MD settings revalidate check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-11 revalidateMdSettingsConsumers wiring verified');
