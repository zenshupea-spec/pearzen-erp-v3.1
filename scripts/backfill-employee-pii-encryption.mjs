/**
 * Encrypt legacy plaintext employee PII on remote CVS (or any tenant).
 *
 * Run: npm run backfill:employee-pii-encryption
 * Optional: COMPANY_ID=29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e DRY_RUN=1
 */

import crypto from 'crypto';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const IV_LENGTH = 16;
const ENCRYPTED_FIELDS = [
  'nic',
  'phone',
  'passport_no',
  'home_address',
  'bank_code',
  'branch_code',
  'account_number',
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

function looksEncrypted(text) {
  if (!text) return false;
  const parts = String(text).split(':');
  if (parts.length < 2) return false;
  const ivHex = parts[0];
  return ivHex.length === IV_LENGTH * 2 && /^[0-9a-f]+$/i.test(ivHex);
}

function encryptPlaintext(text, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
  let encrypted = cipher.update(String(text));
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

loadEnv();

const key = process.env.ENCRYPTION_KEY?.trim();
if (!key || key.length !== 32) {
  console.error('ENCRYPTION_KEY must be exactly 32 characters.');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const companyId = process.env.COMPANY_ID?.trim();
const dryRun = process.env.DRY_RUN === '1';

const supabase = createClient(url, serviceKey);

let query = supabase.from('employees').select(
  `id, emp_number, full_name, ${ENCRYPTED_FIELDS.join(', ')}`,
);
if (companyId) query = query.eq('company_id', companyId);

const { data: employees, error } = await query;
if (error) {
  console.error('employees fetch:', error.message);
  process.exit(1);
}

let employeesUpdated = 0;
let fieldsEncrypted = 0;

for (const employee of employees ?? []) {
  const updates = {};

  for (const field of ENCRYPTED_FIELDS) {
    const value = employee[field];
    if (value == null || value === '') continue;
    if (looksEncrypted(value)) continue;
    updates[field] = encryptPlaintext(value, key);
    fieldsEncrypted += 1;
  }

  if (Object.keys(updates).length === 0) continue;

  const label = employee.emp_number ?? employee.full_name ?? employee.id;
  if (dryRun) {
    console.log(`  [dry-run] ${label}: would encrypt ${Object.keys(updates).join(', ')}`);
    employeesUpdated += 1;
    continue;
  }

  const { error: updErr } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', employee.id);

  if (updErr) {
    console.warn(`  ${label}: ${updErr.message}`);
    continue;
  }

  employeesUpdated += 1;
  console.log(`  encrypted ${Object.keys(updates).join(', ')} for ${label}`);
}

console.log(
  `\nDone. employeesUpdated=${employeesUpdated}, fieldsEncrypted=${fieldsEncrypted}` +
    (dryRun ? ' (dry run)' : '') +
    (companyId ? ` company=${companyId}` : ''),
);
