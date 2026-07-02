/**
 * Smoke test: offboarding letter track CRUD (live Supabase).
 * Run: node scripts/verify-offboarding-letter-actions-smoke.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAG = 'OFFBOARDING_LETTER_ACTIONS_SMOKE';
const SELECT =
  'id, company_id, employee_id, guard_epf, status, sequence_started_at, letter_1_sent_at, letter_1_doc_url, letter_2_sent_at, letter_2_doc_url, letter_3_sent_at, letter_3_doc_url, completed_at, completion_notes, created_at, updated_at';

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

function todayDateOnly() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase URL or service role key');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  await db
    .from('guard_offboarding_letter_tracks')
    .delete()
    .like('completion_notes', `${SMOKE_TAG}%`);

  const { data: guard, error: guardErr } = await db
    .from('employees')
    .select('id, company_id, full_name, emp_number')
    .eq('status', 'ACTIVE')
    .not('emp_number', 'is', null)
    .limit(1)
    .maybeSingle();

  if (guardErr || !guard) {
    console.error('No active employee with EPF for smoke test');
    process.exit(1);
  }

  const startDate = todayDateOnly();
  const { data: created, error: createErr } = await db
    .from('guard_offboarding_letter_tracks')
    .insert({
      company_id: guard.company_id,
      employee_id: guard.id,
      guard_epf: String(guard.emp_number).trim().toUpperCase(),
      status: 'ACTIVE',
      sequence_started_at: startDate,
      completion_notes: `${SMOKE_TAG} active track`,
    })
    .select('id')
    .single();

  assert('Start ACTIVE letter track', !createErr, createErr?.message);

  const trackId = created?.id;
  const { error: markErr } = await db
    .from('guard_offboarding_letter_tracks')
    .update({
      letter_1_sent_at: new Date().toISOString(),
      letter_1_doc_url: 'https://example.com/smoke-letter-1.pdf',
      updated_at: new Date().toISOString(),
    })
    .eq('id', trackId);

  assert('Mark letter 1 sent', !markErr, markErr?.message);

  const { data: activeRow, error: readErr } = await db
    .from('guard_offboarding_letter_tracks')
    .select(SELECT)
    .eq('id', trackId)
    .maybeSingle();

  assert('Read track row', !readErr && activeRow?.status === 'ACTIVE', readErr?.message);
  assert('Letter 1 doc persisted', Boolean(activeRow?.letter_1_doc_url));

  const { error: completeErr } = await db
    .from('guard_offboarding_letter_tracks')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      completion_notes: `${SMOKE_TAG} completed`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trackId)
    .eq('status', 'ACTIVE');

  assert('Complete letter track', !completeErr, completeErr?.message);

  await db.from('guard_offboarding_letter_tracks').delete().eq('id', trackId);

  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
