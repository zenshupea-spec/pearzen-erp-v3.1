#!/usr/bin/env node
/**
 * MNR offboarding ops gate — uniform collecting + letters + blacklist + resignation gate.
 * Run: node scripts/verify-mnr-offboarding-ops-gate.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const path = join(root, 'apps/back-office/.env.local');
  if (!existsSync(path)) {
    console.error('Missing apps/back-office/.env.local');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function assert(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const failures = [];

function runNodeScript(relativePath, label) {
  const scriptPath = join(root, relativePath);
  if (!existsSync(scriptPath)) {
    assert(label, false, `missing ${relativePath}`);
    return;
  }
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const ok = result.status === 0;
  assert(label, ok, ok ? 'subprocess ok' : output.split('\n').slice(-3).join(' | ') || `exit ${result.status}`);
}

function runVitest(pattern, label) {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', pattern, '--reporter=dot'],
    { cwd: root, encoding: 'utf8', stdio: 'pipe', shell: true },
  );
  const ok = result.status === 0;
  assert(label, ok, ok ? 'vitest ok' : `exit ${result.status}`);
}

async function verifyProdSchema(db) {
  const tables = ['uniform_collection_cases', 'guard_offboarding_letter_tracks', 'guard_blacklist_vault'];
  for (const table of tables) {
    const { error } = await db.from(table).select('id', { head: true, count: 'exact' });
    assert(`Table ${table} reachable`, !error, error?.message);
  }

  const { count: letterCount, error: letterErr } = await db
    .from('guard_offboarding_letter_tracks')
    .select('id', { count: 'exact', head: true });
  assert('guard_offboarding_letter_tracks count query', !letterErr, letterErr?.message);
  if (!letterErr) {
    console.log(`       (letter tracks rows: ${letterCount ?? 0})`);
  }
}

async function main() {
  console.log('=== MNR Offboarding Ops Gate ===\n');

  console.log('-- Unit tests --');
  runVitest('apps/back-office/lib/offboarding-letters/', 'Offboarding letter schedule unit tests');
  runVitest('apps/back-office/lib/clearance-settlement.test.ts', 'Clearance resignation gate unit tests');
  runVitest('apps/back-office/lib/uniform-collection/issued-history.test.ts', 'Uniform issued-history unit tests');

  console.log('\n-- Live Supabase smokes --');
  runNodeScript('scripts/verify-uniform-collecting-smoke.mjs', 'Uniform collecting E2E smoke');
  runNodeScript('scripts/verify-offboarding-letter-upload-smoke.mjs', 'Offboarding letter upload smoke');
  runNodeScript('scripts/verify-offboarding-letter-actions-smoke.mjs', 'Offboarding letter track CRUD smoke');
  runNodeScript('scripts/verify-offboarding-letters-e2e-smoke.mjs', 'Offboarding letters E2E smoke');
  runNodeScript('scripts/verify-hr-blacklist-guard-smoke.mjs', 'HR guard blacklist vault smoke');

  console.log('\n-- Prod schema (CVS tenant) --');
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    assert('Supabase env for schema checks', false, 'missing URL or service role key');
  } else {
    const db = createClient(url, key, { auth: { persistSession: false } });
    await verifyProdSchema(db);
  }

  console.log('\n-- UI manual checklist (operator) --');
  console.log('  · MNR drawer → field guard → Guard score badge visible');
  console.log('  · MNR drawer → Blacklist button → vault row → rejoin blocked');
  console.log('  · MNR drawer → Offboarding tab → start track → meta ticks → mark L1');
  console.log('  · MNR dashboard → Letter reminders card → pending list → open drawer');
  console.log('  · Clearance modal → uniform gate when ISSUED uniforms on file');

  console.log(
    failures.length
      ? `\nGATE FAILED — ${failures.length} check(s)\n`
      : '\nGATE PASSED — automated offboarding ops checks OK\n',
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
