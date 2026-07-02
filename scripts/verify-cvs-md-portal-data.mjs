#!/usr/bin/env node
/**
 * MD Portal Step 14 — CVS production data checklist (MD + OD executives).
 *
 * Usage:
 *   npm run verify:cvs-md-portal-data              # audit only (default)
 *   npm run verify:cvs-md-portal-data -- --apply   # deactivate dev operator seed rows
 *
 * Writes: audit-evidence/cvs/md-portal-data-checklist.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/md-portal-data-checklist.json');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CVS_SUPABASE_PROJECT_ID = 'ktfgvcrdfbapmefktgjc';

const applyMode = process.argv.includes('--apply');

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

function isDevOperatorRow(emp) {
  const empNo = String(emp.emp_number ?? '').toUpperCase();
  const name = String(emp.full_name ?? '').toUpperCase();
  return (
    empNo.includes('OD-DEV') ||
    empNo === 'OD-DEV-001' ||
    name.includes('DEV OPERATIONS') ||
    name.includes('OPERATIONS DEVELOP')
  );
}

function looksLikeRealWorkEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes('@')) return false;
  if (trimmed.endsWith('@portal.pearzen.local')) return false;
  if (trimmed.endsWith('@pearzen.local')) return false;
  return true;
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const blocking = [];
  const warnings = [];
  const applied = [];

  console.log(`\nCVS MD Portal data checklist — ${applyMode ? 'APPLY' : 'audit only'}\n`);

  const { data: allExecutives, error: execErr } = await supabase
    .from('employees')
    .select('id, emp_number, full_name, rank, status, email, company_id')
    .in('rank', ['MD', 'OD'])
    .order('rank')
    .order('emp_number');

  if (execErr) throw new Error(execErr.message);

  let devRows = (allExecutives ?? []).filter(
    (row) => row.status === 'ACTIVE' && isDevOperatorRow(row),
  );

  if (devRows.length > 0) {
    if (applyMode) {
      for (const row of devRows) {
        const { error } = await supabase
          .from('employees')
          .update({ status: 'INACTIVE' })
          .eq('id', row.id);
        if (error) {
          blocking.push(`Failed to deactivate ${row.emp_number}: ${error.message}`);
        } else {
          applied.push(`Deactivated dev operator ${row.emp_number} (${row.id})`);
        }
      }

      const { data: refreshed, error: refreshErr } = await supabase
        .from('employees')
        .select('id, emp_number, full_name, rank, status, email, company_id')
        .in('rank', ['MD', 'OD'])
        .order('rank')
        .order('emp_number');
      if (refreshErr) throw new Error(refreshErr.message);
      devRows = (refreshed ?? []).filter(
        (row) => row.status === 'ACTIVE' && isDevOperatorRow(row),
      );
    }

    if (devRows.length > 0) {
      blocking.push(
        `Active dev operator executive row(s) found: ${devRows.map((r) => `${r.emp_number} (${r.full_name})`).join(', ')}`,
      );
      if (!applyMode) {
        console.error('\nRe-run with --apply to deactivate dev operator seed rows.');
      }
    } else if (applied.length > 0) {
      console.log('  ✓ Dev operator seed row(s) deactivated');
    }
  } else {
    console.log('  ✓ No active dev operator rows (OD-DEV / OPERATIONS DEVELOPER)');
  }

  const cvsExecutives = (allExecutives ?? []).filter(
    (row) => row.company_id === CVS_COMPANY_ID && row.status === 'ACTIVE',
  );
  const cvsMd = cvsExecutives.filter((row) => row.rank === 'MD');
  const cvsOd = cvsExecutives.filter((row) => row.rank === 'OD');

  if (cvsMd.length !== 1) {
    blocking.push(
      `CVS must have exactly one ACTIVE MD; found ${cvsMd.length}: ${cvsMd.map((r) => r.emp_number).join(', ') || 'none'}`,
    );
  }
  if (cvsOd.length !== 1) {
    blocking.push(
      `CVS must have exactly one ACTIVE OD; found ${cvsOd.length}: ${cvsOd.map((r) => r.emp_number).join(', ') || 'none'}`,
    );
  }

  const executiveIds = cvsExecutives.map((row) => row.id);
  const { data: portalRows, error: portalErr } = await supabase
    .from('head_office_portal_auth')
    .select(
      'employee_id, work_email, portal_auth_email, login_username, needs_pin_setup, two_factor_enabled, is_active, otp_expires_at, unlock_code_hash, pin_hash, created_at, updated_at',
    )
    .in('employee_id', executiveIds.length ? executiveIds : ['00000000-0000-0000-0000-000000000000']);

  if (portalErr) throw new Error(portalErr.message);

  const portalByEmployee = new Map(
    (portalRows ?? []).map((row) => [row.employee_id, row]),
  );

  const checklist = [];

  for (const exec of cvsExecutives) {
    const portal = portalByEmployee.get(exec.id) ?? null;
    const entry = {
      role: exec.rank,
      employeeId: exec.id,
      empNumber: exec.emp_number,
      fullName: exec.full_name,
      employeeEmail: exec.email,
      workEmail: portal?.work_email ?? null,
      portalAuthEmail: portal?.portal_auth_email ?? null,
      loginUsername: portal?.login_username ?? null,
      provisioned: Boolean(portal?.is_active),
      provisionedAt: portal?.created_at ?? null,
      needsPinSetup: portal?.needs_pin_setup ?? null,
      twoFactorEnabled: portal?.two_factor_enabled ?? null,
      hasUnlockCode: Boolean(portal?.unlock_code_hash),
      hasPin: Boolean(portal?.pin_hash),
      checks: [],
    };

    if (!portal || !portal.is_active) {
      warnings.push(
        `${exec.rank} (${exec.full_name}) has no active head_office_portal_auth row — MD must provision from Security & Access`,
      );
      entry.checks.push('portal_auth_missing');
    } else {
      if (!looksLikeRealWorkEmail(portal.work_email)) {
        blocking.push(
          `${exec.rank} work_email must be a real inbox for Resend (got ${portal.work_email ?? 'null'})`,
        );
        entry.checks.push('work_email_invalid');
      } else {
        entry.checks.push('work_email_ok');
      }

      if (!portal.login_username || !portal.portal_auth_email) {
        warnings.push(
          `${exec.rank} login_username / portal_auth_email not backfilled (NIC synthetic login may still work)`,
        );
        entry.checks.push('login_username_warn');
      } else {
        entry.checks.push('login_username_ok');
      }

      if (portal.needs_pin_setup) {
        warnings.push(`${exec.rank} still needs PIN setup (needs_pin_setup=true)`);
        entry.checks.push('needs_pin_setup');
      }

      if (!portal.two_factor_enabled) {
        warnings.push(`${exec.rank} two_factor_enabled=false — bootstrap incomplete`);
        entry.checks.push('two_factor_pending');
      } else {
        entry.checks.push('two_factor_ok');
      }

      if (!portal.unlock_code_hash) {
        warnings.push(
          `${exec.rank} unlock_code_hash missing — complete /login/set-unlock-code after 2FA`,
        );
        entry.checks.push('unlock_code_pending');
      } else {
        entry.checks.push('unlock_code_ok');
      }
    }

    checklist.push(entry);
    console.log(
      `  ${exec.rank} ${exec.emp_number} ${exec.full_name}`,
    );
    console.log(
      `    portal: ${entry.provisioned ? entry.workEmail : 'NOT PROVISIONED'}`,
    );
  }

  const report = {
    capturedAt: new Date().toISOString(),
    step: 'MD_PORTAL_IMPLEMENTATION_STEPS — Step 14',
    supabaseProjectId: CVS_SUPABASE_PROJECT_ID,
    cvsCompanyId: CVS_COMPANY_ID,
    mode: applyMode ? 'apply' : 'audit',
    checklist,
    devOperatorRows: devRows.map((row) => ({
      id: row.id,
      empNumber: row.emp_number,
      fullName: row.full_name,
      companyId: row.company_id,
    })),
    applied,
    blocking,
    warnings,
    signedOff: blocking.length === 0 && warnings.length === 0,
    operatorFollowUps: [],
  };

  if (checklist.find((row) => row.role === 'OD' && !row.provisioned)) {
    report.operatorFollowUps.push(
      'Set VS PERERA (OD) work email on MNR, then MD provisions OTP from Executive → Security & Access.',
    );
  }
  if (checklist.find((row) => row.role === 'MD' && row.checks.includes('unlock_code_pending'))) {
    report.operatorFollowUps.push(
      'MD (AKSD) completes /login/set-unlock-code after next successful 2FA sign-in.',
    );
  }

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nEvidence: ${EVIDENCE_PATH}`);

  if (blocking.length) {
    console.error('\nBlocking issues:');
    for (const msg of blocking) console.error(`  ✗ ${msg}`);
    process.exit(1);
  }

  if (warnings.length) {
    console.log('\nOperator follow-ups (non-blocking):');
    for (const msg of warnings) console.log(`  ⚠ ${msg}`);
  }

  console.log('\n✓ CVS MD Portal production data checklist complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
