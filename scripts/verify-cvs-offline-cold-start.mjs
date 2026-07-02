#!/usr/bin/env node
/**
 * H-10 — verify field PWA cold-start offline shift context cache.
 *
 * Run: npm run verify:cvs-offline-cold-start
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  cache: join(ROOT, 'apps/field-pwa/lib/shift-context-cache.ts'),
  vault: join(ROOT, 'apps/field-pwa/lib/offline-vault.ts'),
  checkIn: join(ROOT, 'apps/field-pwa/app/components/CheckInButton.tsx'),
};

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

const cache = readFileSync(paths.cache, 'utf8');
if (!cache.includes('saveShiftContextCache') || !cache.includes('isShiftContextCacheValid')) {
  failures.push('shift-context-cache missing save/validity helpers');
}

const vault = readFileSync(paths.vault, 'utf8');
if (!vault.includes('shift_context') || !vault.includes('DB_VERSION = 2')) {
  failures.push('offline-vault missing shift_context store (DB v2)');
}

const checkIn = readFileSync(paths.checkIn, 'utf8');
if (!checkIn.includes('restoreShiftFromCache')) {
  failures.push('CheckInButton missing restoreShiftFromCache');
}
if (!checkIn.includes('saveShiftContextCache')) {
  failures.push('CheckInButton does not persist shift context on READY');
}

if (failures.length > 0) {
  console.error('CVS H-10 cold-start offline check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-10 field PWA cold-start offline shift cache verified');
