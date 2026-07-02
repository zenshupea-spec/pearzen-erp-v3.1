/**
 * SM ↔ MNR roster parity gate — active sector managers must appear in both desks.
 * Run: node scripts/verify-sm-mnr-roster-parity.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const SM_OR_FILTER = 'group.eq.SECTOR_MANAGER,and(group.eq.HEAD_OFFICE,rank.eq.SM)';

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

function isHrActive(row) {
  return cell(row.status).toUpperCase() === 'ACTIVE';
}

function isResigned(row) {
  const status = cell(row.status).toLowerCase();
  const site = cell(row.site).toUpperCase();
  return status === 'resigned' || site === 'CLEARANCE';
}

function isOperationalActive(row) {
  if (isResigned(row) || cell(row.site).toUpperCase() === 'CLEARANCE') return false;
  if (!isHrActive(row)) return false;
  if (isSectorManagerEmployee(row)) return true;
  const group = cell(row.group).toUpperCase();
  if (group === 'HEAD_OFFICE' || group === 'CAFE') return true;
  return false;
}

function parseCompanyId() {
  const idx = process.argv.indexOf('--company-id');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1].trim();
  return process.env.CVS_COMPANY_ID?.trim() || CVS_COMPANY_ID;
}

let failed = false;

function markFail() {
  failed = true;
}

async function fetchActiveSectorManagers(admin, companyId) {
  let query = admin
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, group, rank, status, site, company_id')
    .eq('status', 'ACTIVE')
    .or(SM_OR_FILTER)
    .order('full_name', { ascending: true });
  if (companyId) query = query.eq('company_id', companyId);
  const { data, error } = await query;
  if (error) throw new Error(`employees SM query: ${error.message}`);
  return (data ?? []).filter((row) => isSectorManagerEmployee(row));
}

async function main() {
  loadEnv();
  const companyId = parseCompanyId();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\nSM ↔ MNR roster parity gate\n');
  console.log(`Company: ${companyId}\n`);

  const [managers, legacyActive, authRes] = await Promise.all([
    fetchActiveSectorManagers(admin, companyId),
    admin
      .from('employees')
      .select('emp_number, full_name, group, rank')
      .eq('status', 'ACTIVE')
      .eq('group', 'SECTOR_MANAGER')
      .eq('company_id', companyId),
    admin.from('sm_portal_auth').select('epf_number, is_active').eq('is_active', true),
  ]);

  if (legacyActive.error) throw new Error(legacyActive.error.message);
  if (authRes.error) throw new Error(authRes.error.message);

  const legacyRows = legacyActive.data ?? [];
  if (legacyRows.length) {
    markFail();
    console.log(`✗ ${legacyRows.length} active legacy SECTOR_MANAGER row(s) remain — run apply-sm-group-normalize`);
    for (const row of legacyRows) {
      console.log(`  · ${sectorManagerEpfKey(row)} ${row.full_name} (${row.group}/${row.rank})`);
    }
    console.log('');
  } else {
    console.log('✓ No active legacy SECTOR_MANAGER rows\n');
  }

  const deskEpfs = new Set(managers.map((row) => sectorManagerEpfKey(row)).filter(Boolean));
  const authRows = authRes.data ?? [];
  const orphanAuth = [];
  for (const auth of authRows) {
    const epf = cell(auth.epf_number).toUpperCase();
    if (!epf) continue;
    let query = admin
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, full_name, group, rank, status')
      .eq('status', 'ACTIVE')
      .or(`emp_number.eq.${epf},epf_no.eq.${epf},epf_num.eq.${epf}`);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !isSectorManagerEmployee(data)) orphanAuth.push(epf);
  }

  if (orphanAuth.length) {
    markFail();
    console.log(`✗ ${orphanAuth.length} active sm_portal_auth EPF(s) without matching SM employee`);
    for (const epf of orphanAuth) console.log(`  · ${epf}`);
    console.log('');
  } else {
    console.log(`✓ All ${authRows.length} active sm_portal_auth row(s) resolve to SM employees\n`);
  }

  console.log('EPF      | Name                 | Group        | Rank | MNR Active | SM Desk');
  console.log('---------|----------------------|--------------|------|------------|--------');

  for (const row of managers) {
    const epf = sectorManagerEpfKey(row);
    const mnrActive = isOperationalActive(row);
    const smDesk = deskEpfs.has(epf);
    const ok = mnrActive && smDesk;
    if (!ok) markFail();
    const flag = ok ? 'PASS' : 'FAIL';
    console.log(
      `${epf.padEnd(8)} | ${cell(row.full_name).slice(0, 20).padEnd(20)} | ${cell(row.group).padEnd(12)} | ${cell(row.rank).padEnd(4)} | ${mnrActive ? 'yes' : 'NO '.padEnd(10)} | ${smDesk ? 'yes' : 'NO '} (${flag})`,
    );
  }

  if (!managers.length) {
    console.log('(no active sector managers found)');
    markFail();
  }

  console.log('');
  if (failed) {
    console.log('❌ FAILED — fix SM/MNR drift before handover\n');
    process.exit(1);
  }
  console.log(`✅ PASSED — ${managers.length} active sector manager(s) in parity\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
