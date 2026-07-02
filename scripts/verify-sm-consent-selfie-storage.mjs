/**
 * Step 14 smoke: SM consent selfie storage buckets exist.
 * Run: node scripts/verify-sm-consent-selfie-storage.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKETS = ['uniform-consent-selfies', 'penalty-consent-selfies'];

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

loadEnv();

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function staticChecks() {
  const migration = readFileSync(
    join(root, 'packages/supabase/migrations/20260629120000_sm_consent_selfie_storage.sql'),
    'utf8',
  );
  const uniform = readFileSync(join(root, 'apps/sm-pwa/app/(portal)/uniform/actions.ts'), 'utf8');
  const penalty = readFileSync(join(root, 'apps/sm-pwa/app/(portal)/penalty/actions.ts'), 'utf8');
  const constants = readFileSync(join(root, 'packages/supabase/sm-consent-selfie-storage.ts'), 'utf8');

  for (const bucket of BUCKETS) {
    if (!migration.includes(`'${bucket}'`)) {
      fail(`Migration defines ${bucket}`);
    } else {
      pass(`Migration defines ${bucket}`);
    }
  }

  if (!constants.includes('UNIFORM_CONSENT_SELFIES_BUCKET')) {
    fail('Shared bucket constants module');
  } else {
    pass('Shared bucket constants module');
  }

  if (!uniform.includes('UNIFORM_CONSENT_SELFIES_BUCKET')) {
    fail('Uniform action uses shared bucket constant');
  } else {
    pass('Uniform action uses shared bucket constant');
  }

  if (!penalty.includes('PENALTY_CONSENT_SELFIES_BUCKET')) {
    fail('Penalty action uses shared bucket constant');
  } else {
    pass('Penalty action uses shared bucket constant');
  }

  if (!penalty.includes('createSupabaseServiceClient')) {
    fail('Penalty upload uses service client');
  } else {
    pass('Penalty upload uses service client');
  }
}

async function remoteBucketCheck() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) {
    checks.push('  · Skipping remote bucket probe — Supabase env not configured');
    return;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tinyJpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
  ]);

  for (const bucket of BUCKETS) {
    const path = `smoke-verify/${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, tinyJpeg, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      fail(`Remote upload to ${bucket}`, uploadError.message);
      continue;
    }

    pass(`Remote upload round-trip to ${bucket}`);
    await admin.storage.from(bucket).remove([path]);
  }
}

staticChecks();
await remoteBucketCheck();

console.log('\nSM consent selfie storage smoke (Step 14)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
