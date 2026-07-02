/**
 * C-3 — Verify CVS legacy import against staging files.
 * Run: node scripts/verify-cvs-legacy-import.mjs
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../apps/back-office/lib/encryption.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const outDir = join(root, 'data/migration/classic-venture');
const SM_A_EPF = '13650';

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env.seed.tmp', '.env']) {
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

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        values.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function decryptPii(value) {
  if (value == null || value === '') return '';
  return decrypt(String(value)) ?? '';
}

function cell(v) {
  return String(v ?? '').trim();
}

function normUpper(v) {
  return cell(v).toUpperCase();
}

async function fetchAll(supabase, table, select, companyId) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('company_id', companyId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  loadEnv();
  process.env.NODE_ENV ??= 'development';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase env');
    process.exit(1);
  }

  const stagingEmpPath = join(outDir, 'staging-employees.csv');
  const stagingSitePath = join(outDir, 'staging-sites.csv');
  const stagingSmPath = join(outDir, 'staging-sm-guard-links.csv');
  for (const p of [stagingEmpPath, stagingSitePath, stagingSmPath]) {
    if (!existsSync(p)) {
      console.error(`Missing ${p}`);
      process.exit(1);
    }
  }

  const stagingEmployees = parseCsv(readFileSync(stagingEmpPath, 'utf8')).filter((r) => cell(r.emp_number));
  const stagingSites = parseCsv(readFileSync(stagingSitePath, 'utf8')).filter((r) => cell(r.site_name));
  const stagingSmLinks = parseCsv(readFileSync(stagingSmPath, 'utf8')).filter(
    (r) => cell(r.sm_epf) && cell(r.guard_epf),
  );

  const supabase = createClient(url, key);
  const dbEmployees = await fetchAll(
    supabase,
    'employees',
    'emp_number, full_name, rank, site, base_salary, status, group, nic, account_number, bank_code, branch_code, phone',
    CVS_COMPANY_ID,
  );
  const dbSites = await fetchAll(
    supabase,
    'site_profiles',
    'site_name, required_guards, assigned_sm_epf',
    CVS_COMPANY_ID,
  );
  const { data: smLinks, error: smErr } = await supabase.from('sm_guard_assignments').select('sm_epf, guard_epf');
  if (smErr) throw new Error(smErr.message);

  const report = [];
  const errors = [];
  const push = (line) => report.push(line);

  push(`C-3 verification ${new Date().toISOString()}`);
  push('');

  // --- Counts ---
  const dbEmpByNumber = new Map(dbEmployees.map((e) => [normUpper(e.emp_number), e]));
  const stagingEmpByNumber = new Map(stagingEmployees.map((e) => [normUpper(e.emp_number), e]));
  const dbSiteByName = new Map(dbSites.map((s) => [normUpper(s.site_name), s]));
  const stagingSiteByName = new Map(stagingSites.map((s) => [normUpper(s.site_name), s]));

  push('=== COUNTS ===');
  push(`Staging employees: ${stagingEmployees.length} │ DB (company): ${dbEmployees.length}`);
  push(`Staging sites: ${stagingSites.length} │ DB sites (company): ${dbSites.length}`);
  push(`Staging SM links: ${stagingSmLinks.length} │ DB SM links (all): ${smLinks?.length ?? 0}`);

  const missingFromDb = stagingEmployees.filter((e) => !dbEmpByNumber.has(normUpper(e.emp_number)));
  if (missingFromDb.length) {
    errors.push(`${missingFromDb.length} staging employees missing from DB`);
    push(`  Missing employees: ${missingFromDb.slice(0, 5).map((e) => e.emp_number).join(', ')}${missingFromDb.length > 5 ? '…' : ''}`);
  } else {
    push('  All staging employees present in DB ✓');
  }

  const dupEmp = dbEmployees.filter((e, i, arr) => arr.findIndex((x) => normUpper(x.emp_number) === normUpper(e.emp_number)) !== i);
  if (dupEmp.length) errors.push(`Duplicate emp_number in DB: ${dupEmp.length}`);

  // --- HR MNR spot-check (20 stratified samples) ---
  push('');
  push('=== HR MNR SPOT-CHECK (rank, site, salary, status) ===');
  let mnrMismatch = 0;
  const mnrSamples = [];
  for (let i = 0; i < 20 && i < stagingEmployees.length; i++) {
    const idx = Math.floor((i / 20) * stagingEmployees.length);
    mnrSamples.push(stagingEmployees[idx]);
  }
  for (const st of mnrSamples) {
    const empNo = normUpper(st.emp_number);
    const db = dbEmpByNumber.get(empNo);
    if (!db) {
      mnrMismatch++;
      push(`  ✗ ${empNo}: not in DB`);
      continue;
    }
    const checks = [
      ['rank', normUpper(st.rank), normUpper(db.rank)],
      ['site', normUpper(st.site), normUpper(db.site)],
      ['status', normUpper(st.status), normUpper(db.status)],
      ['base_salary', String(Number(st.base_salary) || 0), String(Number(db.base_salary) || 0)],
    ];
    const bad = checks.filter(([, a, b]) => a !== b);
    if (bad.length) {
      mnrMismatch++;
      push(`  ✗ ${empNo} ${db.full_name}: ${bad.map(([f, a, b]) => `${f} staging=${a} db=${b}`).join('; ')}`);
    } else {
      push(`  ✓ ${empNo} ${db.full_name} — ${db.rank} @ ${db.site} LKR ${db.base_salary} ${db.status}`);
    }
  }
  if (mnrMismatch) errors.push(`HR MNR spot-check: ${mnrMismatch}/20 mismatches`);
  else push('  RESULT: 20/20 spot-checks pass ✓');

  // --- PII decrypt vs staging ---
  push('');
  push('=== PII INTEGRITY (NIC + bank decrypt vs staging) ===');
  let nicMismatch = 0;
  let bankMismatch = 0;
  const piiSamples = stagingEmployees.filter(
    (e) => cell(e.nic) && !['-', '='].includes(cell(e.nic)),
  );
  for (let i = 0; i < 10 && i < piiSamples.length; i++) {
    const idx = Math.floor((i / 10) * piiSamples.length);
    const st = piiSamples[idx];
    const db = dbEmpByNumber.get(normUpper(st.emp_number));
    if (!db) continue;
    const dbNic = normUpper(decryptPii(db.nic));
    const stNic = normUpper(st.nic);
    const dbBank = cell(decryptPii(db.account_number));
    const stBank = cell(st.account_number);
    if (dbNic !== stNic) {
      nicMismatch++;
      push(`  ✗ NIC ${st.emp_number}: staging=${stNic} db=${dbNic}`);
    }
    if (stBank && stBank !== '0' && dbBank !== stBank) {
      bankMismatch++;
      push(`  ✗ Bank ${st.emp_number}: staging=${stBank} db=${dbBank}`);
    }
  }
  if (nicMismatch || bankMismatch) {
    errors.push(`PII mismatches: NIC=${nicMismatch}, bank=${bankMismatch}`);
  } else {
    push('  10/10 NIC + bank spot-checks match staging (decrypted) ✓');
  }

  // --- Sites ---
  push('');
  push('=== OM SITE DIRECTORY ===');
  let siteMismatch = 0;
  for (const st of stagingSites) {
    const name = normUpper(st.site_name);
    const db = dbSiteByName.get(name);
    if (!db) {
      siteMismatch++;
      if (siteMismatch <= 5) push(`  ✗ missing site: ${st.site_name}`);
      continue;
    }
    const req = Number(st.required_guards) || 0;
    const dbReq = Number(db.required_guards) || 0;
    if (req !== dbReq) {
      siteMismatch++;
      if (siteMismatch <= 5) push(`  ✗ ${st.site_name}: required_guards staging=${req} db=${dbReq}`);
    }
  }
  if (siteMismatch) errors.push(`Site mismatches: ${siteMismatch}`);
  else push(`  All ${stagingSites.length} staging sites in DB with matching required_guards ✓`);

  const noSmSites = stagingSites.filter((s) => !cell(s.assigned_sm_epf));
  push(`  Sites without assigned_sm_epf (expected): ${noSmSites.map((s) => s.site_name).join(', ') || 'none'}`);

  // --- SM sector A ---
  push('');
  push(`=== SM PORTAL — Sector A (V.O. EPF ${SM_A_EPF}) ===`);
  const stagingSectorA = stagingSmLinks.filter((l) => cell(l.sm_epf) === SM_A_EPF);
  const dbSectorA = (smLinks ?? []).filter((l) => cell(l.sm_epf) === SM_A_EPF);
  push(`  Staging SM links for sector A: ${stagingSectorA.length}`);
  push(`  DB SM links for sector A: ${dbSectorA.length}`);

  const sm = dbEmpByNumber.get(SM_A_EPF);
  if (!sm || normUpper(sm.group) !== 'SECTOR_MANAGER') {
    errors.push(`SM ${SM_A_EPF} not found or not SECTOR_MANAGER (group=${sm?.group})`);
    push(`  ✗ SM employee ${SM_A_EPF}: group=${sm?.group ?? 'MISSING'}`);
  } else {
    push(`  ✓ SM ${SM_A_EPF}: ${sm.full_name} (SECTOR_MANAGER)`);
  }

  let smLinkMissing = 0;
  for (const link of stagingSectorA) {
    const guard = normUpper(link.guard_epf);
    const found = dbSectorA.some((l) => normUpper(l.guard_epf) === guard);
    if (!found) smLinkMissing++;
  }
  if (smLinkMissing) errors.push(`Sector A SM links missing: ${smLinkMissing}`);
  else push(`  All ${stagingSectorA.length} sector-A guard links present ✓`);

  const sampleGuards = stagingSectorA.slice(0, 3).map((l) => l.guard_epf);
  for (const g of sampleGuards) {
    const emp = dbEmpByNumber.get(normUpper(g));
    push(`  Sample guard ${g}: ${emp ? emp.full_name : 'NOT FOUND'} — ${emp?.site ?? 'no site'}`);
  }

  // --- Field PWA auth readiness ---
  push('');
  push('=== FIELD PWA AUTH READINESS ===');
  const authSamples = ['12', '17', '13650'];
  for (const epf of authSamples) {
    const emp = dbEmpByNumber.get(normUpper(epf));
    if (!emp) {
      push(`  ✗ EPF ${epf}: employee not found`);
      errors.push(`Field auth sample ${epf} missing`);
      continue;
    }
    const active = normUpper(emp.status) === 'ACTIVE';
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const emailLocal = `${normUpper(epf).toLowerCase()}@pearzen.local`;
    const hasAuth = authUsers?.users?.some((u) => u.email?.toLowerCase() === emailLocal);
    push(
      `  EPF ${epf}: ${emp.full_name} status=${emp.status}${active ? '' : ' (inactive)'} │ auth provisioned: ${hasAuth ? 'yes' : 'no (C-4)'}`,
    );
  }
  push('  Note: guard auth auto-provisions on first login — not required for C-3 data load verify');

  // --- Summary ---
  push('');
  if (errors.length === 0) {
    push('RESULT: PASS — C-3 verification complete');
  } else {
    push(`RESULT: FAIL — ${errors.length} issue(s):`);
    for (const e of errors) push(`  ! ${e}`);
  }

  const text = report.join('\n') + '\n';
  console.log(text);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'c-3-verification-report.txt'), text);

  process.exit(errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
