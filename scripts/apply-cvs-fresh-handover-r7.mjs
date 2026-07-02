#!/usr/bin/env node
/**
 * R-7 — Relink MD portal auth + preserve MD/OD head-office portal rows only.
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r7.mjs
 *   node scripts/apply-cvs-fresh-handover-r7.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/migration/classic-venture/fresh-handover');
const CVS_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';

const PRESERVE = {
  MD: {
    id: '59957583-deb6-4492-931d-b313c9b04a99',
    portal_work_email: 'susil@classicventure.com',
  },
  OD: {
    id: '47ea02d0-6b05-41f3-8be4-060dd706e580',
    portal_work_email: 'zenshupea@gmail.com',
  },
};

const PRESERVE_EMAILS = [
  PRESERVE.MD.portal_work_email,
  PRESERVE.OD.portal_work_email,
];

const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

function normEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const host = new URL(url).hostname;
  if (!host.includes(CVS_PROJECT_REF)) {
    console.error(`Refusing R-7 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key);
  const log = [
    `CVS fresh handover R-7 — head-office portal auth`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
    'Actions:',
  ];

  console.log(`\nR-7 head-office portal auth — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  const { data: beforeRows, error: beforeErr } = await db
    .from('head_office_portal_auth')
    .select('employee_id, work_email, is_active, needs_pin_setup, two_factor_enabled');
  if (beforeErr) throw new Error(beforeErr.message);

  log.push(`Before: ${beforeRows?.length ?? 0} row(s)`);
  for (const row of beforeRows ?? []) {
    log.push(`  · ${row.employee_id} ${row.work_email} active=${row.is_active}`);
  }

  const mdPortal = (beforeRows ?? []).find(
    (r) => normEmail(r.work_email) === PRESERVE.MD.portal_work_email,
  );
  const odPortal = (beforeRows ?? []).find(
    (r) => normEmail(r.work_email) === PRESERVE.OD.portal_work_email,
  );

  if (!mdPortal) {
    throw new Error(`MD portal row missing for ${PRESERVE.MD.portal_work_email}`);
  }
  if (!odPortal) {
    throw new Error(`OD portal row missing for ${PRESERVE.OD.portal_work_email}`);
  }

  const extras = (beforeRows ?? []).filter(
    (r) => !PRESERVE_EMAILS.includes(normEmail(r.work_email)),
  );

  if (mdPortal.employee_id !== PRESERVE.MD.id) {
    log.push('');
    log.push(
      `Relink MD portal: ${mdPortal.employee_id} → ${PRESERVE.MD.id} (${PRESERVE.MD.portal_work_email})`,
    );
    if (!dryRun) {
      const { error: relinkErr } = await db
        .from('head_office_portal_auth')
        .update({ employee_id: PRESERVE.MD.id })
        .eq('employee_id', mdPortal.employee_id);
      if (relinkErr) throw new Error(`MD relink: ${relinkErr.message}`);
      log.push('  ✓ MD portal relinked');
    } else {
      log.push('  (dry-run) would relink MD portal');
    }
  } else {
    log.push('MD portal already on correct employee_id');
  }

  if (extras.length) {
    log.push('');
    log.push(`Delete ${extras.length} extra head_office_portal_auth row(s):`);
    for (const row of extras) {
      log.push(`  · ${row.employee_id} ${row.work_email}`);
      if (!dryRun) {
        const { error } = await db
          .from('head_office_portal_auth')
          .delete()
          .eq('employee_id', row.employee_id);
        if (error) throw new Error(`Delete ${row.employee_id}: ${error.message}`);
      }
    }
    if (!dryRun) log.push('  ✓ extras deleted');
  } else {
    log.push('No extra head_office_portal_auth rows to delete');
  }

  const { data: afterRows, error: afterErr } = dryRun
    ? { data: beforeRows, error: null }
    : await db
        .from('head_office_portal_auth')
        .select('employee_id, work_email, is_active, needs_pin_setup, two_factor_enabled');
  if (afterErr) throw new Error(afterErr.message);

  if (!dryRun) {
    log.push('', 'After:');
    for (const row of afterRows ?? []) {
      log.push(`  · ${row.employee_id} ${row.work_email} active=${row.is_active}`);
    }
  }

  const gatePass =
    (afterRows?.length ?? 0) === 2 &&
    afterRows?.some((r) => r.employee_id === PRESERVE.MD.id) &&
    afterRows?.some((r) => r.employee_id === PRESERVE.OD.id) &&
    afterRows?.every((r) => PRESERVE_EMAILS.includes(normEmail(r.work_email)));

  log.push('', `GATE: ${gatePass ? 'PASS' : 'FAIL'}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-7-apply-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  for (const line of log.slice(5)) console.log(line);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-7 gate FAIL');
    process.exit(1);
  }

  console.log(`\n${dryRun ? 'Dry-run complete' : '✓ R-7 complete'} — ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
