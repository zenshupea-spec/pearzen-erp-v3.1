/**
 * Provision CVS Head Office HR + OM test employees and portal OTP auth for geofence E2E.
 *
 * Run: npm run provision:cvs-ho-geofence-test
 */

import { randomInt } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

import { encrypt } from '../apps/back-office/lib/encryption.js';

const CLASSIC_VENTURE_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const PORTAL_AUTH_EMAIL_DOMAIN = 'portal.pearzen.local';
const HO_PORTAL_OTP_LIFETIME_MS = 10 * 60 * 1000;

const TEST_ACCOUNTS = [
  {
    emp_number: 'HR-GEOTEST-001',
    full_name: 'CVS HR GEOFENCE TEST',
    rank: 'HR',
    nic: '987654321V',
    email: 'hr.geofence.test@classicventure.com',
  },
  {
    emp_number: 'OM-GEOTEST-001',
    full_name: 'CVS OM GEOFENCE TEST',
    rank: 'OM',
    nic: '987654322V',
    email: 'om.geofence.test@classicventure.com',
  },
];

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
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

function generateHeadOfficeOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function findAuthUserIdByEmail(admin, email) {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => (user.email ?? '').toLowerCase() === normalized);
    if (found) return found.id;
    if (data.users.length < 1000) break;
    page += 1;
  }
  return null;
}

async function syncPortalAuthPassword(admin, portalAuthEmail, password, employeeId, fullName) {
  const { data: emp } = await admin
    .from('employees')
    .select('company_id')
    .eq('id', employeeId)
    .maybeSingle();

  const appMetadata =
    emp?.company_id != null
      ? { company_id: String(emp.company_id), tenant_company_id: String(emp.company_id) }
      : {};

  const existingId = await findAuthUserIdByEmail(admin, portalAuthEmail);
  if (existingId) {
    const { data: existingUser } = await admin.auth.admin.getUserById(existingId);
    const { error } = await admin.auth.admin.updateUserById(existingId, {
      password,
      email_confirm: true,
      user_metadata: { employee_id: employeeId, full_name: fullName },
      app_metadata: { ...(existingUser.user?.app_metadata ?? {}), ...appMetadata },
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email: portalAuthEmail,
    password,
    email_confirm: true,
    user_metadata: { employee_id: employeeId, full_name: fullName },
    app_metadata: appMetadata,
  });
  if (error) throw new Error(error.message);
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`Provisioning CVS HO geofence test accounts (${CLASSIC_VENTURE_COMPANY_ID})`);

for (const account of TEST_ACCOUNTS) {
  const loginUsername = normalizeNic(account.nic);
  const portalAuthEmail = portalAuthEmailFromUsername(loginUsername);
  const encryptedNic = encrypt(account.nic);

  const { data: existing } = await admin
    .from('employees')
    .select('id')
    .eq('emp_number', account.emp_number)
    .eq('company_id', CLASSIC_VENTURE_COMPANY_ID)
    .maybeSingle();

  let employeeId = existing?.id ?? null;

  const employeePayload = {
    emp_number: account.emp_number,
    full_name: account.full_name,
    rank: account.rank,
    status: 'ACTIVE',
    company_id: CLASSIC_VENTURE_COMPANY_ID,
    email: account.email,
    nic: encryptedNic,
  };

  if (employeeId) {
    const { error } = await admin
      .from('employees')
      .update(employeePayload)
      .eq('id', employeeId);
    if (error) {
      console.error(`  ✗ ${account.emp_number} employee update:`, error.message);
      continue;
    }
  } else {
    const { data: inserted, error } = await admin
      .from('employees')
      .insert(employeePayload)
      .select('id')
      .single();
    if (error) {
      console.error(`  ✗ ${account.emp_number} employee insert:`, error.message);
      continue;
    }
    employeeId = inserted.id;
  }

  const otp = generateHeadOfficeOtp();
  const otpExpiresAt = new Date(Date.now() + HO_PORTAL_OTP_LIFETIME_MS).toISOString();
  const now = new Date().toISOString();

  try {
    await syncPortalAuthPassword(admin, portalAuthEmail, otp, employeeId, account.full_name);
  } catch (err) {
    console.error(`  ✗ ${account.emp_number} auth sync:`, err.message);
    continue;
  }

  const { error: authError } = await admin.from('head_office_portal_auth').upsert(
    {
      employee_id: employeeId,
      work_email: account.email,
      login_username: loginUsername,
      portal_auth_email: portalAuthEmail,
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
      last_otp_provisioned_at: now,
      updated_at: now,
    },
    { onConflict: 'employee_id' },
  );

  if (authError) {
    console.error(`  ✗ ${account.emp_number} portal auth:`, authError.message);
    continue;
  }

  console.log(
    `  ✓ ${account.rank} ${account.emp_number} — NIC login ${loginUsername} · OTP ${otp} (10 min) · portal ${portalAuthEmail}`,
  );
}

console.log('\nDone. Use Colombo HQ GPS (~6.8875, 79.8729) for on-site login; ~500 m away should be denied.');
