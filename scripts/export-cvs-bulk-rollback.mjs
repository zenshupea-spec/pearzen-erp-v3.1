/**
 * C-1 rollback snapshot — export current CVS tenant bulk data before legacy import.
 * Run: node scripts/export-cvs-bulk-rollback.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const outDir = join(root, 'data/migration/classic-venture');

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env.seed.tmp', '.env']) {
    try {
      const text = readFileSync(join(root, file), 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* next */
    }
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
const stamp = new Date().toISOString().slice(0, 10);

async function countTable(table, filter = {}) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter.company_id) q = q.eq('company_id', filter.company_id);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('id', CVS_COMPANY_ID)
    .maybeSingle();
  if (companyErr) throw new Error(companyErr.message);

  const [employees, sites, smLinks] = await Promise.all([
    countTable('employees', { company_id: CVS_COMPANY_ID }),
    countTable('site_profiles', { company_id: CVS_COMPANY_ID }),
    supabase.from('sm_guard_assignments').select('*', { count: 'exact', head: true }),
  ]);

  const smCount = smLinks.count ?? 0;
  if (smLinks.error) throw new Error(`sm_guard_assignments: ${smLinks.error.message}`);

  const summary = {
    timestamp: new Date().toISOString(),
    company_id: CVS_COMPANY_ID,
    company_name: company?.name ?? 'NOT FOUND',
    company_slug: company?.slug ?? '',
    employees: employees,
    site_profiles: sites,
    sm_guard_assignments: smCount,
  };

  const summaryPath = join(outDir, `cvs-pre-import-baseline-${stamp}.json`);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

  console.log('CVS pre-import baseline (C-1 rollback snapshot)\n');
  console.log(`  Tenant: ${summary.company_name} (${summary.company_slug})`);
  console.log(`  company_id: ${CVS_COMPANY_ID}`);
  console.log(`  employees: ${employees}`);
  console.log(`  site_profiles: ${sites}`);
  console.log(`  sm_guard_assignments: ${smCount}`);
  console.log(`\nWrote ${summaryPath}`);
  console.log('\nFor full encrypted bulk export, use MD Settings → Download live export before import.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
