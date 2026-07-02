/**
 * Step 23 smoke: SM penalty insert works after penalty catalog migration.
 * Run: node scripts/verify-sm-penalty-catalog-gate.mjs
 * Apply: npm run db:apply-penalty-catalog
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
  const penaltyActions = readFileSync(
    join(root, 'apps/sm-pwa/app/(portal)/penalty/actions.ts'),
    'utf8',
  );
  const migration = readFileSync(
    join(root, 'packages/supabase/migrations/20260531140000_penalty_catalog_and_consent.sql'),
    'utf8',
  );

  if (!migration.includes('DROP CONSTRAINT IF EXISTS sm_guard_penalties_penalty_type_check')) {
    fail('Migration drops penalty_type enum check');
  } else {
    pass('Migration drops penalty_type enum check');
  }

  if (!migration.includes('penalty_catalog_id')) {
    fail('Migration adds penalty_catalog_id column');
  } else {
    pass('Migration adds penalty_catalog_id column');
  }

  if (!penaltyActions.includes("from('sm_guard_penalties').insert")) {
    fail('issuePenaltyAction inserts sm_guard_penalties row');
  } else {
    pass('issuePenaltyAction inserts sm_guard_penalties row');
  }

  if (!penaltyActions.includes('penalty_catalog_id:')) {
    fail('Insert uses penalty_catalog_id from catalog');
  } else {
    pass('Insert uses penalty_catalog_id from catalog');
  }

  if (!penaltyActions.includes('penalty_type: offenseSummary')) {
    fail('Insert stores catalog offense text in penalty_type');
  } else {
    pass('Insert stores catalog offense text in penalty_type');
  }
}

async function remoteChecks(admin) {
  const { error: penaltySchemaErr } = await admin
    .from('sm_guard_penalties')
    .select('penalty_catalog_id, consent_selfie_url, penalty_type, reason')
    .limit(1);

  if (penaltySchemaErr?.message?.includes('penalty_catalog_id')) {
    fail('sm_guard_penalties.penalty_catalog_id column', penaltySchemaErr.message);
  } else if (penaltySchemaErr?.message?.includes('consent_selfie_url')) {
    fail('sm_guard_penalties.consent_selfie_url column', penaltySchemaErr.message);
  } else if (penaltySchemaErr && penaltySchemaErr.code !== 'PGRST116') {
    fail('sm_guard_penalties schema probe', penaltySchemaErr.message);
  } else {
    pass('sm_guard_penalties has penalty_catalog_id + consent_selfie_url');
  }

  const { error: settingsErr } = await admin
    .from('md_settings')
    .select('penalty_catalog')
    .limit(1);

  if (settingsErr?.message?.includes('penalty_catalog')) {
    fail('md_settings.penalty_catalog column', settingsErr.message);
  } else if (settingsErr && settingsErr.code !== 'PGRST116') {
    fail('md_settings penalty_catalog probe', settingsErr.message);
  } else {
    pass('md_settings has penalty_catalog');
  }

  const testSmEpf = `SMOKE${Date.now().toString().slice(-6)}`;
  const testGuardEpf = `G${Date.now().toString().slice(-5)}`;
  const catalogOffense = 'Sleeping on Post';

  const { data: inserted, error: insertErr } = await admin
    .from('sm_guard_penalties')
    .insert({
      sm_epf: testSmEpf,
      guard_epf: testGuardEpf,
      guard_name: 'Smoke Test Guard',
      penalty_type: catalogOffense,
      penalty_catalog_id: 'p1',
      reason: null,
      deduction_amount: 5000,
      status: 'PENDING',
    })
    .select('id, penalty_type, penalty_catalog_id')
    .single();

  if (insertErr) {
    if (insertErr.message?.includes('penalty_type_check')) {
      fail(
        'Catalog offense insert (enum check still present)',
        'Run npm run db:apply-penalty-catalog',
      );
    } else {
      fail('sm_guard_penalties catalog insert', insertErr.message);
    }
  } else if (inserted?.penalty_type !== catalogOffense || inserted?.penalty_catalog_id !== 'p1') {
    fail('sm_guard_penalties insert read-back');
  } else {
    pass('Catalog offense text inserts without enum constraint');
    await admin.from('sm_guard_penalties').delete().eq('id', inserted.id);
  }

  const { data: settingsRows } = await admin
    .from('md_settings')
    .select('company_id, penalty_catalog')
    .not('penalty_catalog', 'is', null)
    .limit(3);

  const withCatalog = (settingsRows ?? []).filter((row) => {
    const catalog = row.penalty_catalog;
    return Array.isArray(catalog) && catalog.length > 0;
  });

  if (withCatalog.length === 0) {
    checks.push('  · md_settings penalty_catalog empty — seed via MD settings or fixture migration');
  } else {
    pass(`md_settings penalty_catalog populated (${withCatalog.length} tenant row(s))`);
  }
}

async function main() {
  staticChecks();

  if (!supabaseUrl || !serviceKey) {
    fail('Env', 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for remote checks');
  } else {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await remoteChecks(admin);
  }

  console.log('\nSM penalty catalog gate smoke (Step 23)\n');
  console.log(checks.join('\n'));
  if (failed) {
    console.log('\nIf schema checks failed, run: npm run db:apply-penalty-catalog\n');
  }
  console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
