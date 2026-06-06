/**
 * Provision Supabase Auth for all active guards with an EPF on file.
 * Run: node scripts/provision-guard-portal-auth.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', 'apps/field-pwa/.env.local']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* skip */
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE =
  process.env.FIELD_PWA_AUTH_PASSWORD_TEMPLATE || '{{epfNo}}';

const { provisionGuardPortalAuth, canonicalEpfFromEmployee } = await import(
  '../apps/field-pwa/lib/guard-auth.ts'
);

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let ok = 0;
let skipped = 0;
let failed = 0;

const { data: rows, error } = await admin
  .from('employees')
  .select('id, full_name, emp_number, epf_no, epf_num, status')
  .eq('status', 'ACTIVE');

if (error) {
  console.error('employees:', error.message);
  process.exit(1);
}

for (const row of rows ?? []) {
    const epf = canonicalEpfFromEmployee(row);
    if (!epf) {
      skipped += 1;
      continue;
    }

    const result = await provisionGuardPortalAuth(admin, row);
    if (!result.ok) {
      failed += 1;
      console.error(`  ✗ ${row.full_name ?? row.id} (${epf}): ${result.error}`);
      continue;
    }

  ok += 1;
  console.log(`  ✓ ${epf} → ${result.email}`);
}

console.log(`\nDone. provisioned=${ok} skipped(no EPF)=${skipped} failed=${failed}`);
