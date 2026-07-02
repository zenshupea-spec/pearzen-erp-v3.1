/**
 * CVS SM portal follow-ups after roster parity work:
 * 1. Provision OTP for active SMs missing current_otp_hash (e.g. ROY/446)
 * 2. Deactivate orphan sm_portal_auth rows with no matching active SM employee
 *
 * Run: node scripts/remediate-sm-portal-cvs-followups.mjs
 * Dry-run: node scripts/remediate-sm-portal-cvs-followups.mjs --dry-run
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const SM_OR_FILTER = 'group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)';
const OTP_LIFETIME_MS = 5 * 60 * 1000;
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

function cell(value) {
  return value == null ? '' : String(value).trim();
}

function isSectorManagerEmployee(row) {
  const group = cell(row.group).toUpperCase();
  if (group === 'SECTOR_MANAGER' || group === 'SM') return true;
  return cell(row.rank).toUpperCase() === 'SM';
}

function sectorManagerEpfKey(row) {
  const emp = row.emp_number != null ? String(row.emp_number).trim() : '';
  if (emp) return emp.toUpperCase();
  const epf =
    (row.epf_no != null ? String(row.epf_no).trim() : '') ||
    (row.epf_num != null ? String(row.epf_num).trim() : '');
  return epf ? epf.toUpperCase() : '';
}

function hashOtp(otp, epf) {
  const pepper =
    process.env.SM_PORTAL_OTP_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'dev-sm-otp-pepper';
  return createHash('sha256')
    .update(`${epf.toUpperCase()}:${otp}:${pepper}`)
    .digest('hex');
}

async function fetchActiveSectorManagers(admin, companyId) {
  const { data, error } = await admin
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, group, rank, status, company_id')
    .eq('status', 'ACTIVE')
    .eq('company_id', companyId)
    .or(SM_OR_FILTER)
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((row) => isSectorManagerEmployee(row));
}

async function provisionOtp(admin, employee) {
  const epf = sectorManagerEpfKey(employee);
  if (!epf) return { skipped: true, reason: 'no EPF' };

  const { data: auth } = await admin
    .from('sm_portal_auth')
    .select('epf_number, current_otp_hash, is_active')
    .eq('epf_number', epf)
    .maybeSingle();

  if (auth?.current_otp_hash) {
    return { skipped: true, epf, reason: 'hash on file' };
  }

  if (dryRun) {
    return { dryRun: true, epf, name: employee.full_name };
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const email = `${epf.toLowerCase()}@pearzen.sm`;
  const meta = {
    app_metadata: { company_id: employee.company_id },
    user_metadata: { employee_id: employee.id },
  };

  const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = userList?.users?.find((u) => u.email === email);

  if (found) {
    const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
      password: otp,
      email_confirm: true,
      ...meta,
    });
    if (updErr) return { error: updErr.message, epf };
  } else {
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
      ...meta,
    });
    if (createErr) return { error: createErr.message, epf };
  }

  const { error: dbErr } = await admin.from('sm_portal_auth').upsert(
    {
      epf_number: epf,
      current_otp: null,
      current_otp_hash: hashOtp(otp, epf),
      otp_expires_at: new Date(Date.now() + OTP_LIFETIME_MS).toISOString(),
      needs_pin_setup: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'epf_number' },
  );

  if (dbErr) return { error: dbErr.message, epf };

  return { provisioned: true, epf, name: employee.full_name, otp };
}

async function findOrphanAuthEpfs(admin, companyId) {
  const { data: authRows, error } = await admin
    .from('sm_portal_auth')
    .select('epf_number, is_active')
    .eq('is_active', true);
  if (error) throw new Error(error.message);

  const orphans = [];
  for (const auth of authRows ?? []) {
    const epf = cell(auth.epf_number).toUpperCase();
    if (!epf) continue;
    const { data, error: empErr } = await admin
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, group, rank, status')
      .eq('status', 'ACTIVE')
      .eq('company_id', companyId)
      .or(`emp_number.eq.${epf},epf_no.eq.${epf},epf_num.eq.${epf}`)
      .maybeSingle();
    if (empErr) throw new Error(empErr.message);
    if (!data || !isSectorManagerEmployee(data)) orphans.push(epf);
  }
  return orphans;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\nCVS SM portal follow-ups${dryRun ? ' (dry-run)' : ''}\n`);

  const managers = await fetchActiveSectorManagers(admin, CVS_COMPANY_ID);
  console.log(`Active sector managers: ${managers.length}`);

  for (const emp of managers) {
    const result = await provisionOtp(admin, emp);
    if (result.skipped) {
      console.log(`  skip ${result.epf ?? '?'} — ${result.reason}`);
    } else if (result.dryRun) {
      console.log(`  would provision ${result.epf} (${result.name})`);
    } else if (result.error) {
      console.error(`  ✗ ${result.epf}: ${result.error}`);
    } else if (result.provisioned) {
      console.log(`  ✓ PROVISIONED ${result.epf} (${result.name}) — OTP ${result.otp} (5 min window)`);
    }
  }

  const orphans = await findOrphanAuthEpfs(admin, CVS_COMPANY_ID);
  if (!orphans.length) {
    console.log('\nNo orphan sm_portal_auth rows.');
  } else {
    console.log(`\nOrphan auth EPF(s): ${orphans.join(', ')}`);
    for (const epf of orphans) {
      if (dryRun) {
        console.log(`  would deactivate ${epf}`);
        continue;
      }
      const { error } = await admin
        .from('sm_portal_auth')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('epf_number', epf);
      if (error) console.error(`  ✗ deactivate ${epf}: ${error.message}`);
      else console.log(`  ✓ deactivated ${epf}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
