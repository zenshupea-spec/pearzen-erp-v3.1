/**
 * Seed operational data for Master Hub modules on the live tenant:
 * - meal suppliers + site assignments (HQ Deductions)
 * - site required_guards / food flags (Vacancies, OM radar)
 * - employee emp_number fixes (Field PWA / SM login keys)
 * - sm_guard_assignments (SM portal guard lists)
 * - payroll_monthly_deduction_entries (HQ Deductions)
 * - billing_clients + sm_guard_attendance (Invoice Desk)
 * - site rate_matrix / client metadata (Vacancies + AR)
 * - SM + guard Supabase Auth provisioning
 * - attendance_logs + sm_visit_logs (OM/TM shift verification)
 * - attendance discrepancy rows (OM Integrity queue)
 *
 * Run: npm run seed:master-hub
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
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

function smAuthEmail(epf) {
  return `${String(epf).trim().toLowerCase()}@pearzen.sm`;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function payrollMonthFirstDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function payrollMonthEndDay(isoFirst) {
  const [y, m] = isoFirst.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

function slugClientCode(name, index = 0) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base ? `client-${base}` : `client-${index + 1}`;
}

function isRecruitableSecuritySite(siteName) {
  const name = String(siteName ?? '').trim();
  if (!name || name === 'Head Office') return false;
  if (/^caf[eé]\s*[—–-]/i.test(name)) return false;
  return true;
}

function isUnassignedGuardSite(site) {
  const s = String(site ?? '').trim().toLowerCase();
  return !s || s.includes('unassigned') || s === 'bench';
}

const DEMO_BILLING_CODES = ['C001', 'C002', 'C003', 'C004'];
const SEED_SYNC = 'SEED_MASTER_HUB';

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing Supabase env — run: npm run wire:backend');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEAL_SUPPLIERS = [
  {
    name: 'Colombo Canteen Services (Pvt) Ltd',
    address: 'No 12, Baseline Road, Colombo 09',
    phone: '+94112876543',
    bank_name: 'Commercial Bank',
    bank_branch: 'Nugegoda',
    account_name: 'Colombo Canteen Services',
    account_number: '8012345678',
  },
  {
    name: 'Guard Meals — Lanka Foods',
    address: 'Industrial Estate, Kelaniya',
    phone: '+94112901234',
    bank_name: 'Sampath Bank',
    bank_branch: 'Kiribathgoda',
    account_name: 'Lanka Foods Guard Division',
    account_number: '1023456789',
  },
];

async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  return !error;
}

async function fixEmployeeEmpNumbers() {
  const { data: rows, error } = await admin
    .from('employees')
    .select('id, emp_number, epf_no, epf_num, full_name, group, status')
    .eq('company_id', companyId)
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`employees: ${error.message}`);

  let fixed = 0;
  for (const row of rows ?? []) {
    if (row.emp_number?.trim()) continue;
    const epf = String(row.epf_no ?? row.epf_num ?? '').trim();
    if (!epf) continue;

    const { error: updErr } = await admin
      .from('employees')
      .update({ emp_number: epf.toUpperCase() })
      .eq('id', row.id);

    if (updErr) {
      console.warn(`  ⚠ emp_number fix ${row.full_name}: ${updErr.message}`);
      continue;
    }
    fixed += 1;
    console.log(`  ✓ emp_number ← ${epf} (${row.full_name ?? row.id})`);
  }
  return fixed;
}

async function enrichSites() {
  const hasProvidesFood = await columnExists('site_profiles', 'provides_food');
  const hasFoodAllowance = await columnExists('site_profiles', 'food_allowance_lkr');

  const { data: sites, error } = await admin
    .from('site_profiles')
    .select('id, site_name, required_guards, assigned_sm_epf, provides_food, company_id')
    .eq('company_id', companyId);

  if (error) throw new Error(`site_profiles: ${error.message}`);

  let updated = 0;
  for (const site of sites ?? []) {
    const isCafe = String(site.site_name).toLowerCase().includes('café') ||
      String(site.site_name).toLowerCase().includes('cafe') ||
      String(site.site_name).toLowerCase().includes('tasha');

    const patch = {};
    if (!isCafe && site.assigned_sm_epf && (site.required_guards ?? 0) < 2) {
      patch.required_guards = 2;
    }
    if (!isCafe && !site.assigned_sm_epf && (site.required_guards ?? 0) < 1) {
      patch.required_guards = 1;
    }
    if (hasProvidesFood && !isCafe && site.site_name.includes('test site')) {
      patch.provides_food = true;
      if (hasFoodAllowance) patch.food_allowance_lkr = 1500;
    }

    if (!Object.keys(patch).length) continue;

    const { error: updErr } = await admin.from('site_profiles').update(patch).eq('id', site.id);
    if (updErr) {
      console.warn(`  ⚠ site ${site.site_name}: ${updErr.message}`);
      continue;
    }
    updated += 1;
    console.log(`  ✓ site ${site.site_name}:`, patch);
  }
  return updated;
}

async function seedMealSuppliers() {
  const { data: existing } = await admin
    .from('meal_suppliers')
    .select('id, name')
    .eq('company_id', companyId);

  const byName = new Map((existing ?? []).map((r) => [r.name, r.id]));
  const ids = [];

  for (const supplier of MEAL_SUPPLIERS) {
    if (byName.has(supplier.name)) {
      ids.push(byName.get(supplier.name));
      console.log(`  · meal supplier exists: ${supplier.name}`);
      continue;
    }
    const { data, error } = await admin
      .from('meal_suppliers')
      .insert({ ...supplier, company_id: companyId, status: 'ACTIVE' })
      .select('id')
      .single();
    if (error) throw new Error(`meal_suppliers: ${error.message}`);
    ids.push(data.id);
    console.log(`  ✓ meal supplier: ${supplier.name}`);
  }
  return ids;
}

async function assignMealSuppliers(supplierIds) {
  if (!supplierIds.length) return 0;

  const hasProvidesFood = await columnExists('site_profiles', 'provides_food');
  let query = admin
    .from('site_profiles')
    .select('id, site_name, provides_food')
    .eq('company_id', companyId);

  const { data: sites, error } = await query;
  if (error) throw new Error(`sites for meal assign: ${error.message}`);

  const foodSites = (sites ?? []).filter((s) => {
    if (hasProvidesFood && s.provides_food) return true;
    return String(s.site_name).toLowerCase().includes('test site');
  });

  let assigned = 0;
  for (let i = 0; i < foodSites.length; i++) {
    const site = foodSites[i];
    const supplierId = supplierIds[i % supplierIds.length];
    const { error: upsErr } = await admin.from('site_meal_supplier_assignments').upsert(
      {
        company_id: companyId,
        site_profile_id: site.id,
        meal_supplier_id: supplierId,
        notes: 'Master hub operational seed',
      },
      { onConflict: 'site_profile_id' },
    );
    if (upsErr) {
      console.warn(`  ⚠ meal assign ${site.site_name}: ${upsErr.message}`);
      continue;
    }
    assigned += 1;
    console.log(`  ✓ meal supplier assigned → ${site.site_name}`);
  }
  return assigned;
}

async function linkGuardsToSmSites() {
  const { data: sms } = await admin
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');

  const smEpfs = (sms ?? [])
    .map((s) => String(s.emp_number ?? s.epf_no ?? '').trim())
    .filter(Boolean);

  const { data: sites } = await admin
    .from('site_profiles')
    .select('site_name, assigned_sm_epf')
    .eq('company_id', companyId)
    .not('assigned_sm_epf', 'is', null);

  const sitesBySm = new Map();
  for (const site of sites ?? []) {
    const sm = String(site.assigned_sm_epf);
    const list = sitesBySm.get(sm) ?? [];
    list.push(site.site_name);
    sitesBySm.set(sm, list);
  }

  const { data: guards } = await admin
    .from('employees')
    .select('id, emp_number, epf_no, site, full_name')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE');

  let siteLinked = 0;
  let assignLinked = 0;
  let benchAssigned = 0;
  const maxBenchAssign = Math.max(0, Number(process.env.SEED_BENCH_ASSIGN_MAX ?? 1));

  for (const guard of guards ?? []) {
    const epf = String(guard.emp_number ?? guard.epf_no ?? '').trim();
    if (!epf) continue;

    if (isUnassignedGuardSite(guard.site) && benchAssigned < maxBenchAssign) {
      const smEpf = smEpfs[0];
      const siteNames = sitesBySm.get(smEpf) ?? [];
      const targetSite = siteNames[0];
      if (targetSite) {
        await admin.from('employees').update({ site: targetSite }).eq('id', guard.id);
        console.log(`  ✓ guard ${epf} → site ${targetSite}`);
        siteLinked += 1;
        benchAssigned += 1;
      }
    } else if (isUnassignedGuardSite(guard.site)) {
      console.log(`  · guard ${epf} left on bench (vacancy desk)`);
    }

    for (const smEpf of smEpfs) {
      const { error } = await admin.from('sm_guard_assignments').upsert(
        { sm_epf: smEpf, guard_epf: epf },
        { onConflict: 'sm_epf,guard_epf', ignoreDuplicates: true },
      );
      if (!error) assignLinked += 1;
    }
  }

  console.log(`  ✓ guard site links: ${siteLinked}, sm_guard_assignments upserts: ${assignLinked}`);

  const { data: afterGuards } = await admin
    .from('employees')
    .select('id, emp_number, epf_no, site')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE')
    .order('emp_number', { ascending: true });

  const benchGuards = (afterGuards ?? []).filter((g) => isUnassignedGuardSite(g.site));
  if (maxBenchAssign > 0 && (afterGuards ?? []).length > 1 && benchGuards.length === 0) {
    const move = (afterGuards ?? [])[(afterGuards ?? []).length - 1];
    const epf = String(move.emp_number ?? move.epf_no ?? '').trim();
    await admin.from('employees').update({ site: 'Unassigned (Bench)' }).eq('id', move.id);
    console.log(`  ✓ guard ${epf} → Unassigned (Bench) for vacancy desk`);
  }

  return { siteLinked, assignLinked };
}

async function provisionSmPortalAuth() {
  const { data: managers, error } = await admin
    .from('employees')
    .select('emp_number, epf_no, full_name')
    .eq('company_id', companyId)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`SM employees: ${error.message}`);

  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const usersByEmail = new Map(
    (userList?.users ?? []).map((u) => [String(u.email ?? '').toLowerCase(), u.id]),
  );

  let provisioned = 0;
  for (const mgr of managers ?? []) {
    const epf = String(mgr.emp_number ?? mgr.epf_no ?? '').trim().toUpperCase();
    if (!epf) continue;

    const email = smAuthEmail(epf);
    const otp = generateOtp();
    const existingId = usersByEmail.get(email);

    if (existingId) {
      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, {
        password: otp,
        email_confirm: true,
      });
      if (updErr) {
        console.warn(`  ⚠ SM auth update ${epf}: ${updErr.message}`);
        continue;
      }
    } else {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password: otp,
        email_confirm: true,
      });
      if (createErr) {
        console.warn(`  ⚠ SM auth create ${epf}: ${createErr.message}`);
        continue;
      }
    }

    const { error: dbErr } = await admin.from('sm_portal_auth').upsert(
      {
        epf_number: epf,
        current_otp: otp,
        needs_pin_setup: true,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'epf_number' },
    );

    if (dbErr) {
      console.warn(`  ⚠ sm_portal_auth ${epf}: ${dbErr.message}`);
      continue;
    }

    provisioned += 1;
    console.log(`  ✓ SM portal ${epf} (${mgr.full_name}) — login OTP/password: ${otp}`);
  }
  return provisioned;
}

async function provisionGuardAuth() {
  process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE =
    process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE || '{{epfNo}}';

  const { provisionGuardPortalAuth, canonicalEpfFromEmployee } = await import(
    '../apps/field-pwa/lib/guard-auth.ts'
  );

  const { data: rows, error } = await admin
    .from('employees')
    .select('id, full_name, emp_number, epf_no, epf_num, status')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`guard employees: ${error.message}`);

  let ok = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const epf = canonicalEpfFromEmployee(row);
    if (!epf) {
      skipped += 1;
      continue;
    }
    const result = await provisionGuardPortalAuth(admin, row);
    if (!result.ok) {
      console.warn(`  ⚠ guard auth ${epf}: ${result.error}`);
      continue;
    }
    ok += 1;
    console.log(`  ✓ guard auth ${epf} → ${result.email}`);
  }
  return { ok, skipped };
}

async function seedDraftDeductionEntries() {
  const payrollMonth = payrollMonthFirstDay();

  const { data: guards, error } = await admin
    .from('employees')
    .select('id, emp_number, epf_no, full_name')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE');

  if (error) throw new Error(`guards for deductions: ${error.message}`);

  let inserted = 0;
  for (const guard of guards ?? []) {
    const { error: upsErr } = await admin.from('payroll_monthly_deduction_entries').upsert(
      {
        company_id: companyId,
        employee_id: guard.id,
        payroll_month: payrollMonth,
        uniform_amount_lkr: 2500,
        meals_amount_lkr: 1500,
        status: 'DRAFT',
        notes: 'Master hub operational seed',
      },
      { onConflict: 'employee_id,payroll_month' },
    );
    if (upsErr) {
      console.warn(`  ⚠ deduction entry ${guard.emp_number ?? guard.epf_no}: ${upsErr.message}`);
      continue;
    }
    inserted += 1;
  }
  console.log(`  ✓ draft deduction entries (${payrollMonth}): ${inserted}`);
  return inserted;
}

async function enrichInvoiceVacancySites() {
  const { data: sites, error } = await admin
    .from('site_profiles')
    .select('id, site_name, client_name, parent_client, address, rate_matrix, required_guards, per_visit_charge_lkr')
    .eq('company_id', companyId);

  if (error) throw new Error(`site_profiles: ${error.message}`);

  let updated = 0;
  for (const site of sites ?? []) {
    if (!isRecruitableSecuritySite(site.site_name)) continue;

    const patch = {};
    const clientName =
      (site.client_name ?? '').trim() ||
      String(site.site_name).split(/\s*[—–-]\s*/)[0]?.trim() ||
      site.site_name;

    if (!(site.client_name ?? '').trim()) patch.client_name = clientName;
    if (!(site.parent_client ?? '').trim()) patch.parent_client = clientName;
    if (!(site.address ?? '').trim()) {
      patch.address = `${clientName} — billing address on file`;
    }

    const matrix = site.rate_matrix && typeof site.rate_matrix === 'object' ? site.rate_matrix : {};
    const jsoQty = Number(matrix.JSO?.qty ?? 0);
    const ssoQty = Number(matrix.SSO?.qty ?? 0);
    if (jsoQty + ssoQty < (site.required_guards ?? 1)) {
      patch.rate_matrix = {
        ...matrix,
        JSO: { qty: Math.max(2, site.required_guards ?? 2), invoiceRate: 8500, payRate: 4200 },
        SSO: { qty: 1, invoiceRate: 9200, payRate: 4800 },
      };
    }

    if (site.per_visit_charge_lkr == null || Number(site.per_visit_charge_lkr) <= 0) {
      patch.per_visit_charge_lkr = 3500;
    }

    if (!Object.keys(patch).length) continue;

    const { error: updErr } = await admin.from('site_profiles').update(patch).eq('id', site.id);
    if (updErr) {
      console.warn(`  ⚠ invoice site ${site.site_name}: ${updErr.message}`);
      continue;
    }
    updated += 1;
    console.log(`  ✓ ${site.site_name}:`, Object.keys(patch).join(', '));
  }
  return updated;
}

