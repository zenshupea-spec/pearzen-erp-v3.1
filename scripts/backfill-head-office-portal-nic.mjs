/**
 * Backfill head_office_portal_auth.login_username + portal_auth_email from employee NIC.
 * Optional: BACKFILL_PORTAL_UNLOCK_CODE=123456 sets unlock_code_hash when missing.
 *
 * Run: npm run backfill:head-office-portal-nic
 */

import { createDecipheriv, pbkdf2Sync, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const PORTAL_AUTH_EMAIL_DOMAIN = 'portal.pearzen.local';
const PIN_ITERATIONS = 100_000;

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

function decryptNic(stored) {
  const key = process.env.ENCRYPTION_KEY?.trim();
  if (!key || key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 characters.');
  }
  const text = String(stored);
  const parts = text.split(':');
  if (parts.length < 2) return text;
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

function hashPortalUnlockCode(code) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(code.trim(), salt, PIN_ITERATIONS, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const unlockCode = process.env.BACKFILL_PORTAL_UNLOCK_CODE?.trim();

const { data: authRows, error } = await supabase
  .from('head_office_portal_auth')
  .select('employee_id, work_email, login_username, portal_auth_email, unlock_code_hash')
  .eq('is_active', true);

if (error) {
  console.error('head_office_portal_auth fetch:', error.message);
  process.exit(1);
}

let nicUpdated = 0;
let unlockUpdated = 0;

for (const row of authRows ?? []) {
  const updates = {};

  if (!row.login_username || !row.portal_auth_email) {
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('id, nic')
      .eq('id', row.employee_id)
      .maybeSingle();

    if (empErr || !employee?.nic) {
      console.warn(`  skip ${row.work_email}: no NIC on employee record`);
      continue;
    }

    let nicPlain;
    try {
      nicPlain = decryptNic(employee.nic);
    } catch (err) {
      console.warn(`  skip ${row.work_email}: decrypt failed — ${err.message}`);
      continue;
    }

    const loginUsername = normalizeNic(nicPlain);
    if (!loginUsername) {
      console.warn(`  skip ${row.work_email}: empty NIC after decrypt`);
      continue;
    }

    updates.login_username = loginUsername;
    updates.portal_auth_email = portalAuthEmailFromUsername(loginUsername);
  }

  if (!row.unlock_code_hash && unlockCode && /^\d{6}$/.test(unlockCode)) {
    updates.unlock_code_hash = hashPortalUnlockCode(unlockCode);
    updates.unlock_code_set_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) continue;

  updates.updated_at = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('head_office_portal_auth')
    .update(updates)
    .eq('employee_id', row.employee_id);

  if (updErr) {
    console.warn(`  ${row.work_email}: ${updErr.message}`);
    continue;
  }

  if (updates.login_username) {
    nicUpdated += 1;
    console.log(
      `  NIC backfill ${row.work_email} → ${updates.login_username} / ${updates.portal_auth_email}`,
    );
  }
  if (updates.unlock_code_hash) {
    unlockUpdated += 1;
    console.log(`  unlock code set for ${row.work_email}`);
  }
}

console.log(
  `\nDone. NIC fields updated=${nicUpdated}, unlock codes set=${unlockUpdated}.` +
    (unlockCode ? '' : ' (Set BACKFILL_PORTAL_UNLOCK_CODE to seed unlock_code_hash.)'),
);
