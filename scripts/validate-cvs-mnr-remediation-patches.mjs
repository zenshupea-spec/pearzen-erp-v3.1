/**
 * E-4 — Dry-run validation of CVS MNR remediation patch files.
 *
 * Usage: node scripts/validate-cvs-mnr-remediation-patches.mjs
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data/migration/classic-venture');
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

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
  if (!lines.length) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
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

function normStatus(s) {
  return (s ?? '').trim().toLowerCase();
}

async function fetchAll(supabase, table, select, companyFilter = true) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (companyFilter) q = q.eq('company_id', CVS_COMPANY_ID);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

async function main() {
  loadEnv();
  const errors = [];
  const warnings = [];

  const empPatchPath = join(outDir, 'remediation-employees-patch.csv');
  const sitePatchPath = join(outDir, 'remediation-sites-patch.csv');
  const linkPatchPath = join(outDir, 'remediation-sm-guard-links-patch.csv');

  for (const p of [empPatchPath, sitePatchPath, linkPatchPath]) {
    if (!existsSync(p)) errors.push(`Missing patch file: ${p}`);
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  const empPatches = parseCsv(readFileSync(empPatchPath, 'utf8'));
  const sitePatches = parseCsv(readFileSync(sitePatchPath, 'utf8'));
  const linkPatches = parseCsv(readFileSync(linkPatchPath, 'utf8'));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const [dbEmployees, dbSites] = await Promise.all([
    fetchAll(supabase, 'employees', 'emp_number, epf_no, status, group, rank'),
    fetchAll(supabase, 'site_profiles', 'site_name'),
  ]);

  const siteNames = new Set(dbSites.map((s) => (s.site_name ?? '').trim().toUpperCase()));
  const empByEpf = new Map();
  for (const e of dbEmployees) {
    const k = String(e.emp_number ?? e.epf_no ?? '').trim();
    if (k) empByEpf.set(k, e);
  }

  // Simulate post-patch employee state
  const postEmp = new Map(empByEpf);
  for (const p of empPatches) {
    const existing = postEmp.get(p.epf_no) ?? {
      emp_number: p.epf_no,
      status: '',
      group: '',
      rank: '',
    };
    postEmp.set(p.epf_no, {
      ...existing,
      emp_number: p.epf_no,
      status: p.status || existing.status,
      group: p.group || existing.group,
      rank: p.rank || existing.rank,
    });
  }

  // Employee patch checks
  const dupEmp = new Set();
  for (const p of empPatches) {
    if (dupEmp.has(p.epf_no)) errors.push(`Duplicate emp patch: ${p.epf_no}`);
    dupEmp.add(p.epf_no);
    if (!p.epf_no) errors.push('Employee patch row missing epf_no');
    if (!p.status) errors.push(`Employee ${p.epf_no}: missing status in patch`);
  }

  // Site patch checks
  for (const p of sitePatches) {
    const name = (p.site_name ?? '').trim();
    if (!name) {
      errors.push('Site patch row missing site_name');
      continue;
    }
    if (p.change_reason?.includes('missing_in_db')) {
      warnings.push(`Site "${name}" not in DB yet — F-3 will INSERT or skip per script`);
    } else if (!siteNames.has(name.toUpperCase())) {
      errors.push(`Site patch "${name}" not found in site_profiles`);
    }
    if (p.assigned_sm_epf && !empByEpf.get(p.assigned_sm_epf)) {
      errors.push(`Site "${name}": assigned_sm_epf ${p.assigned_sm_epf} not in employees`);
    }
    if (p.assigned_sm_epf) {
      const sm = postEmp.get(p.assigned_sm_epf) ?? empByEpf.get(p.assigned_sm_epf);
      if (sm && (sm.group ?? '').toUpperCase() !== 'SECTOR_MANAGER') {
        errors.push(`Site "${name}": SM ${p.assigned_sm_epf} group=${sm.group}`);
      }
    }
  }

  // SM link checks
  const guardSeen = new Set();
  for (const l of linkPatches) {
    if (!l.sm_epf || !l.guard_epf) {
      errors.push('SM link row missing sm_epf or guard_epf');
      continue;
    }
    if (guardSeen.has(l.guard_epf)) {
      errors.push(`Duplicate guard_epf in links: ${l.guard_epf}`);
    }
    guardSeen.add(l.guard_epf);

    const sm = postEmp.get(l.sm_epf) ?? empByEpf.get(l.sm_epf);
    if (!sm) {
      errors.push(`SM EPF ${l.sm_epf} not found in employees`);
    } else if ((sm.group ?? '').toUpperCase() !== 'SECTOR_MANAGER') {
      errors.push(`SM ${l.sm_epf} is not SECTOR_MANAGER (group=${sm.group})`);
    }

    const guard = postEmp.get(l.guard_epf) ?? empByEpf.get(l.guard_epf);
    if (!guard) {
      errors.push(`Guard EPF ${l.guard_epf} not found in employees`);
    } else {
      const st = normStatus(guard.status);
      if (st === 'resigned') {
        errors.push(`Guard ${l.guard_epf} would be Resigned after employee patch`);
      }
      if (st !== 'active' && st !== 'resigned') {
        warnings.push(`Guard ${l.guard_epf} status after patch: ${guard.status}`);
      }
    }
  }

  const resignedCount = empPatches.filter((p) => normStatus(p.status) === 'resigned').length;

  const lines = [
    '',
    '=== E-4 DRY-RUN VALIDATION ===',
    `Run at: ${new Date().toISOString()}`,
    '',
    'Patch files:',
    `  employees: ${empPatches.length} rows (${resignedCount} → Resigned)`,
    `  sites: ${sitePatches.length} rows`,
    `  sm_guard_links: ${linkPatches.length} rows`,
    '',
    'Checks:',
    `  [${errors.length ? 'FAIL' : 'PASS'}] Site names exist in site_profiles (or flagged missing_in_db)`,
    `  [${errors.filter((e) => e.includes('SECTOR_MANAGER')).length ? 'FAIL' : 'PASS'}] Every sm_epf is SECTOR_MANAGER`,
    `  [${errors.filter((e) => e.includes('Resigned after')).length ? 'FAIL' : 'PASS'}] Guards ACTIVE after employee patch applied`,
    `  [${errors.filter((e) => e.includes('Duplicate')).length ? 'FAIL' : 'PASS'}] No duplicate guard_epf / emp_number`,
    '',
  ];

  if (warnings.length) {
    lines.push(`Warnings (${warnings.length}):`);
    for (const w of warnings) lines.push(`  ! ${w}`);
    lines.push('');
  }

  if (errors.length) {
    lines.push(`ERRORS (${errors.length}):`);
    for (const e of errors.slice(0, 30)) lines.push(`  ✗ ${e}`);
    if (errors.length > 30) lines.push(`  ... and ${errors.length - 30} more`);
    lines.push('');
    lines.push('RESULT: FAIL — fix before Phase F');
  } else {
    lines.push('RESULT: PASS — safe to proceed to E-5 operator review, then Phase F');
    lines.push('');
    lines.push('E-4 COMPLETE — proceed to E-5 (operator review gate)');
  }

  appendFileSync(join(outDir, 'remediation-audit-report.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
