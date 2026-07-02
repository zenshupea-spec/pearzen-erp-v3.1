#!/usr/bin/env node
/**
 * H-8 — verify SM roster submit uses transactional replace RPC (not delete-then-insert).
 *
 * Run: npm run verify:cvs-sm-roster-txn
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  migration: join(
    ROOT,
    'packages/supabase/migrations/20260624120000_sm_guard_attendance_replace_shift_rpc.sql',
  ),
  helper: join(ROOT, 'apps/sm-pwa/lib/sm-roster-db.ts'),
  submit: join(ROOT, 'apps/sm-pwa/app/(portal)/attendance/guards/actions.ts'),
  confirm: join(ROOT, 'apps/sm-pwa/app/(portal)/attendance/confirm/actions.ts'),
};

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) {
    failures.push(`Missing ${label}: ${path}`);
  }
}

const migration = readFileSync(paths.migration, 'utf8');
if (!migration.includes('replace_sm_guard_attendance_shift')) {
  failures.push('Migration missing replace_sm_guard_attendance_shift function');
}

for (const [label, path] of [
  ['submitGuardAttendanceAction', paths.submit],
  ['confirmShiftAction', paths.confirm],
]) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes('replaceSmGuardAttendanceShift')) {
    failures.push(`${label} does not call replaceSmGuardAttendanceShift`);
  }
  if (source.match(/from\('sm_guard_attendance'\)[\s\S]*?\.delete\(\)/)) {
    failures.push(`${label} still uses direct sm_guard_attendance delete`);
  }
}

if (failures.length > 0) {
  console.error('CVS H-8 SM roster transactional check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-8 SM roster transactional replace verified');