async function replaceDemoBillingClients() {
  const { error: delErr } = await admin
    .from('billing_clients')
    .delete()
    .eq('company_id', companyId)
    .in('client_code', DEMO_BILLING_CODES);
  if (delErr) console.warn(`  ⚠ remove demo billing clients: ${delErr.message}`);

  const { data: sites, error } = await admin
    .from('site_profiles')
    .select('id, site_name, client_name, parent_client, address, client_billing_address')
    .eq('company_id', companyId)
    .order('site_name');

  if (error) throw new Error(`billing site_profiles: ${error.message}`);

  const seen = new Set();
  const rows = [];
  let index = 0;
  for (const site of sites ?? []) {
    if (!isRecruitableSecuritySite(site.site_name)) continue;
    const clientName =
      (site.client_name ?? '').trim() ||
      (site.parent_client ?? '').trim() ||
      String(site.site_name).split(/\s*[—–-]\s*/)[0]?.trim() ||
      site.site_name;
    if (!clientName || seen.has(clientName)) continue;
    seen.add(clientName);

    rows.push({
      company_id: companyId,
      client_code: slugClientCode(clientName, index),
      client_name: clientName,
      sector: String(site.site_name).trim(),
      address:
        (site.client_billing_address ?? '').trim() ||
        (site.address ?? '').trim() ||
        '',
      purchaser_tin: '',
      invoice_contact_name: 'Accounts Payable',
      invoice_contact_phone: '+94112345678',
      site_profile_id: site.id,
      updated_at: new Date().toISOString(),
    });
    index += 1;
  }

  if (!rows.length) {
    console.log('  · no recruitable security sites for billing_clients');
    return 0;
  }

  const { error: upsErr } = await admin.from('billing_clients').upsert(rows, {
    onConflict: 'company_id,client_code',
  });
  if (upsErr) throw new Error(`billing_clients upsert: ${upsErr.message}`);

  console.log(`  ✓ billing_clients: ${rows.length} (${rows.map((r) => r.client_name).join(', ')})`);
  return rows.length;
}

