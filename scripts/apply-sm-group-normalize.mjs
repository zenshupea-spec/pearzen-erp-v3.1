/**
 * Normalize legacy active SECTOR_MANAGER rows → HEAD_OFFICE (rank SM unchanged).
 *
 * Usage:
 *   node scripts/apply-sm-group-normalize.mjs --dry-run
 *   node scripts/apply-sm-group-normalize.mjs
 *   node scripts/apply-sm-group-normalize.mjs --company-id <uuid>
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
  }
}

function parseCompanyId() {
  const idx = process.argv.indexOf('--company-id');
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1].trim();
  }
  return CVS_COMPANY_ID;
}

function isLegacyActiveSm(row) {
  const group = String(row.group ?? '').trim().toUpperCase();
  const rank = String(row.rank ?? '').trim().toUpperCase();
  const status = String(row.status ?? '').trim().toUpperCase();
  return group === 'SECTOR_MANAGER' && rank === 'SM' && status === 'ACTIVE';
}

async function applyViaManagementApi(sqlText) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
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
  return true;
}

async function main() {
  loadEnv();
  const companyId = parseCompanyId();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = admin
    .from('employees')
    .select('id, emp_number, epf_no, full_name, group, rank, status, company_id')
    .eq('group', 'SECTOR_MANAGER')
    .eq('rank', 'SM')
    .eq('status', 'ACTIVE');

  if (companyId) query = query.eq('company_id', companyId);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const targets = (rows ?? []).filter(isLegacyActiveSm);
  console.log(`\nSM group normalize (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  console.log(`Company: ${companyId || '(all tenants)'}`);
  console.log(`Rows to update: ${targets.length}\n`);

  if (!targets.length) {
    console.log('Nothing to update — legacy active SECTOR_MANAGER rows already normalized.');
    return;
  }

  for (const row of targets) {
    const epf = row.emp_number ?? row.epf_no ?? row.id;
    console.log(`  · ${epf} ${row.full_name} — SECTOR_MANAGER → HEAD_OFFICE (rank SM)`);
  }

  if (dryRun) {
    console.log('\nDry-run complete. Re-run without --dry-run to apply.\n');
    return;
  }

  const migrationPath = join(
    root,
    'packages/supabase/migrations/20260630210000_normalize_sector_manager_group.sql',
  );
  const sqlText = readFileSync(migrationPath, 'utf8');

  if (await applyViaManagementApi(sqlText)) {
    console.log('\n✅ Applied via Supabase Management API\n');
  } else {
    const ids = targets.map((row) => row.id);
    const { data: updated, error: updateError } = await admin
      .from('employees')
      .update({ group: 'HEAD_OFFICE' })
      .in('id', ids)
      .select('id, emp_number, full_name, group, rank');

    if (updateError) throw new Error(updateError.message);
    console.log(`\n✅ Updated ${updated?.length ?? 0} row(s) via service-role client\n`);
    for (const row of updated ?? []) {
      console.log(`  ✓ ${row.emp_number} ${row.full_name} → ${row.group}/${row.rank}`);
    }
  }

  const verifyQuery = admin
    .from('employees')
    .select('emp_number, full_name, group, rank')
    .eq('group', 'SECTOR_MANAGER')
    .eq('rank', 'SM')
    .eq('status', 'ACTIVE');
  const verify = companyId ? verifyQuery.eq('company_id', companyId) : verifyQuery;
  const { data: remaining } = await verify;
  if ((remaining ?? []).length) {
    console.warn(`⚠ ${remaining.length} legacy row(s) still SECTOR_MANAGER — review manually.`);
    process.exit(1);
  }
  console.log('✅ Verification passed — no active SECTOR_MANAGER/SM rows remain.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
