#!/usr/bin/env node
/**
 * CVS fresh client handover — read-only audit, snapshot, and gate checks.
 *
 * Usage:
 *   node scripts/audit-cvs-fresh-handover.mjs              # R-1 preflight
 *   node scripts/audit-cvs-fresh-handover.mjs --snapshot   # R-2 preserve export
 *   node scripts/audit-cvs-fresh-handover.mjs --gate     # R-11 / R-19 post-reset gate
 *   node scripts/audit-cvs-fresh-handover.mjs --live-smoke # R-18 HTTP smoke
 */

import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/migration/classic-venture/fresh-handover');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CVS_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';

const PRESERVE = {
  MD: {
    id: '59957583-deb6-4492-931d-b313c9b04a99',
    emp_number: '10000',
    portal_work_email: 'susil@classicventure.com',
  },
  OD: {
    id: '47ea02d0-6b05-41f3-8be4-060dd706e580',
    emp_number: '13400',
    portal_work_email: 'zenshupea@gmail.com',
  },
};

const LIVE_SMOKE_HOSTS = [
  { id: 'cvsexec', host: 'cvsexec.pearzen.tech', path: '/login/md' },
  { id: 'cvshq', host: 'cvshq.pearzen.tech', path: '/login/hq' },
  { id: 'cvsom', host: 'cvsom.pearzen.tech', path: '/login/om' },
  { id: 'cvstm', host: 'cvstm.pearzen.tech', path: '/login/tm' },
  { id: 'cafe-front', host: 'cvshq.pearzen.tech', path: '/login/cafe-front' },
  { id: 'cvssm', host: 'cvssm.pearzen.tech', path: '/login' },
  { id: 'cv-field', host: 'cv.pearzen.tech', path: '/login' },
  { id: 'tasha', host: 'tasha.lk', path: '/' },
];

const args = new Set(process.argv.slice(2));
const snapshotMode = args.has('--snapshot');
const gateMode = args.has('--gate');
const liveSmokeMode = args.has('--live-smoke');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

async function countTable(db, table, filterFn) {
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (filterFn) q = filterFn(q);
  const { count, error } = await q;
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function probeTable(db, table) {
  const { error } = await db.from(table).select('*', { count: 'exact', head: true }).limit(1);
  return !error;
}

function writeOut(filename, lines) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, filename);
  writeFileSync(path, `${lines.join('\n')}\n`);
  return path;
}