async function seedSmGuardAttendanceForInvoice() {
  const payrollMonth = payrollMonthFirstDay();
  const monthEnd = payrollMonthEndDay(payrollMonth);

  const { data: guards, error: guardErr } = await admin
    .from('employees')
    .select('emp_number, epf_no, site')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE');

  if (guardErr) throw new Error(`guards for invoice shifts: ${guardErr.message}`);

  const { data: smRow } = await admin
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  const smEpf = String(smRow?.emp_number ?? smRow?.epf_no ?? '144').trim();
  const shiftDates = [5, 8, 12, 15, 18, 22].map((day) => {
    const d = String(day).padStart(2, '0');
    return `${payrollMonth.slice(0, 8)}${d}`;
  }).filter((d) => d <= monthEnd);

  await admin
    .from('sm_guard_attendance')
    .delete()
    .eq('sm_epf', smEpf)
    .gte('shift_date', payrollMonth)
    .lte('shift_date', monthEnd)
    .in(
      'guard_epf',
      (guards ?? [])
        .map((g) => String(g.emp_number ?? g.epf_no ?? '').trim())
        .filter(Boolean),
    );

  let inserted = 0;
  for (const guard of guards ?? []) {
    const guardEpf = String(guard.emp_number ?? guard.epf_no ?? '').trim();
    const siteName = String(guard.site ?? '').trim();
    if (!guardEpf || isUnassignedGuardSite(siteName)) continue;

    for (const shiftDate of shiftDates) {
      const { error } = await admin.from('sm_guard_attendance').upsert(
        {
          sm_epf: smEpf,
          shift_date: shiftDate,
          shift_type: 'DAY',
          site_name: siteName,
          guard_epf: guardEpf,
          status: 'SUBMITTED',
        },
        { onConflict: 'sm_epf,shift_date,shift_type,guard_epf' },
      );
      if (error) {
        console.warn(`  ⚠ sm_guard_attendance ${guardEpf} ${shiftDate}: ${error.message}`);
        continue;
      }
      inserted += 1;
    }
  }

  console.log(`  ✓ sm_guard_attendance (${payrollMonth.slice(0, 7)}): ${inserted} shift rows`);
  return inserted;
}

