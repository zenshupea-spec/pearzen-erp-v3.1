/**
 * One-time seed: inserts a SUBMITTED night shift for SM-001 (today)
 * so you can test the confirm-shift page.
 *
 * Run from the repo root:
 *   node scripts/seed-night-shift-test.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 * (or a .env file at the repo root — loaded automatically below).
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── load .env if present ──────────────────────────────────────────────────────
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env, rely on shell env */ }

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const today = new Date().toISOString().split('T')[0];
const SM_EPF = 'SM-001';

const rows = [
  { sm_epf: SM_EPF, shift_date: today, shift_type: 'NIGHT', site_name: 'Site Alpha', guard_epf: 'G-001', status: 'SUBMITTED' },
  { sm_epf: SM_EPF, shift_date: today, shift_type: 'NIGHT', site_name: 'Site Alpha', guard_epf: 'G-002', status: 'SUBMITTED' },
  { sm_epf: SM_EPF, shift_date: today, shift_type: 'NIGHT', site_name: 'Site Bravo', guard_epf: 'G-003', status: 'SUBMITTED' },
];

// Wipe existing rows for this shift first so re-runs are safe
const { error: delErr } = await supabase
  .from('sm_guard_attendance')
  .delete()
  .eq('sm_epf', SM_EPF)
  .eq('shift_date', today)
  .eq('shift_type', 'NIGHT');

if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }

const { error: insErr } = await supabase
  .from('sm_guard_attendance')
  .insert(rows);

if (insErr) { console.error('Insert error:', insErr.message); process.exit(1); }

console.log(`✓ Inserted ${rows.length} SUBMITTED night-shift rows for ${SM_EPF} on ${today}`);
console.log('  → Open the SM PWA confirm page to verify.');
