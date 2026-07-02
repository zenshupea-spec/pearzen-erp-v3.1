/**
 * Step 25 smoke: database.generated.ts includes portal auth columns after regeneration.
 * Run: node scripts/verify-supabase-types-gate.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const generated = readFileSync(join(root, 'packages/supabase/database.generated.ts'), 'utf8');

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function expectInSmPortalAuthBlock(needle) {
  const start = generated.indexOf('sm_portal_auth: {');
  const end = generated.indexOf('sm_uniform_requests:', start);
  const block = start >= 0 && end > start ? generated.slice(start, end) : '';
  if (!block.includes(needle)) {
    fail(`sm_portal_auth includes ${needle}`);
    return false;
  }
  pass(`sm_portal_auth includes ${needle}`);
  return true;
}

function expectTable(table) {
  if (!generated.includes(`${table}: {`)) {
    fail(`database.generated.ts defines ${table}`);
    return false;
  }
  pass(`database.generated.ts defines ${table}`);
  return true;
}

if (!generated.includes('npm run types:supabase')) {
  fail('Regenerate header references npm run types:supabase');
} else {
  pass('Regenerate header references npm run types:supabase');
}

expectInSmPortalAuthBlock('current_otp_hash');
expectInSmPortalAuthBlock('otp_expires_at');
expectInSmPortalAuthBlock('last_login_selfie_url');

expectTable('cafe_portal_auth');
if (generated.includes('cafe_portal_auth:')) {
  const cafeStart = generated.indexOf('cafe_portal_auth: {');
  const cafeEnd = generated.indexOf('cafe_pos_voids:', cafeStart);
  const cafeBlock = generated.slice(cafeStart, cafeEnd);
  for (const col of ['otp_expires_at', 'last_login_selfie_url']) {
    if (!cafeBlock.includes(col)) fail(`cafe_portal_auth includes ${col}`);
    else pass(`cafe_portal_auth includes ${col}`);
  }
}

expectTable('shalom_portal_auth');
if (generated.includes('shalom_portal_auth:')) {
  const shalomStart = generated.indexOf('shalom_portal_auth: {');
  const shalomEnd = generated.indexOf('shalom_properties:', shalomStart);
  const shalomBlock = generated.slice(shalomStart, shalomEnd);
  for (const col of ['current_otp_hash', 'otp_expires_at']) {
    if (!shalomBlock.includes(col)) fail(`shalom_portal_auth includes ${col}`);
    else pass(`shalom_portal_auth includes ${col}`);
  }
}

if (!generated.includes('penalty_catalog_id')) {
  fail('sm_guard_penalties includes penalty_catalog_id');
} else {
  pass('sm_guard_penalties includes penalty_catalog_id');
}

if (!generated.includes('recovery_email')) {
  fail('head_office_portal_auth includes recovery_email');
} else {
  pass('head_office_portal_auth includes recovery_email');
}

console.log('\nSupabase types gate smoke (Step 25)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
