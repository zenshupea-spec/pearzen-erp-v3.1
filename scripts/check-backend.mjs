/**
 * Verify Supabase connectivity and core tables for Pearzen ERP.
 * Run: npm run check:backend
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFromApp() {
  const path = join(root, 'apps/back-office/.env.local');
  if (!existsSync(path)) {
    console.error('No apps/back-office/.env.local — run: npm run wire:backend');
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = loadEnvFromApp();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  console.error('Missing Supabase URL or anon key in apps/back-office/.env.local');
  process.exit(1);
}

const anonClient = createClient(url, anon);
const serviceClient = service ? createClient(url, service) : null;

const TABLES = [
  'companies',
  'employees',
  'users',
  'site_profiles',
  'attendance_logs',
  'sm_guard_attendance',
  'sm_guard_assignments',
];

async function probeTable(client, table) {
  const { error, count } = await client
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    const missing = error.code === 'PGRST205' || error.message?.includes('schema cache');
    return {
      ok: false,
      message: missing
        ? 'Table missing — run SQL from packages/supabase/migrations/ in Supabase SQL editor'
        : error.message,
    };
  }
  return { ok: true, count: count ?? 0 };
}

console.log(`Supabase: ${url}\n`);

let failed = 0;

for (const table of TABLES) {
  const client = serviceClient ?? anonClient;
  const result = await probeTable(client, table);
  if (result.ok) {
    console.log(`  ✓ ${table} (${result.count} rows)`);
  } else {
    console.log(`  ✗ ${table} — ${result.message}`);
    failed += 1;
  }
}

if (!service) {
  console.warn('\n  ⚠ SUPABASE_SERVICE_ROLE_KEY not set — some probes may fail under RLS.');
} else {
  const { data: companies } = await serviceClient
    .from('companies')
    .select('id, name')
    .limit(3);
  if (companies?.length) {
    console.log('\nCompanies (sample):');
    for (const c of companies) {
      console.log(`  - ${c.name ?? '(unnamed)'} (${c.id})`);
    }
  }
}

const { count: empCount } = await (serviceClient ?? anonClient)
  .from('employees')
  .select('*', { count: 'exact', head: true });

console.log(`\nEmployees visible to API: ${empCount ?? '?'}`);

if (failed > 0) {
  console.error(
    `\n${failed} table(s) failed. Apply SQL in packages/supabase/migrations/ via Supabase SQL editor or CLI.`,
  );
  process.exit(1);
}

console.log('\nBackend reachable. Start apps: npm run dev');
console.log('  Back-office http://127.0.0.1:3002  (Google sign-in → HR / OM)');
console.log('  Field PWA    http://127.0.0.1:3001');
console.log('  SM PWA       http://127.0.0.1:3003');
