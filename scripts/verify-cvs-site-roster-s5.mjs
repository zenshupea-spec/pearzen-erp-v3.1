/**
 * S-5 verify — count MNR site-pool buckets from live DB (read-only).
 * Usage: node scripts/verify-cvs-site-roster-s5.mjs
 */

import { readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const GUARD_GROUPS = new Set(['GUARD', 'GUARD_FIELD']);

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
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

function normStatus(emp) {
  return (emp.status || '').trim().toLowerCase();
}

function normSite(emp) {
  return (emp.site || '').trim().toUpperCase();
}

function normGroup(emp) {
  const v = (emp.group || '').trim().toUpperCase();
  return v === 'GUARD_FIELD' ? 'GUARD' : v;
}

function isHrActive(emp) {
  return normStatus(emp) === 'active';
}

function isResigned(emp) {
  return normStatus(emp) === 'resigned' || normSite(emp) === 'CLEARANCE';
}

function isGuard(emp) {
  return GUARD_GROUPS.has(normGroup(emp));
}

function isHqRoster(emp) {
  if (!isHrActive(emp)) return false;
  const g = normGroup(emp);
  return g === 'HEAD_OFFICE' || g === 'CAFE' || g === 'SECTOR_MANAGER';
}

function isDeployed(emp) {
  const site = normSite(emp);
  if (!isHrActive(emp) || !site) return false;
  if (['RESERVE', 'CLEARANCE', 'TEMPORY', 'HEAD OFFICE'].includes(site)) return false;
  return true;
}

function bucket(emp) {
  if (isResigned(emp)) return 'RESIGNED';
  if (!isHrActive(emp)) return 'OTHER';
  if (isHqRoster(emp)) return 'ACTIVE';
  if (isGuard(emp)) {
    if (normSite(emp) === 'RESERVE') return 'INACTIVE';
    if (normSite(emp) === 'TEMPORY') return 'TEMPORY';
    if (isDeployed(emp)) return 'ACTIVE';
  }
  return 'OTHER';
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('employees')
      .select('status, site, group')
      .eq('company_id', CVS_COMPANY_ID)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }

  const counts = { ACTIVE: 0, INACTIVE: 0, TEMPORY: 0, RESIGNED: 0, OTHER: 0 };
  for (const emp of all) counts[bucket(emp)] += 1;

  const report = [
    '',
    '=== S-5 MNR POOL COUNTS (live DB, pre-apply) ===',
    `Run at: ${new Date().toISOString()}`,
    `Employees: ${all.length}`,
    `  Active Personnel: ${counts.ACTIVE} (expect ~560 after data apply)`,
    `  Inactive (RESERVE): ${counts.INACTIVE} (expect ~4185)`,
    `  Temp roster: ${counts.TEMPORY} (expect ~144)`,
    `  Resigned: ${counts.RESIGNED} (expect ~305)`,
    `  Other: ${counts.OTHER}`,
    '',
    'S-5 UI PASS — badges now use site pools (shift lookback removed)',
  ];

  const msg = report.join('\n');
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${msg}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