async function seedOmVerificationQueue() {
  const today = new Date().toISOString().split('T')[0];
  const dayCheckIn = `${today}T00:35:00+00:00`;
  const dayCheckOut = `${today}T12:32:00+00:00`;

  const { data: guards, error } = await admin
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE')
    .limit(2);

  if (error) throw new Error(`guards for OM verify: ${error.message}`);

  await admin
    .from('attendance_logs')
    .delete()
    .gte('device_time', `${today}T00:00:00`)
    .lt('device_time', `${today}T23:59:59.999`)
    .like('sync_type', `${SEED_SYNC}%`);

  const rows = [];
  for (const guard of guards ?? []) {
    const emp = String(guard.emp_number ?? guard.epf_no ?? '').trim();
    if (!emp) continue;
    rows.push(
      {
        emp_number: emp,
        company_id: companyId,
        action_type: 'CHECK_IN',
        device_time: dayCheckIn,
        latitude: 6.9271,
        longitude: 79.8612,
        sync_type: `${SEED_SYNC}|TIMING_OK`,
        status: 'PENDING',
      },
      {
        emp_number: emp,
        company_id: companyId,
        action_type: 'CHECK_OUT',
        device_time: dayCheckOut,
        latitude: 6.9271,
        longitude: 79.8612,
        sync_type: `${SEED_SYNC}|TIMING_OK`,
        status: 'PENDING',
      },
    );
  }

  if (!rows.length) {
    console.log('  · no guards for OM verification seed');
    return 0;
  }

  const { error: insErr } = await admin.from('attendance_logs').insert(rows);
  if (insErr) throw new Error(`attendance_logs: ${insErr.message}`);

  console.log(`  ✓ attendance_logs (${today}): ${rows.length} rows for shift verification`);
  return rows.length;
}

