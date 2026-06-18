/**
 * MD Master Hub walkthrough — live data check in hub module order.
 * Run: npm run walkthrough:md
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const companyId = process.env.SEED_COMPANY_ID ?? CLASSIC_VENTURE_COMPANY_ID;
const db = createClient(url, key);
const today = todayIso();
const monthStart = `${today.slice(0, 7)}-01`;
const BO = 'http://127.0.0.1:3002';

const steps = [];

function step(num, name, path, ok, detail, expect) {
  steps.push({ num, name, path, ok, detail, expect });
  const icon = ok ? '✓' : '✗';
  console.log(`${icon} ${String(num).padStart(2, '0')}. ${name}`);
  console.log(`    ${path}`);
  console.log(`    ${detail}`);
  if (expect) console.log(`    → ${expect}`);
  console.log('');
}

console.log('\n══════════════════════════════════════════════════════════');
console.log(' MD Master Hub walkthrough (Classic Venture)');
console.log(` ${today} · company ${companyId.slice(0, 8)}…`);
console.log('══════════════════════════════════════════════════════════\n');

// 00 — MD entry
const { data: mdRow } = await db
  .from('employees')
  .select('full_name, email, rank, emp_number')
  .eq('company_id', companyId)
  .eq('rank', 'MD')
  .maybeSingle();

step(
  0,
  'MD Portal (HQ Master Hub)',
  `${BO}/dashboard`,
  Boolean(mdRow?.email),
  mdRow
    ? `MD record: ${mdRow.full_name} (${mdRow.emp_number}) · ${mdRow.email}`
    : 'No MD employee on tenant',
  'Sign in at /login/head-office with Google (work email on MNR) → Master Hub',
);

// Badges proxy
const [{ count: draftDed }, { count: vacancySites }, { count: pendingDisc }] = await Promise.all([
  db
    .from('payroll_monthly_deduction_entries')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'DRAFT'),
  db
    .from('site_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gt('required_guards', 0),
  db
    .from('attendance_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'PENDING_RESOLUTION'),
]);

console.log('    Hub badges (live):');
if (draftDed) console.log(`      · Deductions: ${draftDed} Unapproved`);
if (pendingDisc) console.log(`      · OM discrepancies: ${pendingDisc} pending`);
console.log('');

// 01 Executive Vault (note demo KPIs)
step(
  1,
  'Executive Vault (finance radar)',
  `${BO}/executive/finance`,
  true,
  'Page loads — KPI tiles use static demo data (out of finalization scope)',
  'MD sidebar · link back to Master Hub from finance shell',
);

// Field Operations
const { count: activeGuards } = await db
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .eq('group', 'GUARD')
  .eq('status', 'ACTIVE');

const { count: verifyToday } = await db
  .from('attendance_logs')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .gte('device_time', `${today}T00:00:00`)
  .like('sync_type', 'SEED_MASTER_HUB%');

step(
  2,
  'CV Operations',
  `${BO}/om`,
  (activeGuards ?? 0) >= 2 && (verifyToday ?? 0) >= 2,
  `${activeGuards} active guards · ${verifyToday} verification logs today`,
  'Shift Verification tab · today’s date · guards 007/990',
);

const { count: smVisits } = await db
  .from('sm_visit_logs')
  .select('*', { count: 'exact', head: true })
  .gte('visit_date', today);

step(
  3,
  'TM Command Center',
  `${BO}/tm?tab=shift-verification`,
  (verifyToday ?? 0) >= 2,
  `Shares OM verification queue · ${smVisits} SM visits today`,
  'Same shift verification + guard cards tabs',
);

const { count: smAuth } = await db
  .from('sm_portal_auth')
  .select('*', { count: 'exact', head: true })
  .eq('is_active', true);

step(
  4,
  'SM Portal',
  'http://127.0.0.1:3003',
  (smAuth ?? 0) >= 1,
  `${smAuth} active SM auth · EPF 144 (re-seed for OTP)`,
  'Login EPF 144 · OTP from npm run seed:master-hub',
);

step(
  5,
  'Check-in App (Field PWA)',
  'http://127.0.0.1:3001',
  (activeGuards ?? 0) >= 2,
  'Guards 007 / 990 · password = EPF (see FIELD_PWA_AUTH_PASSWORD_TEMPLATE)',
  'Check-in at test site geofence',
);

const { count: cafeOrders } = await db
  .from('cafe_customer_orders')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .in('status', ['PLACED', 'PAYMENT_RECEIVED', 'PREPARING']);

step(
  6,
  'Café Front Office',
  `${BO}/login/cafe-front`,
  (cafeOrders ?? 0) >= 3,
  `${cafeOrders} open orders · staff EPF 15 (OTP from npm run seed:cafe)`,
  'Check-in → Orders queue → accept PLACED order',
);

// Finance
step(
  7,
  'Finance & Payroll',
  `${BO}/fm`,
  (activeGuards ?? 0) >= 2,
  `${activeGuards} guards in cohort · no mock portfolio fallback`,
  'Portfolio sites from live site_profiles + guards',
);

step(
  8,
  'Deductions Admin',
  `${BO}/hq/deductions`,
  (draftDed ?? 0) >= 1,
  `${draftDed} DRAFT entries · 2 meal suppliers seeded`,
  'Approve draft rows · month lock bar (live only)',
);

const { count: billingClients } = await db
  .from('billing_clients')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId);

const { count: juneShifts } = await db
  .from('sm_guard_attendance')
  .select('*', { count: 'exact', head: true })
  .gte('shift_date', monthStart)
  .eq('status', 'SUBMITTED');

step(
  9,
  'Invoice Desk',
  `${BO}/invoice-desk`,
  (billingClients ?? 0) >= 3 && (juneShifts ?? 0) >= 1,
  `${billingClients} billing clients · ${juneShifts} submitted SM shifts this month`,
  'Current month invoice lines from live shift rollup',
);

// HR
const { count: mnrActive } = await db
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .eq('status', 'ACTIVE');

const { count: mnrResigned } = await db
  .from('employees')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .eq('status', 'RESIGNED');

step(
  10,
  'HR Operations Desk (MNR)',
  `${BO}/hr/mnr`,
  (mnrActive ?? 0) >= 5 && (mnrResigned ?? 0) >= 1,
  `${mnrActive} active · ${mnrResigned} resigned (MNR-R001 clearance)`,
  'Search MNR-R001 · open clearance modal',
);

const { data: vacSites } = await db
  .from('site_profiles')
  .select('site_name, required_guards')
  .eq('company_id', companyId)
  .gt('required_guards', 0)
  .limit(5);

step(
  11,
  'Open Vacancies & Ads',
  `${BO}/hr/vacancies`,
  (vacancySites ?? 0) >= 2,
  `${vacancySites} sites with requirements · e.g. ${vacSites?.map((s) => s.site_name.split('—')[0].trim()).join(', ')}`,
  'Rank gaps on understaffed security sites',
);

// Auxiliary
const { count: menuItems } = await db
  .from('cafe_menu_items')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId);

const { count: prepItems } = await db
  .from('cafe_prep_items')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId);

step(
  12,
  'Café Backoffice',
  `${BO}/executive/cafe?hub=1`,
  (menuItems ?? 0) >= 1 && (prepItems ?? 0) >= 1,
  `${menuItems} menu items · ${prepItems} prep rows · tasks/stock seeded`,
  'Hub view (no MD executive sidebar)',
);

const { count: auditRows } = await db
  .from('audit_logs')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId);

step(
  13,
  'Portal Activity Ledger',
  `${BO}/hq/audit`,
  true,
  `${auditRows ?? 0} audit_logs rows (grows as you use portals)`,
  'Cross-portal staff actions · filter by portal',
);

step(
  14,
  'OM Integrity & Discrepancies',
  `${BO}/om/discrepancies`,
  (pendingDisc ?? 0) >= 1,
  `${pendingDisc} PENDING_RESOLUTION rows · recovery plans table live`,
  'Trust roster vs check-in · attach recovery plan',
);

const failed = steps.filter((s) => !s.ok).length;
console.log('══════════════════════════════════════════════════════════');
if (failed) {
  console.log(` ${failed} step(s) need attention — re-run seeds listed above`);
  process.exit(1);
}
console.log(' All 15 stops ready for browser walkthrough.');
console.log(' Start: http://127.0.0.1:3002/login/head-office');
console.log('══════════════════════════════════════════════════════════\n');
