#!/usr/bin/env node
/**
 * H-9 — verify offline replay idempotency wiring.
 *
 * Run: npm run verify:cvs-offline-idempotency
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  migration: join(
    ROOT,
    'packages/supabase/migrations/20260624130000_attendance_logs_offline_replay_key.sql',
  ),
  actions: join(ROOT, 'apps/field-pwa/app/actions.ts'),
  checkIn: join(ROOT, 'apps/field-pwa/app/components/CheckInButton.tsx'),
  vault: join(ROOT, 'apps/field-pwa/lib/offline-vault.ts'),
  threatTest: join(ROOT, 'apps/back-office/lib/cvs-threat-scenarios.test.ts'),
};

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

const migration = readFileSync(paths.migration, 'utf8');
if (!migration.includes('offline_replay_key')) {
  failures.push('Migration missing offline_replay_key column');
}

const actions = readFileSync(paths.actions, 'utf8');
if (!actions.includes('resolveOfflineReplayIdempotency')) {
  failures.push('processLocationPing missing idempotency resolver');
}

const checkIn = readFileSync(paths.checkIn, 'utf8');
if (!checkIn.includes('offline_replay_key: ping.id')) {
  failures.push('CheckInButton offline replay does not pass vault id as key');
}

const threatTest = readFileSync(paths.threatTest, 'utf8');
if (!threatTest.includes('offline_replay_key: ping.id')) {
  failures.push('Threat test 3.11.7 not updated for idempotency key');
}

if (failures.length > 0) {
  console.error('CVS H-9 offline idempotency check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-9 offline replay idempotency verified');