async function seedSmVisitLogs() {
  const today = new Date().toISOString().split('T')[0];

  const { data: smRow } = await admin
    .from('employees')
    .select('emp_number, epf_no')
    .eq('company_id', companyId)
    .eq('group', 'SECTOR_MANAGER')
    .eq('status', 'ACTIVE')
    .limit(1)
    .maybeSingle();

  const smEpf = String(smRow?.emp_number ?? smRow?.epf_no ?? '144').trim();

  const { data: sites } = await admin
    .from('site_profiles')
    .select('site_name')
    .eq('company_id', companyId)
    .eq('assigned_sm_epf', smEpf)
    .limit(3);

  const siteNames = (sites ?? [])
    .map((s) => String(s.site_name).trim())
    .filter((name) => isRecruitableSecuritySite(name));

  if (!siteNames.length) {
    console.log('  · no SM sites for visit log seed');
    return 0;
  }

  await admin
    .from('sm_visit_logs')
    .delete()
    .gte('created_at', `${today}T00:00:00`)
    .lt('created_at', `${today}T23:59:59.999`)
    .like('notes', `${SEED_SYNC}%`);

  const visits = [
    {
      sm_epf: smEpf,
      visit_type: 'VISIT',
      site_name: siteNames[0],
      visit_date: today,
      latitude: 6.9271,
      longitude: 79.8612,
      verification_status: 'PENDING',
      notes: `${SEED_SYNC} pending visit`,
      created_at: `${today}T08:15:00+00:00`,
    },
    {
      sm_epf: smEpf,
      visit_type: 'VISIT',
      site_name: siteNames[1] ?? siteNames[0],
      visit_date: today,
      latitude: 6.9271,
      longitude: 79.8612,
      verification_status: 'APPROVED',
      notes: `${SEED_SYNC} approved visit`,
      created_at: `${today}T11:40:00+00:00`,
    },
  ];

  if (siteNames[2]) {
    visits.push({
      sm_epf: smEpf,
      visit_type: 'VISIT',
      site_name: siteNames[2],
      visit_date: today,
      latitude: 6.9271,
      longitude: 79.8612,
      verification_status: 'FLAGGED',
      notes: `${SEED_SYNC} flagged visit`,
      created_at: `${today}T15:20:00+00:00`,
    });
  }

  const { error } = await admin.from('sm_visit_logs').insert(visits);
  if (error) throw new Error(`sm_visit_logs: ${error.message}`);

  console.log(`  ✓ sm_visit_logs (${today}): ${visits.length} visits for SM ${smEpf}`);
  return visits.length;
}

