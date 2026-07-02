#!/usr/bin/env node
/**
 * Bootstrap CVS OD portal for zenshupea@gmail.com (VS PERERA slot).
 *
 * Usage:
 *   npm run provision:cvs-od-zenshupea
 *   npm run provision:cvs-od-zenshupea -- --force-bootstrap
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '../apps/back-office/lib/encryption.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CVS_OD_EPF = '13400';
const DEV_OPERATOR_EMPLOYEE_ID = '2023d4d6-0a60-4f7b-8729-bd9358ee2b79';
const WORK_EMAIL = 'zenshupea@gmail.com';
const DEFAULT_RECOVERY_EMAIL = 'shauvvvv@gmail.com';
const PORTAL_AUTH_EMAIL_DOMAIN = 'portal.pearzen.local';
const OTP_LIFETIME_MS = 5 * 60 * 1000;

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

function normalizeNic(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

function portalAuthEmailFromUsername(username) {
  const norm = normalizeNic(username);
  if (!norm) return '';
  return `${norm}@${PORTAL_AUTH_EMAIL_DOMAIN}`.toLowerCase();
}

function decryptNic(stored) {
  return decrypt(String(stored ?? ''));
}

function resolveLoginUsername(nicRaw, epf) {
  const fromNic = normalizeNic(decryptNic(nicRaw));
  if (fromNic) return fromNic;
  return String(epf).trim();
}

function generateOtp() {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function parseArgs(argv) {
  const idx = argv.indexOf('--recovery');
  const recovery =
    idx >= 0 && argv[idx + 1] ? argv[idx + 1].trim().toLowerCase() : DEFAULT_RECOVERY_EMAIL;
  const forceBootstrap = argv.includes('--force-bootstrap');
  return { recovery, forceBootstrap };
}

async function findAuthUserIdByEmail(admin, email) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = data?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return found?.id ?? null;
}

async function syncPortalAuthPassword(admin, portalAuthEmail, password, employeeId, fullName) {
  const userMetadata = {
    employee_id: employeeId,
    ...(fullName ? { full_name: fullName } : {}),
  };
  const appMetadata = { company_id: CVS_COMPANY_ID };
  const existingId = await findAuthUserIdByEmail(admin, portalAuthEmail);

  if (existingId) {
    const { data: existingUser } = await admin.auth.admin.getUserById(existingId);
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      user_metadata: { ...(existingUser.user?.user_metadata ?? {}), ...userMetadata },
      app_metadata: { ...(existingUser.user?.app_metadata ?? {}), ...appMetadata },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await admin.auth.admin.createUser({
    email: portalAuthEmail,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function sendOtpEmail({ to, otp, staffName }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { emailed: false };

  const from =
    process.env.PORTAL_OTP_EMAIL_FROM?.trim() ||
    process.env.PORTAL_EMAIL_FROM?.trim() ||
    'Classic Venture Security <support@pearzen.tech>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'MD Portal access code',
      text: [
        `Hello ${staffName},`,
        '',
        `Your MD Portal access code is: ${otp}`,
        '',
        'This code expires in 5 minutes.',
        'Sign in at /login/md with your work email and this code.',
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return { emailed: false, error: detail || `HTTP ${response.status}` };
  }

  return { emailed: true };
}

async function main() {
  loadEnv();

  const { recovery: recoveryEmail, forceBootstrap } = parseArgs(process.argv.slice(2));
  if (recoveryEmail === WORK_EMAIL) {
    console.error('Recovery email must differ from work email.');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\nCVS OD bootstrap — zenshupea@gmail.com\n');

  await admin
    .from('employees')
    .update({ status: 'INACTIVE', email: null })
    .eq('id', DEV_OPERATOR_EMPLOYEE_ID);
  console.log('  ✓ Cleared duplicate dev-operator row');

  const { data: odLookup, error: lookupErr } = await admin
    .from('employees')
    .select('id')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('emp_number', CVS_OD_EPF)
    .maybeSingle();

  if (lookupErr || !odLookup?.id) {
    console.error('CVS OD employee not found for EPF', CVS_OD_EPF, lookupErr?.message);
    process.exit(1);
  }

  const CVS_OD_EMPLOYEE_ID = odLookup.id;

  const { data: odEmployee, error: odErr } = await admin
    .from('employees')
    .update({
      email: WORK_EMAIL,
      status: 'ACTIVE',
      company_id: CVS_COMPANY_ID,
      rank: 'OD',
      group: 'HEAD_OFFICE',
    })
    .eq('id', CVS_OD_EMPLOYEE_ID)
    .select('id, full_name, email, rank, status, company_id, nic')
    .single();

  if (odErr || !odEmployee) {
    console.error('Failed to update CVS OD employee:', odErr?.message ?? 'not found');
    process.exit(1);
  }

  console.log(`  ✓ OD employee ready: ${odEmployee.full_name} (${odEmployee.email})`);

  if (!odEmployee.nic) {
    console.error('OD employee has no NIC on MNR.');
    process.exit(1);
  }

  const loginUsername = resolveLoginUsername(odEmployee.nic, CVS_OD_EPF);
  if (!loginUsername) {
    console.error('Could not resolve portal login username.');
    process.exit(1);
  }

  const portalAuthEmail = portalAuthEmailFromUsername(loginUsername);
  const { data: existingAuth } = await admin
    .from('head_office_portal_auth')
    .select(
      'pin_hash, unlock_code_hash, totp_secret, two_factor_enabled, totp_backup_code_hashes, needs_pin_setup, recovery_email',
    )
    .eq('employee_id', CVS_OD_EMPLOYEE_ID)
    .maybeSingle();

  const hasCompletedSetup =
    Boolean(existingAuth?.pin_hash) &&
    Boolean(existingAuth?.two_factor_enabled) &&
    !existingAuth?.needs_pin_setup;

  if (hasCompletedSetup && !forceBootstrap) {
    const { error: linkErr } = await admin.from('head_office_portal_auth').upsert(
      {
        employee_id: CVS_OD_EMPLOYEE_ID,
        work_email: WORK_EMAIL,
        login_username: loginUsername,
        portal_auth_email: portalAuthEmail,
        recovery_email: existingAuth.recovery_email || recoveryEmail,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id' },
    );
    if (linkErr) {
      console.error('link-only upsert failed:', linkErr.message);
      process.exit(1);
    }
    console.log(`  ✓ Linked work email only — password + 2FA preserved`);
    console.log(`    Sign in at /login/md with ${WORK_EMAIL} + existing password`);
    console.log('  (Use --force-bootstrap only to wipe password/2FA and re-issue OTP)\n');
    return;
  }

  const otp = generateOtp();
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_LIFETIME_MS).toISOString();

  const authSync = await syncPortalAuthPassword(
    admin,
    portalAuthEmail,
    otp,
    CVS_OD_EMPLOYEE_ID,
    odEmployee.full_name,
  );
  if (!authSync.ok) {
    console.error('Supabase auth sync failed:', authSync.error);
    process.exit(1);
  }

  const { error: upsertErr } = await admin.from('head_office_portal_auth').upsert(
    {
      employee_id: CVS_OD_EMPLOYEE_ID,
      work_email: WORK_EMAIL,
      login_username: loginUsername,
      portal_auth_email: portalAuthEmail,
      recovery_email: recoveryEmail,
      current_otp: otp,
      otp_expires_at: otpExpiresAt,
      pin_hash: null,
      unlock_code_hash: null,
      totp_secret: null,
      two_factor_enabled: false,
      totp_backup_code_hashes: [],
      needs_pin_setup: true,
      is_active: true,
      failed_password_attempts: 0,
      failed_2fa_attempts: 0,
      is_username_locked: false,
      locked_until: null,
      last_otp_provisioned_at: now.toISOString(),
      last_otp_provisioned_by_employee_id: null,
      last_otp_provisioned_by_name: 'Bootstrap script',
      updated_at: now.toISOString(),
    },
    { onConflict: 'employee_id' },
  );

  if (upsertErr) {
    console.error('head_office_portal_auth upsert failed:', upsertErr.message);
    process.exit(1);
  }

  console.log(`  ✓ Portal auth provisioned (${loginUsername} → ${portalAuthEmail})`);
  console.log(`    recovery email: ${recoveryEmail}`);

  const mail = await sendOtpEmail({
    to: WORK_EMAIL,
    otp,
    staffName: odEmployee.full_name ?? 'OD',
  });

  if (mail.emailed) {
    console.log(`  ✓ OTP emailed to ${WORK_EMAIL}`);
  } else {
    console.log('\n  ┌─────────────────────────────────────────────┐');
    console.log(`  │ OTP (5 min):  ${otp}                         │`.slice(0, 48) + '│');
    console.log('  │ Sign in at /login/md with work email + code  │');
    console.log('  └─────────────────────────────────────────────┘');
    if (mail.error) console.warn(`  email error: ${mail.error}`);
    else console.log('  (RESEND_API_KEY not set — OTP shown above only)\n');
  }

  console.log('Next: /login/md → code → set password → setup 2FA → /executive\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
