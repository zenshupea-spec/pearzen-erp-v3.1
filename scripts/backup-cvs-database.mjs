#!/usr/bin/env node
/**
 * R-INFRA-01 — nightly logical dump of CVS production Postgres to off-site storage.
 *
 * Requires pg_dump (postgresql-client) and one of:
 *   DATABASE_URL / SUPABASE_DB_URL (direct connection recommended)
 *   SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL
 *   PG_DUMP or bundled .tools/pgsql/bin/pg_dump (npm run bootstrap:pg-dump-client)
 *
 * Upload target: private Supabase Storage bucket `cvs-database-backups`
 * Optional mirror: BACKUP_LOCAL_DIR (operator syncs to external S3/off-site)
 *
 * Run: npm run backup:cvs-database
 * Schedule: GitHub Actions `.github/workflows/cvs-database-backup.yml` or cron on ops host
 */

import { createReadStream, createWriteStream, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { createClient } from '@supabase/supabase-js';

import {
  buildCvsDatabaseBackupObjectKey,
  cvsDatabaseBackupKeysToPrune,
  CVS_DATABASE_BACKUP_BUCKET,
} from './lib/cvs-database-backup.mjs';
import { resolveCvsDirectDbUrl } from './lib/cvs-database-connection.mjs';
import { resolvePgDumpPath } from './lib/resolve-pg-dump.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
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

function resolveDirectDbUrl() {
  return resolveCvsDirectDbUrl();
}

async function gzipFile(sourcePath, destPath) {
  await pipeline(createReadStream(sourcePath), createGzip(), createWriteStream(destPath));
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
    if (error) throw new Error(`Storage list failed: ${error.message}`);

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        keys.push(path);
      } else {
        queue.push(path);
      }
    }
  }

  return keys.filter((key) => key.endsWith('.sql.gz'));
}

async function main() {
  loadEnv();

  const dbUrl = resolveDirectDbUrl();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dbUrl) {
    console.error(
      'Missing DATABASE_URL, CVS_DATABASE_URL, or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL for pg_dump.',
    );
    process.exit(1);
  }
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for upload.');
    process.exit(1);
  }

  const pgDumpBin = resolvePgDumpPath();
  if (!pgDumpBin) {
    console.error('pg_dump not found — install postgresql-client or run: npm run bootstrap:pg-dump-client');
    process.exit(1);
  }

  const tmpSql = join(ROOT, '.tmp-cvs-backup.sql');
  const tmpGz = `${tmpSql}.gz`;
  const objectKey = buildCvsDatabaseBackupObjectKey();

  console.log(`Dumping CVS database → ${objectKey}…`);

  const dump = spawnSync(
    pgDumpBin,
    ['--no-owner', '--no-acl', '--format=plain', `--file=${tmpSql}`, dbUrl],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 },
  );

  if (dump.status !== 0) {
    console.error(dump.stderr || dump.stdout || 'pg_dump failed');
    process.exit(dump.status ?? 1);
  }

  await gzipFile(tmpSql, tmpGz);
  unlinkSync(tmpSql);

  const localDir = process.env.BACKUP_LOCAL_DIR?.trim();
  if (localDir) {
    mkdirSync(localDir, { recursive: true });
    const localPath = join(localDir, objectKey.split('/').pop());
    await pipeline(createReadStream(tmpGz), createWriteStream(localPath));
    console.log(`  ✓ Mirrored to ${localPath}`);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const body = readFileSync(tmpGz);

  const { error: uploadError } = await supabase.storage
    .from(CVS_DATABASE_BACKUP_BUCKET)
    .upload(objectKey, body, {
      contentType: 'application/gzip',
      upsert: false,
    });

  if (uploadError) {
    console.error(`Upload failed: ${uploadError.message}`);
    console.error('Apply migration 20260624100000_cvs_database_backup_storage.sql on remote first.');
    process.exit(1);
  }

  console.log(`  ✓ Uploaded ${(body.length / 1024 / 1024).toFixed(2)} MB to ${objectKey}`);

  unlinkSync(tmpGz);

  const existingKeys = await listBackupObjectKeys(supabase);
  const toPrune = cvsDatabaseBackupKeysToPrune(existingKeys);
  for (const key of toPrune) {
    const { error } = await supabase.storage.from(CVS_DATABASE_BACKUP_BUCKET).remove([key]);
    if (error) {
      console.warn(`  ⚠ Could not prune ${key}: ${error.message}`);
    } else {
      console.log(`  ✓ Pruned ${key}`);
    }
  }

  console.log('\nDone. Verify: npm run audit:cvs-database-backups');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