async function seedDiscrepancyQueue() {
  const today = new Date().toISOString().split('T')[0];

  const { data: guards, error: guardErr } = await admin
    .from('employees')
    .select('id, emp_number, epf_no, full_name, site')
    .eq('company_id', companyId)
    .eq('group', 'GUARD')
    .eq('status', 'ACTIVE')
    .order('emp_number')
    .limit(2);

  if (guardErr) throw new Error(`guards for discrepancy seed: ${guardErr.message}`);
  if (!guards?.length) {
    console.log('  · no guards for discrepancy seed');
    return 0;
  }

  const primary = guards[0];
  const secondary = guards[1] ?? guards[0];
  const siteName = String(primary.site ?? '').trim();

  let siteProfileId = null;
  if (siteName && !isUnassignedGuardSite(siteName)) {
    const { data: siteRow } = await admin
      .from('site_profiles')
      .select('id')
      .eq('company_id', companyId)
      .eq('site_name', siteName)
      .maybeSingle();
    siteProfileId = siteRow?.id ?? null;
  }

  if (!siteProfileId) {
    const { data: fallbackSite } = await admin
      .from('site_profiles')
      .select('id, site_name')
      .eq('company_id', companyId)
      .gt('required_guards', 0)
      .limit(1)
      .maybeSingle();
    siteProfileId = fallbackSite?.id ?? null;
  }

  await admin
    .from('attendance_logs')
    .delete()
    .eq('company_id', companyId)
    .like('sync_type', `${SEED_SYNC}|DISC%`);

  const rows = [
    {
      company_id: companyId,
      guard_id: primary.id,
      site_profile_id: siteProfileId,
      emp_number: String(primary.emp_number ?? primary.epf_no ?? '').trim(),
      action_type: 'CHECK_IN',
      device_time: `${today}T02:12:00+00:00`,
      shift_date: today,
      rostered_start: `${today}T01:00:00+00:00`,
      biometric_check_in: `${today}T02:12:00+00:00`,
      is_overlap_conflict: false,
      status: 'PENDING_RESOLUTION',
      sync_type: `${SEED_SYNC}|DISC|LATE`,
    },
    {
      company_id: companyId,
      guard_id: secondary.id,
      site_profile_id: siteProfileId,
      emp_number: String(secondary.emp_number ?? secondary.epf_no ?? '').trim(),
      action_type: 'CHECK_IN',
      device_time: `${today}T13:40:00+00:00`,
      shift_date: today,
      rostered_start: `${today}T14:00:00+00:00`,
      biometric_check_in: `${today}T13:40:00+00:00`,
      is_overlap_conflict: true,
      status: 'PENDING_RESOLUTION',
      sync_type: `${SEED_SYNC}|DISC|OVERLAP`,
    },
  ];

  const { error } = await admin.from('attendance_logs').insert(rows);
  if (error) throw new Error(`discrepancy seed: ${error.message}`);

  console.log(`  ✓ discrepancy queue (${today}): ${rows.length} PENDING_RESOLUTION rows`);
  return rows.length;
}

