/**
 * Apply superapp_listing_consent migration.
 * Run: npm run db:apply-superapp-listing-consent
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationFile = '20260621250000_superapp_listing_consent.sql';

function loadEnv() {
  for (const file of [
    '.env.seed.tmp',
    'apps/back-office/.env.local',
    'apps/client-pwa/.env.local',
    '.env',
  ]) {
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
  join(root, 'packages/supabase/migrations', migrationFile),
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
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase management API: ${res.status} ${detail}`);
  }
  return true;
}

async function applyViaPg() {
  if (!dbUrl) return false;
  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql.unsafe(sqlText);
  } finally {
    await sql.end({ timeout: 5 });
  }
  return true;
}

async function main() {
  if (await applyViaManagementApi()) {
    console.log(`Applied ${migrationFile} via Supabase management API.`);
    return;
  }
  if (await applyViaPg()) {
    console.log(`Applied ${migrationFile} via DATABASE_URL.`);
    return;
  }
  console.error(
    'Could not apply migration. Set SUPABASE_ACCESS_TOKEN or DATABASE_URL in .env.seed.tmp',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
