/**
 * Syncs invoice VAT/SSCL + letterhead into md_settings (no SQL migration required).
 * Uses setting_value JSON (per company row) on your live Supabase schema.
 *
 * Run from repo root:
 *   node scripts/sync-invoice-md-settings.mjs
 *
 * Loads env from apps/back-office/.env.local
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const env = readFileSync(
      new URL('../apps/back-office/.env.local', import.meta.url),
      'utf8',
    );
    for (const line of env.split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* rely on shell env */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

const LETTERHEAD = {
  headOffice: 'No: 196, Park Road, Colombo 05.',
  telephone: '011 263 2000, 0753 632 007',
  email: 'iresha@classicventure.com',
  pvNumber: '7278',
  supplierTin: '114453099-7000',
  supplierAddress: 'No. 196, Park Road, Colombo 05.',
};

const { data: companies, error: coErr } = await supabase.from('companies').select('id');
if (coErr) {
  console.error('companies:', coErr.message);
  process.exit(1);
}

let ok = 0;
for (const { id: company_id } of companies ?? []) {
  const { error } = await supabase.from('md_settings').upsert(
    {
      company_id,
      vat_rate: 18,
      sscl_rate: 2.5641,
      setting_value: JSON.stringify(LETTERHEAD),
    },
    { onConflict: 'company_id' },
  );
  if (error) {
    console.error(`company ${company_id}:`, error.message);
  } else {
    ok += 1;
    console.log(`Synced invoice settings for company ${company_id}`);
  }
}

console.log(`Done. Updated ${ok} company row(s).`);