console.log('\nMaster Hub operational seed');
console.log(`  Company: ${companyId}`);
console.log(`  Supabase: ${url}\n`);

console.log('1/11 Fix employee emp_number from EPF…');
const empFixed = await fixEmployeeEmpNumbers();
console.log(`   → ${empFixed} updated\n`);

console.log('2/11 Enrich site_profiles (required_guards, food)…');
const sitesUpdated = await enrichSites();
console.log(`   → ${sitesUpdated} sites updated\n`);

console.log('3/11 Meal suppliers…');
const supplierIds = await seedMealSuppliers();
const mealAssigned = await assignMealSuppliers(supplierIds);
console.log(`   → ${mealAssigned} site meal assignments\n`);

console.log('4/11 Guard ↔ SM site links…');
await linkGuardsToSmSites();
console.log('');

console.log('5/11 SM portal auth…');
const smCount = await provisionSmPortalAuth();
console.log(`   → ${smCount} SM(s) provisioned\n`);

console.log('6/11 Field PWA guard auth…');
const guardAuth = await provisionGuardAuth();
console.log(`   → ${guardAuth.ok} guards provisioned (${guardAuth.skipped} skipped)\n`);

console.log('7/11 HQ draft deduction entries…');
await seedDraftDeductionEntries();
console.log('');

console.log('8/11 Invoice Desk — site billing metadata…');
const invoiceSites = await enrichInvoiceVacancySites();
console.log(`   → ${invoiceSites} sites enriched\n`);

console.log('9/11 Invoice Desk — billing_clients (replace demo C001–C004)…');
const billingCount = await replaceDemoBillingClients();
console.log(`   → ${billingCount} client(s)\n`);

console.log('10/11 Invoice + OM/TM shift data…');
await seedSmGuardAttendanceForInvoice();
await seedOmVerificationQueue();
await seedSmVisitLogs();
console.log('');

console.log('11/11 OM Integrity discrepancy queue…');
await seedDiscrepancyQueue();
console.log('');

console.log('\n✓ Master Hub operational seed complete.');
console.log('  HQ Deductions → meal suppliers + draft entries');
console.log('  HR Vacancies → security sites with rate_matrix + bench gaps');
console.log('  Invoice Desk → billing_clients + sm_guard_attendance for current month');
console.log('  OM Shift Verification → today’s attendance_logs + sm_visit_logs');
console.log('  OM Integrity → PENDING_RESOLUTION discrepancy rows');
console.log('  SM PWA → use OTP printed above for first login, then set PIN');
console.log('  Field PWA → EPF as login + password (see FIELD_PWA_AUTH_PASSWORD_TEMPLATE)\n');
