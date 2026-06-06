/**
 * Prints SQL to add md_settings columns missing on some Supabase projects.
 * Run: node scripts/print-md-settings-migration.mjs
 * Paste output into Supabase → SQL → New query → Run.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(
  join(root, 'packages/supabase/migrations/20260604120000_md_settings_missing_columns_bundle.sql'),
  'utf8',
);

console.log('-- Pearzen: md_settings column bundle\n');
console.log(sql);
console.log('\n-- Copy everything above into Supabase SQL editor and execute.');
