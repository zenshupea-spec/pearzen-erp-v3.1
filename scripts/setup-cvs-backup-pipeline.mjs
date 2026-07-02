#!/usr/bin/env node
/**
 * H-3 — verify CVS backup pipeline prerequisites and run first dump when possible.
 *
 * Usage:
 *   npm run setup:cvs-backup-pipeline          # check + backup if pg_dump available
 *   npm run setup:cvs-backup-pipeline -- --check-only
 *
 * GitHub Actions (after secrets set):
 *   Actions → CVS database backup → Run workflow
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

import {
  CVS_DATABASE_BACKUP_BUCKET,
  CVS_SUPABASE_PROJECT_REF,
  latestBackupFromObjectKeys,
} from './lib/cvs-database-backup.mjs';
import { resolveCvsDirectDbUrl } from './lib/cvs-database-connection.mjs';
import { pgDumpAvailable } from './lib/resolve-pg-dump.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_DIR = join(ROOT, 'audit-evidence/cvs');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check-only');

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

function resolveDirectDbUrl() {
  return resolveCvsDirectDbUrl();
}

function hasPgDump() {
  return pgDumpAvailable();
}

async function listBackupObjectKeys(supabase) {
  const keys = [];
  const queue = ['cvs'];

  while (queue.length) {
    const prefix = queue.pop();
    const { data, error } = await supabase.storage.from(CVS_DATABASE_BACKUP_BUCKET).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('Bucket')) {
        return { keys: [], bucketMissing: true, error: error.message };
      }
      throw new Error(`Storage list failed: ${error.message}`);
    }

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) keys.push(path);
      else queue.push(path);
    }
  }

  return { keys: keys.filter((k) => k.endsWith('.sql.gz')), bucketMissing: false };
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = resolveDirectDbUrl();
  const pgDumpOk = hasPgDump();

  console.log('\nCVS backup pipeline setup (H-3)\n');

  const checks = {
    supabaseUrl: Boolean(supabaseUrl),
    serviceRoleKey: Boolean(serviceKey),
    databaseUrl: Boolean(dbUrl),
    pgDump: pgDumpOk,
    bucketAccessible: false,
    dumpCount: 0,
    latestDump: null,
  };

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);
    const { keys, bucketMissing, error } = await listBackupObjectKeys(supabase);
    if (bucketMissing) {
      console.log(`  ✗ Storage bucket "${CVS_DATABASE_BACKUP_BUCKET}" missing — apply migration 20260624100000`);
      checks.bucketError = error;
    } else {
      checks.bucketAccessible = true;
      checks.dumpCount = keys.length;
      checks.latestDump = latestBackupFromObjectKeys(keys)?.toISOString() ?? null;
      console.log(`  ✓ Bucket "${CVS_DATABASE_BACKUP_BUCKET}" accessible (${keys.length} dump(s))`);
      if (checks.latestDump) console.log(`    Latest: ${checks.latestDump}`);
    }
  } else {
    console.log('  ✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  console.log(`  ${dbUrl ? '✓' : '✗'} DATABASE_URL / SUPABASE_DB_PASSWORD for pg_dump`);
  console.log(`  ${pgDumpOk ? '✓' : '✗'} pg_dump (${pgDumpOk ? 'available' : 'run npm run bootstrap:pg-dump-client or use GitHub Actions'})`);

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidencePath = join(EVIDENCE_DIR, 'h-3-backup-pipeline-setup.txt');
  const lines = [
    'CVS Handover H-3 — backup pipeline setup',
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'LOCAL CHECKS',
    `  NEXT_PUBLIC_SUPABASE_URL: ${checks.supabaseUrl ? 'set' : 'MISSING'}`,
    `  SUPABASE_SERVICE_ROLE_KEY: ${checks.serviceRoleKey ? 'set' : 'MISSING'}`,
    `  DATABASE_URL (or password): ${checks.databaseUrl ? 'set' : 'MISSING'}`,
    `  pg_dump: ${pgDumpOk ? 'available' : 'NOT IN PATH'}`,
    `  Bucket ${CVS_DATABASE_BACKUP_BUCKET}: ${checks.bucketAccessible ? 'OK' : 'FAIL'}`,
    `  Logical dumps in storage: ${checks.dumpCount}`,
    `  Latest dump: ${checks.latestDump ?? 'none'}`,
    '',
    'GITHUB ACTIONS SECRETS (repo → Settings → Secrets → Actions)',
    '  CVS_DATABASE_URL          — direct postgresql://…@db.ktfgvcrdfbapmefktgjc.supabase.co:5432/postgres',
    '  NEXT_PUBLIC_SUPABASE_URL  — same as production back-office',
    '  SUPABASE_SERVICE_ROLE_KEY — same as production back-office',
    '  SUPABASE_ACCESS_TOKEN     — optional; org/PITR audit in workflow',
    '',
    'TRIGGER FIRST BACKUP',
    '  GitHub → Actions → "CVS database backup" → Run workflow',
    '  Or locally (with pg_dump): npm run backup:cvs-database',
    '',
    'VERIFY',
    '  npm run audit:cvs-database-backups',
    '',
  ];
  writeFileSync(evidencePath, `${lines.join('\n')}\n`);
  console.log(`\n  Evidence: ${evidencePath}`);

  if (!checks.supabaseUrl || !checks.serviceRoleKey || !checks.databaseUrl) {
    console.log('\n✗ Set secrets in .env.seed.tmp then re-run, or configure GitHub Actions secrets.\n');
    process.exit(1);
  }

  if (!checks.bucketAccessible) {
    console.log('\n✗ Storage bucket not ready — apply migration on CVS remote.\n');
    process.exit(1);
  }

  if (checkOnly) {
    console.log('\n--check-only: skipping backup run.\n');
    process.exit(checks.dumpCount > 0 ? 0 : 1);
  }

  if (!pgDumpOk) {
    console.log('\n⚠ pg_dump not installed locally — use GitHub Actions for first backup:');
    console.log('  1. Add GitHub secrets listed in docs/runbooks/cvs-backup-github-setup.md');
    console.log('  2. Actions → CVS database backup → Run workflow');
    console.log('  3. npm run audit:cvs-database-backups\n');
    process.exit(checks.dumpCount > 0 ? 0 : 1);
  }

  if (checks.dumpCount === 0) {
    console.log('\nRunning first logical dump…\n');
    const backup = spawnSync('node', ['scripts/backup-cvs-database.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (backup.status !== 0) process.exit(backup.status ?? 1);

    const audit = spawnSync('node', ['scripts/audit-cvs-database-backups.mjs'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(audit.status ?? 0);
  }

  console.log('\n✓ Pipeline ready — existing dump(s) in storage.\n');
  const audit = spawnSync('npm', ['run', 'audit:cvs-database-backups'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(audit.status ?? 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
