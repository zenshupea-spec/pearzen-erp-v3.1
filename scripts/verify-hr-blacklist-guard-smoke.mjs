/**
 * Smoke test: HR guard blacklist vault insert (live Supabase).
 * Run: node scripts/verify-hr-blacklist-guard-smoke.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAG = 'HR_BLACKLIST_GUARD_SMOKE';

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
    .from('guard_blacklist_vault')
    .delete()
    .like('reason', `${SMOKE_TAG}%`);

  const { data: guard, error: guardErr } = await db
    .from('employees')
    .select('id, company_id, full_name, emp_number, epf_no, rank, group')
    .in('group', ['GUARD', 'GUARD_FIELD'])
    .not('emp_number', 'is', null)
    .limit(1)
    .maybeSingle();

  if (guardErr || !guard) {
    console.error('No field guard with EPF for smoke test');
    process.exit(1);
  }

  const { data: existing } = await db
    .from('guard_blacklist_vault')
    .select('id')
    .eq('employee_id', guard.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (existing) {
    console.log('SKIP  Guard already blacklisted — pick another guard manually for full smoke');
    process.exit(0);
  }

  const empNumber = String(guard.emp_number).trim().toUpperCase();
  const reason = `${SMOKE_TAG} test blacklist`;

  const { data: inserted, error: insertErr } = await db
    .from('guard_blacklist_vault')
    .insert({
      company_id: guard.company_id,
      employee_id: guard.id,
      emp_number: empNumber,
      guard_name: guard.full_name,
      guard_rank: guard.rank,
      reason,
      blacklisted_by_name: `${SMOKE_TAG} HR`,
      status: 'ACTIVE',
    })
    .select('id, status, reason')
    .single();

  assert('Insert ACTIVE blacklist vault row', !insertErr, insertErr?.message);

  const { data: rejoinRow } = await db
    .from('guard_blacklist_vault')
    .select('employee_id, reason, blacklisted_at, blacklisted_by_name, status')
    .eq('company_id', guard.company_id)
    .eq('employee_id', guard.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  assert('Rejoin desk query finds ACTIVE row', Boolean(rejoinRow?.employee_id));
  assert('Reason persisted', rejoinRow?.reason === reason);

  const { data: omList } = await db
    .from('guard_blacklist_vault')
    .select('id, employee_id, status')
    .eq('company_id', guard.company_id)
    .eq('status', 'ACTIVE')
    .eq('employee_id', guard.id);

  assert('OM blacklisted list includes guard', (omList ?? []).length === 1);

  if (inserted?.id) {
    await db.from('guard_blacklist_vault').delete().eq('id', inserted.id);
  }

  console.log(failures.length ? `\n${failures.length} failure(s)` : '\nAll checks passed.');
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
