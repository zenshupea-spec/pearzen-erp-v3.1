#!/usr/bin/env node
/**
 * R-INFRA-01 — audit CVS database backup posture (PITR vs logical dumps).
 *
 * Run: npm run audit:cvs-database-backups
 * Exit 1 when payroll-grade backup posture is not met.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

import {
  assessCvsDatabaseBackupPosture,
  CVS_DATABASE_BACKUP_BUCKET,
  CVS_SUPABASE_ORG_ID,
  CVS_SUPABASE_PROJECT_REF,
  latestBackupFromObjectKeys,
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

async function managementFetch(path) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) return null;

  const res = await fetch(`https://api.supabase.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${path}: ${res.status} ${text}`);
  }
  return res.json();
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
        return [];
      }
      throw new Error(`Storage list failed: ${error.message}`);
    }

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

  const projectRef =
    process.env.CVS_SUPABASE_PROJECT_REF?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
    CVS_SUPABASE_PROJECT_REF;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`\nCVS database backup audit — project ${projectRef}\n`);

  let orgPlan = 'unknown';
  let pitrEnabled = false;

  const org = await managementFetch(`/v1/organizations/${CVS_SUPABASE_ORG_ID}`);
  if (org) {
    orgPlan = org.plan ?? 'unknown';
    console.log(`  Org ${CVS_SUPABASE_ORG_ID}: plan=${orgPlan}`);
  } else {
    console.log('  ⚠ SUPABASE_ACCESS_TOKEN not set — skipping org/PITR API checks');
  }

  const backups = await managementFetch(`/v1/projects/${projectRef}/database/backups`);
  if (backups) {
    pitrEnabled = Boolean(backups.pitr_enabled);
    const scheduled = backups.scheduled_backups ?? backups.backups ?? [];
    console.log(`  PITR enabled: ${pitrEnabled}`);
    console.log(`  Scheduled backups listed: ${Array.isArray(scheduled) ? scheduled.length : 'n/a'}`);
  }

  let latestLogicalBackupAt = null;
  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);
    const keys = await listBackupObjectKeys(supabase);
    latestLogicalBackupAt = latestBackupFromObjectKeys(keys);
    console.log(`  Logical dumps in storage: ${keys.length}`);
    if (latestLogicalBackupAt) {
      console.log(`  Latest logical dump: ${latestLogicalBackupAt.toISOString()}`);
    } else {
      console.log('  Latest logical dump: none');
    }
  } else {
    console.log('  ⚠ Supabase URL/service role missing — skipping storage dump check');
  }

  const assessment = assessCvsDatabaseBackupPosture({
    orgPlan,
    pitrEnabled,
    latestLogicalBackupAt,
  });

  console.log(`\n  Path: ${assessment.path}`);
  for (const reason of assessment.reasons) {
    console.log(`  · ${reason}`);
  }

  if (assessment.compliant) {
    console.log('\n✓ Backup posture OK for current tier.\n');
    return;
  }

  console.log('\n✗ Backup posture FAIL — see docs/runbooks/cvs-database-recovery.md\n');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
