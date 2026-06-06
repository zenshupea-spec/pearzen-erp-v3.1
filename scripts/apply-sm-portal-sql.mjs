/**
 * Prints SQL to create SM portal tables. Paste into Supabase → SQL → New query → Run.
 * Run: npm run db:sm-portal-sql
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'packages/supabase/migrations/20260531120000_sm_assignments.sql',
  'packages/supabase/migrations/20260602120000_sm_guard_attendance.sql',
];

let sql = '-- Pearzen: SM portal tables\n\n';
for (const f of files) {
  sql += `-- ${f}\n`;
  sql += readFileSync(join(root, f), 'utf8');
  sql += '\n\n';
}

console.log(sql);
console.log('-- Copy everything above into Supabase SQL editor and execute.');
