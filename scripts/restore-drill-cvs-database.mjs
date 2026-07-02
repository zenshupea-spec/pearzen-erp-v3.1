#!/usr/bin/env node
/**
 * R-INFRA-01 — monthly restore drill for CVS logical database dumps.
 *
 * Downloads the latest gzip dump, verifies integrity, and checks for expected SQL header.
 * Does NOT apply the dump to production — use a staging project for full restore tests.
 *
 * Run: npm run restore-drill:cvs-database
 * Schedule: first Monday monthly (see docs/runbooks/cvs-database-recovery.md)
 */

import { createReadStream, createWriteStream, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { createClient } from '@supabase/supabase-js';

import {
  CVS_DATABASE_BACKUP_BUCKET,
  latestBackupFromObjectKeys,
  parseCvsDatabaseBackupObjectKey,
} from './lib/cvs-database-backup.mjs';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const keys = await listBackupObjectKeys(supabase);
  const latestAt = latestBackupFromObjectKeys(keys);
  if (!latestAt) {
    console.error('No logical dumps found — run npm run backup:cvs-database first.');
    process.exit(1);
  }

  const latestKey = keys
    .filter((key) => parseCvsDatabaseBackupObjectKey(key)?.getTime() === latestAt.getTime())
    .sort()
    .at(-1);

  console.log(`\nRestore drill — verifying ${latestKey}\n`);

  const { data, error } = await supabase.storage
    .from(CVS_DATABASE_BACKUP_BUCKET)
    .download(latestKey);
  if (error || !data) {
    console.error(`Download failed: ${error?.message ?? 'empty body'}`);
    process.exit(1);
  }

  const gzPath = join(ROOT, '.tmp-cvs-restore-drill.sql.gz');
  const sqlPath = join(ROOT, '.tmp-cvs-restore-drill.sql');
  const buffer = Buffer.from(await data.arrayBuffer());
  writeFileSync(gzPath, buffer);

  const gunzipTest = spawnSync('gzip', ['-t', gzPath], { encoding: 'utf8' });
  if (gunzipTest.status !== 0) {
    console.error('gzip integrity check failed:', gunzipTest.stderr);
    process.exit(1);
  }
  console.log('  ✓ gzip integrity OK');

  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(sqlPath));

  const head = spawnSync('head', ['-n', '40', sqlPath], { encoding: 'utf8' });
  const sample = head.stdout ?? '';
  const markers = ['PostgreSQL database dump', 'CREATE TABLE', 'SET '];
  const found = markers.filter((m) => sample.includes(m));
  if (found.length < 2) {
    console.error('  ✗ Dump does not look like pg_dump SQL output');
    console.error(sample.slice(0, 500));
    process.exit(1);
  }
  console.log(`  ✓ SQL header markers: ${found.join(', ')}`);

  unlinkSync(gzPath);
  unlinkSync(sqlPath);

  console.log('\nDrill passed. Record AKSD sign-off in docs/runbooks/cvs-database-recovery.md.\n');
  console.log('Full restore test: apply dump to a staging Supabase project only.\n');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
