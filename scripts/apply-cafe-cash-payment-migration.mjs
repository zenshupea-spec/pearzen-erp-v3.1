/**
 * Extends café order payment_method to allow cash_at_counter.
 * Run: npm run db:apply-cafe-cash-payment
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', 'apps/client-pwa/.env.local', '.env']) {
    try {
      const env = readFileSync(join(root, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* try next */
    }
  }
}

loadEnv();

const sqlText = readFileSync(
  join(root, 'packages/supabase/migrations/20260610160000_cafe_order_cash_payment.sql'),
  'utf8',
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function applyViaManagementApi() {
  if (!accessToken || !projectRef) return false;
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sqlText }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error('Management API failed:', res.status, body.slice(0, 400));
    return false;
  }
  console.log('Applied café cash payment migration (Management API).');
  return true;
}

async function applyViaPostgres() {
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log('Applied café cash payment migration (direct Postgres).');
    return true;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (await applyViaManagementApi()) {
  process.exit(0);
}

if (dbUrl) {
  try {
    if (await applyViaPostgres()) process.exit(0);
  } catch (err) {
    console.error('Postgres migration failed:', err?.message || err);
    process.exit(1);
  }
}

console.error(
  'Could not apply migration.\n' +
    'Add SUPABASE_ACCESS_TOKEN or DATABASE_URL to .env.seed.tmp, then re-run:\n' +
    '  npm run db:apply-cafe-cash-payment',
);
process.exit(1);
