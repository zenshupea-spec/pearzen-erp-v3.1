#!/usr/bin/env node
/**
 * R-10 — Purge Supabase Auth users for removed CVS roster (keep MD + OD).
 *
 * Usage:
 *   node scripts/apply-cvs-fresh-handover-r10.mjs
 *   node scripts/apply-cvs-fresh-handover-r10.mjs --dry-run
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/migration/classic-venture/fresh-handover');
const CVS_PROJECT_REF = 'ktfgvcrdfbapmefktgjc';

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

async function listAllAuthUsers(admin) {
  const users = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

function isPurgeCandidate(email) {
  const e = normEmail(email);
  if (!e.includes('@')) return false;
  if (e.endsWith('@pearzen.sm')) return true;
  if (e.endsWith('@pearzen.cafe')) return true;
  if (e.endsWith('@shalom.pearzen.local')) return true;
  if (e.endsWith('@pearzen.local')) return true;
  if (e.endsWith('@portal.pearzen.local')) return true;
  return false;
}

async function loadPreserveEmails(db) {
  const { data, error } = await db
    .from('head_office_portal_auth')
    .select('work_email, portal_auth_email');
  if (error) throw new Error(error.message);

  const preserve = new Set();
  for (const row of data ?? []) {
    if (row.work_email) preserve.add(normEmail(row.work_email));
    if (row.portal_auth_email) preserve.add(normEmail(row.portal_auth_email));
  }
  return preserve;
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
    console.error(`Refusing R-10 on non-production host: ${host}`);
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const log = [
    `CVS fresh handover R-10 — Supabase Auth purge`,
    `Date: ${new Date().toISOString()}`,
    `Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`,
    `Host: ${host}`,
    '',
  ];

  console.log(`\nR-10 Auth purge — ${dryRun ? 'dry-run' : 'APPLY'}\n`);

  const preserve = await loadPreserveEmails(db);
  log.push('Preserve auth emails:');
  for (const e of [...preserve].sort()) log.push(`  · ${e}`);

  const allUsers = await listAllAuthUsers(db);
  log.push('', `Auth users listed: ${allUsers.length}`);

  const toDelete = allUsers.filter((u) => {
    const email = normEmail(u.email);
    if (!email) return false;
    if (preserve.has(email)) return false;
    return isPurgeCandidate(email);
  });

  const domainCounts = {};
  for (const u of toDelete) {
    const domain = normEmail(u.email).split('@')[1] ?? '?';
    domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
  }

  log.push(`Candidates to delete: ${toDelete.length}`);
  for (const [domain, count] of Object.entries(domainCounts).sort()) {
    log.push(`  ${domain}: ${count}`);
  }

  let deleted = 0;
  let failed = 0;

  if (!dryRun) {
    log.push('', 'Deleting:');
    for (const user of toDelete) {
      const { error } = await db.auth.admin.deleteUser(user.id);
      if (error) {
        failed += 1;
        log.push(`  ✗ ${user.email} — ${error.message}`);
      } else {
        deleted += 1;
        if (deleted <= 5 || deleted % 500 === 0) {
          console.log(`  deleted ${deleted}/${toDelete.length}…`);
        }
      }
    }
    if (deleted > 5) log.push(`  … ${deleted} users deleted`);
  }

  const afterUsers = dryRun ? allUsers : await listAllAuthUsers(db);
  const smRemain = afterUsers.filter((u) => normEmail(u.email).endsWith('@pearzen.sm'));
  const cafeRemain = afterUsers.filter((u) => normEmail(u.email).endsWith('@pearzen.cafe'));
  const guardRemain = afterUsers.filter((u) => normEmail(u.email).endsWith('@pearzen.local'));
  const portalRemain = afterUsers.filter((u) => normEmail(u.email).endsWith('@portal.pearzen.local'));

  const { data: hoRows } = await db
    .from('head_office_portal_auth')
    .select('work_email, portal_auth_email');
  const execAuthOk = (hoRows ?? []).every((row) => {
    const candidates = [row.work_email, row.portal_auth_email]
      .map(normEmail)
      .filter(Boolean);
    return candidates.some((e) => afterUsers.some((u) => normEmail(u.email) === e));
  });

  log.push('', 'Post-check:');
  log.push(`  @pearzen.sm remaining: ${smRemain.length}`);
  log.push(`  @pearzen.cafe remaining: ${cafeRemain.length}`);
  log.push(`  @pearzen.local remaining: ${guardRemain.length}`);
  log.push(`  @portal.pearzen.local remaining: ${portalRemain.length}`);
  for (const row of hoRows ?? []) {
    const candidates = [row.work_email, row.portal_auth_email].filter(Boolean);
    const found = candidates.find((e) => afterUsers.some((u) => normEmail(u.email) === normEmail(e)));
    log.push(`  HO ${row.work_email}: auth ${found ? found : 'MISSING (check work_email fallback)'}`);
  }

  const gatePass =
    smRemain.length === 0 &&
    cafeRemain.length === 0 &&
    guardRemain.length === 0 &&
    execAuthOk &&
    portalRemain.every((u) => {
      const e = normEmail(u.email);
      return preserve.has(e);
    }) &&
    failed === 0;

  log.push('', `Deleted: ${dryRun ? 0 : deleted}`);
  log.push(`Failed: ${failed}`);
  log.push(`GATE: ${gatePass ? 'PASS' : 'FAIL'}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, 'r-10-auth-purge-log.txt');
  writeFileSync(outPath, `${log.join('\n')}\n`);

  if (!gatePass && !dryRun) {
    console.error('\n✗ R-10 gate FAIL');
    process.exit(1);
  }

  console.log(
    `\n${dryRun ? 'Dry-run' : '✓ R-10'} — ${dryRun ? `would delete ${toDelete.length}` : `deleted ${deleted}`}, auth users now ${afterUsers.length}`,
  );
  console.log(`Evidence: ${outPath.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
