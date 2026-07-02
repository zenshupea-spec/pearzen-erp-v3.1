/**
 * S-7 — Apply site-roster-employees-patch.csv (site/status/group/import/delete).
 * Rank changes deferred to S-8.
 *
 * Usage: node scripts/apply-cvs-site-roster-s7.mjs
 * Dry-run: node scripts/apply-cvs-site-roster-s7.mjs --dry-run
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { encrypt } from '../apps/back-office/lib/encryption.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const patchPath = join(outDir, 'site-roster-employees-patch.csv');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const dryRun = process.argv.includes('--dry-run');

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

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        values.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function log(line) {
  const msg = `[S-7 ${dryRun ? 'DRY-RUN' : 'APPLY'}] ${line}`;
  console.log(msg);
  appendFileSync(join(outDir, 'site-roster-apply-log.txt'), `${new Date().toISOString()} ${msg}\n`);
}

function encryptNic(nic) {
  const raw = (nic ?? '').trim().toUpperCase();
  if (!raw || raw === '-') return null;
  return encrypt(raw);
}

function reasons(row) {
  return (row.change_reason ?? '')
    .split('+')
    .map((r) => r.trim())
    .filter(Boolean);
}

function buildUpdatePayload(row) {
  const parts = reasons(row);
  if (!parts.length || parts.every((p) => p === 'rank')) return null;

  const payload = {};
  if (parts.includes('site')) payload.site = row.site.trim();
  if (parts.includes('status')) payload.status = row.status.trim();
  if (parts.includes('group')) payload.group = row.group.trim();
  return Object.keys(payload).length ? payload : null;
}

async function findEmployeeId(supabase, epf) {
  const key = (epf ?? '').trim();
  if (!key) return null;

  const { data: byEmp, error: e1 } = await supabase
    .from('employees')
    .select('id, emp_number, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('emp_number', key)
    .maybeSingle();
  if (e1) throw e1;
  if (byEmp?.id) return byEmp;

  const { data: byEpf, error: e2 } = await supabase
    .from('employees')
    .select('id, emp_number, full_name')
    .eq('company_id', CVS_COMPANY_ID)
    .eq('epf_no', key)
    .maybeSingle();
  if (e2) throw e2;
  return byEpf ?? null;
}

async function applyUpdate(supabase, row) {
  const payload = buildUpdatePayload(row);
  if (!payload) return { skipped: true, reason: 'rank-only (S-8)' };

  const emp = await findEmployeeId(supabase, row.epf_no);
  if (!emp?.id) return { skipped: true, reason: 'not found' };

  if (dryRun) return { updated: true, dry: true, payload };

  const { error } = await supabase.from('employees').update(payload).eq('id', emp.id);
  if (error) throw error;
  return { updated: true, payload };
}

async function applyImport(supabase, row) {
  const epf = row.epf_no.trim();
  const existing = await findEmployeeId(supabase, epf);
  if (existing?.id) return { skipped: true, reason: 'already exists' };

  const record = {
    company_id: CVS_COMPANY_ID,
    emp_number: epf,
    epf_no: epf,
    full_name: row.full_name.trim().toUpperCase(),
    site: row.site.trim(),
    status: row.status.trim(),
    group: row.group.trim(),
    rank: row.rank.trim(),
    nic: encryptNic(row.nic),
  };

  if (dryRun) return { imported: true, dry: true, record };

  const { error } = await supabase.from('employees').insert(record);
  if (error) throw error;
  return { imported: true };
}

async function applyDelete(supabase, row) {
  const emp = await findEmployeeId(supabase, row.epf_no);
  if (!emp?.id) return { skipped: true, reason: 'not found' };

  if (dryRun) return { deleted: true, dry: true, name: emp.full_name };

  const { error } = await supabase.from('employees').delete().eq('id', emp.id);
  if (error) throw error;
  return { deleted: true, name: emp.full_name };
}

async function main() {
  loadEnv();
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(patchPath)) throw new Error('Missing site-roster-employees-patch.csv — run S-4');

  const patches = parseCsv(readFileSync(patchPath, 'utf8'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const summary = {
    deleted: 0,
    imported: 0,
    updated: 0,
    skippedRank: 0,
    skippedOther: 0,
    errors: 0,
  };

  log(`Starting — ${patches.length} patch rows`);

  const deletes = patches.filter((p) => p.action === 'DELETE');
  const imports = patches.filter((p) => p.action === 'IMPORT');
  const updates = patches.filter((p) => p.action === 'UPDATE');

  for (const row of deletes) {
    try {
      const result = await applyDelete(supabase, row);
      if (result.deleted) {
        summary.deleted += 1;
        log(`DELETE EPF ${row.epf_no} — ${row.full_name}`);
      } else {
        summary.skippedOther += 1;
        log(`SKIP DELETE EPF ${row.epf_no}: ${result.reason}`);
      }
    } catch (err) {
      summary.errors += 1;
      log(`ERROR DELETE EPF ${row.epf_no}: ${err.message}`);
    }
  }

  for (const row of imports) {
    try {
      const result = await applyImport(supabase, row);
      if (result.imported) {
        summary.imported += 1;
        log(`IMPORT EPF ${row.epf_no} — ${row.full_name} @ ${row.site}`);
      } else {
        summary.skippedOther += 1;
        log(`SKIP IMPORT EPF ${row.epf_no}: ${result.reason}`);
      }
    } catch (err) {
      summary.errors += 1;
      log(`ERROR IMPORT EPF ${row.epf_no}: ${err.message}`);
    }
  }

  for (const row of updates) {
    try {
      const result = await applyUpdate(supabase, row);
      if (result.updated) {
        summary.updated += 1;
        log(`UPDATE EPF ${row.epf_no} — ${JSON.stringify(result.payload)}`);
      } else if (result.reason === 'rank-only (S-8)') {
        summary.skippedRank += 1;
      } else {
        summary.skippedOther += 1;
        log(`SKIP UPDATE EPF ${row.epf_no}: ${result.reason}`);
      }
    } catch (err) {
      summary.errors += 1;
      log(`ERROR UPDATE EPF ${row.epf_no}: ${err.message}`);
    }
  }

  const report = [
    '',
    '=== S-7 APPLY SUMMARY ===',
    `Run at: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Deleted: ${summary.deleted} / ${deletes.length}`,
    `Imported: ${summary.imported} / ${imports.length}`,
    `Updated (site/status/group): ${summary.updated}`,
    `Deferred rank-only (S-8): ${summary.skippedRank}`,
    `Skipped other: ${summary.skippedOther}`,
    `Errors: ${summary.errors}`,
    summary.errors === 0 ? 'S-7 PASS' : 'S-7 PARTIAL',
    '',
    'S-7 COMPLETE — proceed to S-8',
  ];

  appendFileSync(join(outDir, 'site-roster-audit-report.txt'), `${report.join('\n')}\n`);
  console.log(report.join('\n'));

  if (summary.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  appendFileSync(
    join(outDir, 'site-roster-apply-log.txt'),
    `${new Date().toISOString()} [S-7 FATAL] ${err.message}\n`,
  );
  process.exit(1);
});
