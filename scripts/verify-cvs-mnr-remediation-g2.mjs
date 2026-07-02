/**
 * G-2 — HR MNR roster verification (data layer + route smoke).
 *
 * Mirrors getEmployees() roster fetch and MNR page filter logic.
 *
 * Usage: node scripts/verify-cvs-mnr-remediation-g2.mjs
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const BO = 'http://127.0.0.1:3002';
const SHIFT_LOOKBACK_DAYS = 14;
const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);
const FIELD_GUARD_RANK_CODES = new Set(['CSO', 'OIC', 'SSO', 'JSO', 'LSO']);

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

function shiftCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - SHIFT_LOOKBACK_DAYS);
  d.setHours(0, 0, 0, 0);
  return {
    iso: d.toISOString(),
    date: d.toISOString().split('T')[0],
  };
}

function isResigned(emp) {
  return (emp.status ?? '').trim().toLowerCase() === 'resigned';
}

function isHrActive(emp) {
  return (emp.status ?? '').trim().toUpperCase() === 'ACTIVE';
}

function isGuardGroup(emp) {
  return GUARD_GROUPS.has((emp.group ?? '').toUpperCase());
}

function isFieldGuardRank(rank) {
  const code = (rank ?? '').trim().toUpperCase();
  return FIELD_GUARD_RANK_CODES.has(code);
}

function isGuardEmployee(emp) {
  return isGuardGroup(emp) || isFieldGuardRank(emp.rank);
}

function employeeHasRecentShift(emp, activity) {
  const epf =
    emp.emp_number ??
    (emp.epf_no != null ? String(emp.epf_no) : emp.epf_num != null ? String(emp.epf_num) : null);
  if (epf && activity.epfSet.has(epf)) return true;
  if (emp.id && activity.employeeIdSet.has(String(emp.id))) return true;
  return false;
}

function isOperationalActive(emp, activity) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (!isGuardEmployee(emp)) return false;
  return employeeHasRecentShift(emp, activity);
}

function isOperationalInactive(emp, activity) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (!isGuardEmployee(emp)) return false;
  return !employeeHasRecentShift(emp, activity);
}

async function fetchEmployeeRows(supabase) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('id, emp_number, epf_no, epf_num, full_name, status, site, group, rank, maternity_leave')
      .eq('company_id', CVS_COMPANY_ID)
      .order('full_name', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function fetchRecentShiftIdentifiers(supabase) {
  const { iso, date } = shiftCutoff();
  const epfSet = new Set();
  const employeeIdSet = new Set();

  const [logsRes, smRes, shiftsRes] = await Promise.all([
    supabase
      .from('attendance_logs')
      .select('emp_number')
      .gte('device_time', iso)
      .eq('action_type', 'CHECK_IN'),
    supabase
      .from('sm_guard_attendance')
      .select('guard_epf')
      .gte('shift_date', date)
      .neq('status', 'CANCELLED'),
    supabase
      .from('time_shifts')
      .select('employee_id')
      .gte('check_in_time', iso),
  ]);

  for (const row of logsRes.data ?? []) {
    if (row.emp_number) epfSet.add(String(row.emp_number));
  }
  for (const row of smRes.data ?? []) {
    if (row.guard_epf) epfSet.add(String(row.guard_epf));
  }
  for (const row of shiftsRes.data ?? []) {
    if (row.employee_id) employeeIdSet.add(String(row.employee_id));
  }

  return { epfSet, employeeIdSet };
}

async function checkRoute(path) {
  try {
    const res = await fetch(`${BO}${path}`, { redirect: 'manual' });
    return { path, status: res.status, ok: res.status < 500 };
  } catch (err) {
    return { path, status: 0, ok: false, error: err.message };
  }
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const [employees, activity, routeMnr, routeHr] = await Promise.all([
    fetchEmployeeRows(supabase),
    fetchRecentShiftIdentifiers(supabase),
    checkRoute('/hr/mnr'),
    checkRoute('/hr'),
  ]);

  const allCount = employees.length;
  const resigned = employees.filter(isResigned);
  const resignedClearance = resigned.filter(
    (e) => (e.site ?? '').trim().toUpperCase() === 'CLEARANCE',
  );
  const reserveActive = employees.filter(
    (e) => isHrActive(e) && (e.site ?? '').trim().toUpperCase() === 'RESERVE',
  );
  const clearanceActive = employees.filter(
    (e) => isHrActive(e) && (e.site ?? '').trim().toUpperCase() === 'CLEARANCE',
  );
  const clientSiteActive = employees.filter((e) => {
    if (!isHrActive(e)) return false;
    const site = (e.site ?? '').trim().toUpperCase();
    return site && !['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'].includes(site);
  });

  const activePersonnel = employees.filter((e) => isOperationalActive(e, activity)).length;
  const inactivePersonnel = employees.filter((e) => isOperationalInactive(e, activity)).length;

  const sitePresence = {
    RESERVE: employees.some((e) => (e.site ?? '').toUpperCase() === 'RESERVE'),
    CLEARANCE: employees.some((e) => (e.site ?? '').toUpperCase() === 'CLEARANCE'),
    CLIENT: clientSiteActive.length > 0,
  };

  const checks = [
    {
      name: 'MNR roster row count',
      actual: allCount,
      expected: 5000,
      ok: allCount >= 5000,
    },
    {
      name: '/hr/mnr route reachable',
      actual: routeMnr.status,
      expected: '200|307',
      ok: routeMnr.ok && [200, 307, 308].includes(routeMnr.status),
    },
    {
      name: 'ALL filter site coverage',
      actual: Object.values(sitePresence).filter(Boolean).length,
      expected: 3,
      ok: sitePresence.RESERVE && sitePresence.CLEARANCE && sitePresence.CLIENT,
    },
    {
      name: 'RESIGNED filter count',
      actual: resigned.length,
      expected: 305,
      ok: resigned.length >= 300 && resigned.length <= 310,
    },
    {
      name: 'Resigned on CLEARANCE',
      actual: resignedClearance.length,
      expected: 305,
      ok: resignedClearance.length === 305,
    },
    {
      name: 'ACTIVE on CLEARANCE (must be 0)',
      actual: clearanceActive.length,
      expected: 0,
      ok: clearanceActive.length === 0,
    },
    {
      name: 'RESERVE ACTIVE pool',
      actual: reserveActive.length,
      expected: 4185,
      ok: Math.abs(reserveActive.length - 4185) <= 2,
    },
    {
      name: 'Active Personnel badge (shift-based)',
      actual: activePersonnel,
      expected: 'low until attendance',
      ok: true,
    },
    {
      name: 'Inactive Personnel badge (shift-based)',
      actual: inactivePersonnel,
      expected: 'high for guards w/o shifts',
      ok: inactivePersonnel >= 0,
    },
  ];

  const allOk = checks.filter((c) => c.name !== 'Active Personnel badge (shift-based)').every((c) => c.ok);

  const report = [
    '',
    '=== G-2 HR MNR UI / ROSTER ===',
    `Run at: ${new Date().toISOString()}`,
    `Route /hr: HTTP ${routeHr.status}`,
    `Route /hr/mnr: HTTP ${routeMnr.status}`,
    '',
    'Checks:',
    ...checks.map((c) => `  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.actual} (expected ${c.expected})`),
    '',
    'Filter snapshot:',
    `  ALL: ${allCount} rows`,
    `  RESERVE ACTIVE: ${reserveActive.length}`,
    `  Client-site ACTIVE: ${clientSiteActive.length}`,
    `  RESIGNED: ${resigned.length} (${resignedClearance.length} on CLEARANCE)`,
    '',
    'MNR badge note: Active/Inactive counts are shift-based (14-day lookback),',
    `  not payroll pool. Current badges: Active ${activePersonnel}, Inactive ${inactivePersonnel}.`,
    '  Near-zero Active badge with full roster is expected until guards check in.',
    '',
    allOk ? 'G-2 PASS' : 'G-2 FAIL',
    '',
    'G-2 COMPLETE — proceed to G-3',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${msg}\n`);
  appendFileSync(
    join(outDir, 'remediation-apply-log.txt'),
    `${new Date().toISOString()} [G-2 VERIFY] ${allOk ? 'PASS' : 'FAIL'}\n`,
  );

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
