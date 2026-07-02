/**
 * Purges OpEx receipt images for bills <= LKR 30k once bill_date + 60 days has passed.
 *
 * Run daily via cron: GET /api/cron/purge-opex-receipts (Vercel)
 * Or manually: npm run purge:opex-receipts
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const OPEX_RECEIPTS_BUCKET = 'opex-receipts';
const RETENTION_DAYS = 60;
const PERMANENT_THRESHOLD_LKR = 30_000;
const BATCH = 500;

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

function parseStorageRef(stored) {
  if (!stored || typeof stored !== 'string') return null;
  const value = stored.trim();
  const storageUri = value.match(/^storage:\/\/([^/]+)\/(.+)$/i);
  if (storageUri) {
    if (storageUri[1] !== OPEX_RECEIPTS_BUCKET) return null;
    return storageUri[2].split('?')[0] || null;
  }
  const markers = [
    `/object/public/${OPEX_RECEIPTS_BUCKET}/`,
    `/object/sign/${OPEX_RECEIPTS_BUCKET}/`,
    `/object/authenticated/${OPEX_RECEIPTS_BUCKET}/`,
    `/${OPEX_RECEIPTS_BUCKET}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) return value.slice(idx + marker.length).split('?')[0];
  }
  if (!value.startsWith('http://') && !value.startsWith('https://')) {
    return value.replace(/^\/+/, '');
  }
  return null;
}

function isEligibleForPurge(billDate, amount, referenceDate) {
  if (amount > PERMANENT_THRESHOLD_LKR) return false;
  const purgeOn = new Date(`${billDate.slice(0, 10)}T00:00:00.000Z`);
  purgeOn.setUTCDate(purgeOn.getUTCDate() + RETENTION_DAYS);
  return purgeOn.toISOString().slice(0, 10) <= referenceDate;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const referenceDate = new Date().toISOString().slice(0, 10);

console.log(
  `Purging OpEx receipts for bills <= LKR ${PERMANENT_THRESHOLD_LKR.toLocaleString()} with bill_date + ${RETENTION_DAYS}d before ${referenceDate}…`,
);

const objectPaths = new Set();
let billsCleared = 0;

const { data: rows, error } = await supabase
  .from('expense_bills')
  .select('id, bill_date, amount, receipt_url')
  .not('receipt_url', 'is', null)
  .neq('receipt_url', '')
  .lte('amount', PERMANENT_THRESHOLD_LKR)
  .limit(BATCH);

if (error) {
  console.error('expense_bills fetch:', error.message);
  process.exit(1);
}

for (const row of rows ?? []) {
  const billDate = String(row.bill_date ?? '').slice(0, 10);
  const amount = Number(row.amount ?? 0);
  const receiptUrl = String(row.receipt_url ?? '');
  if (!billDate || !receiptUrl.trim()) continue;
  if (!isEligibleForPurge(billDate, amount, referenceDate)) continue;

  const objectPath = parseStorageRef(receiptUrl);
  if (objectPath) objectPaths.add(objectPath);

  const { error: updErr } = await supabase
    .from('expense_bills')
    .update({ receipt_url: '', updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (!updErr) billsCleared += 1;
}

let objectsRemoved = 0;
if (objectPaths.size > 0) {
  const { error: removeErr } = await supabase.storage
    .from(OPEX_RECEIPTS_BUCKET)
    .remove([...objectPaths]);
  if (removeErr) console.warn('opex-receipts remove:', removeErr.message);
  else objectsRemoved = objectPaths.size;
}

console.log(
  `Done. Cleared receipt_url on ${billsCleared} bill(s); removed ${objectsRemoved} storage object(s).`,
);