async function collectCounts(db) {
  const counts = {
    employees: await countTable(db, 'employees', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    site_profiles: await countTable(db, 'site_profiles', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    head_office_portal_auth: await countTable(db, 'head_office_portal_auth'),
    sm_portal_auth: await countTable(db, 'sm_portal_auth'),
    cafe_portal_auth: await countTable(db, 'cafe_portal_auth'),
    shalom_portal_auth: (await probeTable(db, 'shalom_portal_auth'))
      ? await countTable(db, 'shalom_portal_auth')
      : null,
    sm_guard_assignments: await countTable(db, 'sm_guard_assignments'),
    sm_guard_attendance: await countTable(db, 'sm_guard_attendance'),
    attendance_logs: await countTable(db, 'attendance_logs', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    payroll_runs: await countTable(db, 'payroll_runs', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    time_shifts: await countTable(db, 'time_shifts', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    time_rosters: await countTable(db, 'time_rosters', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    sm_visit_logs: await countTable(db, 'sm_visit_logs', (q) => q.eq('company_id', CVS_COMPANY_ID)),
    sm_incident_reports: await countTable(db, 'sm_incident_reports', (q) => q.eq('company_id', CVS_COMPANY_ID)),
  };
  return counts;
}

async function fetchExecutives(db) {
  const { data, error } = await db
    .from('employees')
    .select('id, emp_number, rank, full_name, status, email')
    .eq('company_id', CVS_COMPANY_ID)
    .in('rank', ['MD', 'OD'])
    .order('rank');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchPortalAuth(db, employeeIds) {
  const ids = employeeIds.length ? employeeIds : ['00000000-0000-0000-0000-000000000000'];
  const { data, error } = await db
    .from('head_office_portal_auth')
    .select('employee_id, work_email, is_active, needs_pin_setup, two_factor_enabled')
    .in('employee_id', ids);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function checkPreserveList(executives, blocking) {
  const md = executives.filter((r) => r.rank === 'MD' && r.status === 'ACTIVE');
  const od = executives.filter((r) => r.rank === 'OD' && r.status === 'ACTIVE');

  if (md.length !== 1) {
    blocking.push(`Expected exactly 1 ACTIVE MD, found ${md.length}`);
  } else if (md[0].id !== PRESERVE.MD.id || md[0].emp_number !== PRESERVE.MD.emp_number) {
    blocking.push(
      `MD id/EPF mismatch — got ${md[0].id}/${md[0].emp_number}, expected ${PRESERVE.MD.id}/${PRESERVE.MD.emp_number}`,
    );
  }

  if (od.length !== 1) {
    blocking.push(`Expected exactly 1 ACTIVE OD, found ${od.length}`);
  } else if (od[0].id !== PRESERVE.OD.id || od[0].emp_number !== PRESERVE.OD.emp_number) {
    blocking.push(
      `OD id/EPF mismatch — got ${od[0].id}/${od[0].emp_number}, expected ${PRESERVE.OD.id}/${PRESERVE.OD.emp_number}`,
    );
  }

  return { md: md[0] ?? null, od: od[0] ?? null };
}

function checkPortalAuth(portalRows, executives, blocking, warnings, gateMode) {
  const execIds = new Set(executives.map((e) => e.id));
  const preserveIds = new Set([PRESERVE.MD.id, PRESERVE.OD.id]);

  const mdPortal = portalRows.find(
    (r) => String(r.work_email ?? '').trim().toLowerCase() === PRESERVE.MD.portal_work_email,
  );
  const odPortal = portalRows.find(
    (r) => String(r.work_email ?? '').trim().toLowerCase() === PRESERVE.OD.portal_work_email,
  );

  if (!mdPortal?.is_active) {
    blocking.push(`MD portal auth missing/inactive for ${PRESERVE.MD.portal_work_email}`);
  } else if (mdPortal.employee_id !== PRESERVE.MD.id) {
    warnings.push(
      `MD portal auth on employee ${mdPortal.employee_id} (not MD id ${PRESERVE.MD.id}) — relink in R-7 before R-8`,
    );
  }

  if (!odPortal?.is_active) {
    blocking.push(`OD portal auth missing/inactive for ${PRESERVE.OD.portal_work_email}`);
  } else if (odPortal.employee_id !== PRESERVE.OD.id) {
    blocking.push(`OD portal auth employee_id mismatch: ${odPortal.employee_id}`);
  }

  if (gateMode) {
    if (portalRows.length !== 2) {
      blocking.push(`Post-reset head_office_portal_auth must be 2, found ${portalRows.length}`);
    }
    for (const row of portalRows) {
      if (!preserveIds.has(row.employee_id)) {
        blocking.push(`Unexpected portal auth employee_id ${row.employee_id}`);
      }
      if (!row.is_active) {
        blocking.push(`Portal auth inactive for ${row.employee_id}`);
      }
    }
    return;
  }

  if (portalRows.length < 2) {
    blocking.push(`Pre-reset head_office_portal_auth expected ≥2, found ${portalRows.length}`);
  }

  const extraPortal = portalRows.filter(
    (r) =>
      String(r.work_email ?? '').trim().toLowerCase() !== PRESERVE.MD.portal_work_email &&
      String(r.work_email ?? '').trim().toLowerCase() !== PRESERVE.OD.portal_work_email,
  );
  if (extraPortal.length) {
    warnings.push(`${extraPortal.length} extra head_office_portal_auth row(s) will be removed in R-7`);
  }

  for (const row of extraPortal) {
    if (execIds.has(row.employee_id)) {
      /* linked to MD/OD rank — fine */
    }
  }
}

function checkPreflightCounts(counts, blocking) {
  const toDelete = counts.employees - 2;
  if (toDelete < 1) {
    blocking.push(`Nothing to delete — employees count ${counts.employees}`);
  }
  if (counts.site_profiles < 1 && !gateMode) {
    blocking.push(`Expected sites to delete, site_profiles=${counts.site_profiles}`);
  }
}

function checkGateCounts(counts, blocking) {
  const expected = {
    employees: 2,
    site_profiles: 0,
    sm_portal_auth: 0,
    cafe_portal_auth: 0,
    sm_guard_assignments: 0,
    sm_guard_attendance: 0,
    attendance_logs: 0,
    payroll_runs: 0,
    time_shifts: 0,
    time_rosters: 0,
  };

  for (const [key, want] of Object.entries(expected)) {
    if (counts[key] !== want) {
      blocking.push(`Gate FAIL ${key}: expected ${want}, got ${counts[key]}`);
    }
  }

  if (counts.shalom_portal_auth != null && counts.shalom_portal_auth !== 0) {
    blocking.push(`Gate FAIL shalom_portal_auth: expected 0, got ${counts.shalom_portal_auth}`);
  }
}

async function runSnapshot(db) {
  const preserveIds = [PRESERVE.MD.id, PRESERVE.OD.id];
  const portalEmails = [PRESERVE.MD.portal_work_email, PRESERVE.OD.portal_work_email];

  const { data: employees, error: empErr } = await db
    .from('employees')
    .select('*')
    .in('id', preserveIds);
  if (empErr) throw new Error(empErr.message);

  const { data: allPortal, error: portalErr } = await db
    .from('head_office_portal_auth')
    .select('*');
  if (portalErr) throw new Error(portalErr.message);

  const portalAuth = (allPortal ?? []).filter((row) =>
    portalEmails.includes(String(row.work_email ?? '').trim().toLowerCase()),
  );

  const { data: mdSettings, error: mdErr } = await db
    .from('md_settings')
    .select('*')
    .eq('company_id', CVS_COMPANY_ID)
    .maybeSingle();
  if (mdErr) throw new Error(mdErr.message);

  const snapshot = {
    capturedAt: new Date().toISOString(),
    companyId: CVS_COMPANY_ID,
    employees: employees ?? [],
    head_office_portal_auth: portalAuth,
    md_settings: mdSettings,
    md_settings_hash: hashJson(mdSettings),
    notes: {
      md_portal_relink_required:
        portalAuth.find((r) => String(r.work_email).toLowerCase() === PRESERVE.MD.portal_work_email)
          ?.employee_id !== PRESERVE.MD.id,
    },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const snapPath = join(OUT_DIR, 'r-2-preserve-snapshot.json');
  writeFileSync(snapPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  let backupRef = 'No backup dump verified at R-0 — see r-0-operator-gate.txt WARN';
  try {
    backupRef = readFileSync(join(OUT_DIR, 'r-0-operator-gate.txt'), 'utf8').trim();
  } catch {
    /* optional */
  }
  writeOut('r-2-backup-reference.txt', [
    'R-2 backup reference',
    `Date: ${new Date().toISOString()}`,
    '',
    backupRef,
  ]);

  const blocking = [];
  if ((employees ?? []).length !== 2) blocking.push(`Snapshot employees: ${employees?.length ?? 0} (want 2)`);
  if (portalAuth.length !== 2) blocking.push(`Snapshot portal auth: ${portalAuth.length} (want 2)`);
  if (!mdSettings) blocking.push('md_settings row missing for CVS');

  console.log(`\nSnapshot: ${snapPath}`);
  console.log(`  employees: ${employees?.length ?? 0}`);
  console.log(`  portal auth: ${portalAuth.length}`);
  if (snapshot.notes.md_portal_relink_required) {
    console.log('  ⚠ MD portal auth needs relink to MD employee_id in R-7');
  }
  console.log(`  md_settings hash: ${snapshot.md_settings_hash}`);

  if (blocking.length) {
    console.error('\n✗ Snapshot gate FAIL');
    for (const b of blocking) console.error(`  · ${b}`);
    process.exit(1);
  }

  console.log('\n✓ Snapshot gate PASS');
}

async function runLiveSmoke() {
  const results = [];
  const blocking = [];

  for (const host of LIVE_SMOKE_HOSTS) {
    const url = `https://${host.host}${host.path}`;
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'cvs-fresh-handover-smoke/1.0' },
        signal: AbortSignal.timeout(25_000),
      });
      const ok = res.status >= 200 && res.status < 400;
      results.push({ ...host, url, status: res.status, ok });
      if (!ok) blocking.push(`${host.host}${host.path} → ${res.status}`);
    } catch (err) {
      results.push({ ...host, url, status: 0, ok: false, error: String(err.message || err) });
      blocking.push(`${host.host}${host.path} → ${err.message || err}`);
    }
  }

  const evidencePath = join(ROOT, 'audit-evidence/cvs/fresh-handover-r18-live-smoke.json');
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    `${JSON.stringify({ runAt: new Date().toISOString(), results, status: blocking.length ? 'FAIL' : 'PASS' }, null, 2)}\n`,
  );

  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.host}${r.path} → ${r.status || r.error}`);
  }

  if (blocking.length) {
    console.error(`\n✗ Live smoke FAIL (${blocking.length})`);
    process.exit(1);
  }

  console.log(`\n✓ Live smoke PASS — ${evidencePath.replace(`${ROOT}/`, '')}`);
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const host = new URL(supabaseUrl).hostname;
  const isProd = host.includes(CVS_PROJECT_REF);
  const db = createClient(supabaseUrl, serviceKey);

  if (liveSmokeMode) {
    console.log('\nCVS fresh handover — live HTTP smoke\n');
    await runLiveSmoke();
    return;
  }

  if (snapshotMode) {
    console.log('\nCVS fresh handover — preserve snapshot (R-2)\n');
    if (!isProd) {
      console.error(`Refusing snapshot on non-production host: ${host}`);
      process.exit(1);
    }
    await runSnapshot(db);
    return;
  }

  const modeLabel = gateMode ? 'post-reset gate' : 'pre-flight audit';
  console.log(`\nCVS fresh handover — ${modeLabel}\n`);

  const blocking = [];
  const warnings = [];

  if (!isProd) {
    blocking.push(`Not production CVS Supabase — host is ${host}`);
  } else {
    console.log(`  ✓ Production target: ${host}`);
  }

  const executives = await fetchExecutives(db);
  const { md, od } = checkPreserveList(executives, blocking);

  const allPortal = await db.from('head_office_portal_auth').select('employee_id, work_email, is_active, needs_pin_setup, two_factor_enabled');
  if (allPortal.error) throw new Error(allPortal.error.message);
  const portalRows = allPortal.data ?? [];

  if (gateMode) {
    const execPortal = portalRows.filter((r) => r.employee_id === PRESERVE.MD.id || r.employee_id === PRESERVE.OD.id);
    checkPortalAuth(execPortal, executives, blocking, warnings, true);
  } else {
    checkPortalAuth(portalRows, executives, blocking, warnings, false);
  }

  const counts = await collectCounts(db);

  if (gateMode) {
    checkGateCounts(counts, blocking);

    try {
      const snap = JSON.parse(readFileSync(join(OUT_DIR, 'r-2-preserve-snapshot.json'), 'utf8'));
      const { data: mdSettings } = await db
        .from('md_settings')
        .select('*')
        .eq('company_id', CVS_COMPANY_ID)
        .maybeSingle();
      const currentHash = hashJson(mdSettings);
      if (snap.md_settings_hash !== currentHash) {
        blocking.push(`md_settings changed since R-2 snapshot (${snap.md_settings_hash} → ${currentHash})`);
      } else {
        console.log(`  ✓ md_settings hash unchanged (${currentHash})`);
      }
    } catch {
      warnings.push('No R-2 snapshot — skipping md_settings hash compare');
    }
  } else {
    checkPreflightCounts(counts, blocking);
    if (counts.head_office_portal_auth > 2) {
      warnings.push(`${counts.head_office_portal_auth - 2} non-MD/OD head_office_portal_auth rows will be removed in R-7`);
    }
  }

  const lines = [
    `CVS fresh handover — ${modeLabel}`,
    `Date: ${new Date().toISOString()}`,
    `Host: ${host}`,
    `Mode: ${gateMode ? 'gate' : 'preflight'}`,
    '',
    'Preserve list:',
    `  MD ${PRESERVE.MD.emp_number} ${PRESERVE.MD.id} ${md?.full_name ?? 'MISSING'}`,
    `  OD ${PRESERVE.OD.emp_number} ${PRESERVE.OD.id} ${od?.full_name ?? 'MISSING'}`,
    '',
    'Counts:',
  ];

  for (const [k, v] of Object.entries(counts)) {
    lines.push(`  ${k}: ${v ?? 'n/a'}`);
  }

  if (!gateMode) {
    lines.push('', `Employees to delete: ${counts.employees - 2}`);
    lines.push(`Sites to delete: ${counts.site_profiles}`);
  }

  lines.push('', 'Portal auth (all head_office_portal_auth):');
  for (const row of portalRows) {
    const exec = executives.find((e) => e.id === row.employee_id);
    lines.push(
      `  ${row.employee_id} ${exec?.rank ?? '?'} ${row.work_email ?? ''} active=${row.is_active}`,
    );
  }

  if (warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of warnings) lines.push(`  · ${w}`);
  }

  lines.push('', `GATE: ${blocking.length ? 'FAIL' : 'PASS'}`);
  if (blocking.length) {
    lines.push('', 'Blocking:');
    for (const b of blocking) lines.push(`  · ${b}`);
  }

  const outFile = gateMode ? 'r-11-postflight-gate.txt' : 'r-1-preflight-audit.txt';
  const outPath = writeOut(outFile, lines);

  if (gateMode) {
    const jsonPath = join(ROOT, 'audit-evidence/cvs/fresh-handover-gate.json');
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(
      jsonPath,
      `${JSON.stringify({ runAt: new Date().toISOString(), counts, blocking, warnings, status: blocking.length ? 'FAIL' : 'PASS' }, null, 2)}\n`,
    );
  }

  console.log(`  employees: ${counts.employees} · sites: ${counts.site_profiles}`);
  if (!gateMode) console.log(`  to delete: ${counts.employees - 2} employees, ${counts.site_profiles} sites`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const b of blocking) console.log(`  ✗ ${b}`);

  console.log(`\nEvidence: ${outPath.replace(`${ROOT}/`, '')}`);

  if (blocking.length) {
    console.error('\n✗ Gate FAIL');
    process.exit(1);
  }

  console.log('\n✓ Gate PASS');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
