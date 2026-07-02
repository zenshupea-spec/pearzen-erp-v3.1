/**
 * Step 12 smoke: café roster actions return { ok: false } on session expiry (no throw).
 * Run: node scripts/verify-cafe-roster-session-gate.mjs
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
let failed = false;

function pass(label) {
  checks.push(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failed = true;
  checks.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function staticChecks() {
  const actions = read('apps/back-office/app/hr/cafe-roster/actions.ts');
  const client = read('apps/back-office/app/hr/cafe-roster/CafeRosterClient.tsx');
  const panel = read('apps/back-office/app/hr/cafe-roster/CafeCheckinVerificationPanel.tsx');

  if (actions.includes("throw new Error('You must be signed in.')")) {
    fail('requireHrEditor no longer throws on missing user');
  } else {
    pass('requireHrEditor does not throw on missing user');
  }

  if (!actions.includes('HrEditorGate') || !actions.includes('if (!gate.ok) return { ok: false')) {
    fail('Mutations gate on requireHrEditor result');
  } else {
    pass('Mutations return { ok: false } when HR editor gate fails');
  }

  if (!actions.includes('SESSION_EXPIRED_MESSAGE')) {
    fail('Session expired message constant');
  } else {
    pass('Session expired message for inline UI');
  }

  for (const fn of ['setCafeRosterShift', 'reviewCafeLeaveRequest', 'reviewCafeCheckinVerification']) {
    if (!actions.includes(`export async function ${fn}`)) {
      fail(`${fn} exported`);
      continue;
    }
    const slice = actions.slice(actions.indexOf(`export async function ${fn}`));
    if (!slice.includes('Promise<{ ok: boolean')) {
      fail(`${fn} returns { ok: boolean }`);
    } else {
      pass(`${fn} returns { ok: boolean }`);
    }
  }

  if (!client.includes('setActionError') || !client.includes('try {')) {
    fail('CafeRosterClient try/catch around roster actions');
  } else {
    pass('CafeRosterClient try/catch around roster actions');
  }

  if (!panel.includes('setError') || !panel.includes('try {')) {
    fail('CafeCheckinVerificationPanel try/catch around actions');
  } else {
    pass('CafeCheckinVerificationPanel try/catch around actions');
  }
}

staticChecks();

console.log('\nCafé roster session gate smoke (Step 12)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
