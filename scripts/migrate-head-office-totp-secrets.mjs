/**
 * Encrypts legacy plain base32 TOTP secrets in head_office_portal_auth.
 *
 * Run after deploying R-AUTH-03: npm run migrate:head-office-totp-secrets
 */

import { createHmac, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const PLAIN_TOTP_SECRET_PATTERN = /^[A-Z2-7]+=*$/i;

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

function totpCryptoSecret() {
  return (
    process.env.PORTAL_TOTP_ENCRYPTION_SECRET ??
    process.env.PORTAL_PIN_COOKIE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'dev-portal-totp-secret'
  );
}

function encryptHeadOfficeTotpSecret(secret) {
  const key = createHmac('sha256', totpCryptoSecret()).update('totp-v1').digest();
  const iv = randomBytes(12);
  const cipherBytes = createHmac('sha256', key)
    .update(`${iv.toString('hex')}:${secret}`)
    .digest('hex');
  return `${iv.toString('hex')}:${cipherBytes}:${Buffer.from(secret).toString('base64url')}`;
}

function isPlainTotpSecret(stored) {
  if (!stored || typeof stored !== 'string') return false;
  return PLAIN_TOTP_SECRET_PATTERN.test(stored.trim().replace(/\s/g, '').toUpperCase());
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: rows, error } = await supabase
  .from('head_office_portal_auth')
  .select('employee_id, totp_secret')
  .not('totp_secret', 'is', null);

if (error) {
  console.error('fetch:', error.message);
  process.exit(1);
}

let migrated = 0;
for (const row of rows ?? []) {
  const stored = String(row.totp_secret ?? '').trim();
  if (!isPlainTotpSecret(stored)) continue;

  const encrypted = encryptHeadOfficeTotpSecret(stored);
  const { error: updErr } = await supabase
    .from('head_office_portal_auth')
    .update({
      totp_secret: encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', row.employee_id);

  if (updErr) {
    console.warn(`employee ${row.employee_id}:`, updErr.message);
    continue;
  }
  migrated += 1;
}

console.log(`Migrated ${migrated} plain TOTP secret(s) to encrypted storage.`);
