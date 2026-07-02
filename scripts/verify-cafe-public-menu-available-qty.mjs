#!/usr/bin/env node
/**
 * U-26 — get_cafe_public_menu must expose available_qty (prep / recipe / null).
 *
 * Run: npm run verify:cafe-public-menu-available-qty
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const failures = [];

const migrationPath =
  'packages/supabase/migrations/20260627120000_cafe_public_menu_available_qty.sql';
if (!existsSync(join(ROOT, migrationPath))) {
  failures.push(`Missing migration: ${migrationPath}`);
} else {
  const sql = readFileSync(join(ROOT, migrationPath), 'utf8');
  if (!sql.includes('available_qty')) failures.push('Migration missing available_qty column');
  if (!sql.includes('cafe_prep_items')) failures.push('Migration missing prep stock branch');
  if (!sql.includes("ing->>'currentStock'")) failures.push('Migration missing recipe yield branch');
}

const generated = readFileSync(join(ROOT, 'packages/supabase/database.generated.ts'), 'utf8');
if (!generated.includes('available_qty')) {
  failures.push('database.generated.ts missing available_qty on get_cafe_public_menu');
}

for (const [rel, needle] of [
  ['apps/client-pwa/lib/menu-api.ts', 'availableQty'],
  ['apps/client-pwa/lib/menu-server.ts', 'mapPublicMenuRow'],
  ['apps/client-pwa/components/CustomerMenu.tsx', 'MenuAvailabilityBadge'],
  ['apps/client-pwa/components/CustomerMenu.tsx', 'MENU_STOCK_POLL_MS'],
]) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  if (!src.includes(needle)) failures.push(`${rel} missing ${needle} (U-27)`);
}

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

loadEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (supabaseUrl && anonKey) {
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.rpc('get_cafe_public_menu', {
    p_company_id: CVS_COMPANY_ID,
  });

  if (error) {
    failures.push(`RPC error: ${error.message}`);
  } else if (!Array.isArray(data) || data.length === 0) {
    failures.push('RPC returned no menu rows for CVS company');
  } else {
    const sample = data[0];
    if (!Object.prototype.hasOwnProperty.call(sample, 'available_qty')) {
      failures.push('RPC row missing available_qty property — migration not applied?');
    } else {
      const withQty = data.filter((row) => typeof row.available_qty === 'number');
      const withNull = data.filter((row) => row.available_qty === null);
      console.log(
        `  RPC sample: ${data.length} items, ${withQty.length} with numeric qty, ${withNull.length} unlimited (null)`,
      );
    }
  }
} else {
  console.warn('  Skipped live RPC check (Supabase env missing)');
}

if (failures.length > 0) {
  console.error('Cafe public menu available_qty verify FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ Cafe public menu stock pipeline ready (RPC + client-pwa badges + 60s poll)');
