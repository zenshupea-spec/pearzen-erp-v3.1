/**
 * Step 13 smoke: SM PWA server actions return session error instead of redirect throw.
 * Run: node scripts/verify-sm-pwa-session-gate.mjs
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
  const assignments = read('apps/sm-pwa/lib/sm-assignments.ts');
  const visit = read('apps/sm-pwa/app/(portal)/visit/actions.ts');
  const penalty = read('apps/sm-pwa/app/(portal)/penalty/actions.ts');
  const guards = read('apps/sm-pwa/app/(portal)/attendance/guards/actions.ts');
  const confirm = read('apps/sm-pwa/app/(portal)/attendance/confirm/actions.ts');

  if (!assignments.includes('resolveSmSessionGate')) {
    fail('resolveSmSessionGate exported');
  } else {
    pass('resolveSmSessionGate for useTransition-safe actions');
  }

  if (assignments.includes('catch') && assignments.includes("redirect('/login')")) {
    const gateFn = assignments.slice(
      assignments.indexOf('resolveSmSessionGate'),
      assignments.indexOf('resolveSmSessionEpf'),
    );
    if (gateFn.includes("redirect('/login')")) {
      fail('resolveSmSessionGate must not redirect');
    } else {
      pass('resolveSmSessionGate does not redirect');
    }
  }

  if (!assignments.includes('SM_SESSION_EXPIRED_MESSAGE')) {
    fail('SM_SESSION_EXPIRED_MESSAGE constant');
  } else {
    pass('SM_SESSION_EXPIRED_MESSAGE for inline UI');
  }

  for (const [name, src] of [
    ['logVisitAction', visit],
    ['issuePenaltyAction', penalty],
    ['submitGuardAttendanceAction', guards],
    ['confirmShiftAction', confirm],
  ]) {
    if (!src.includes('resolveSmSessionGate')) {
      fail(`${name} uses resolveSmSessionGate`);
      continue;
    }
    if (!src.includes('if (!gate.ok)') && !src.includes("if (!gate.ok)")) {
      fail(`${name} checks gate.ok`);
    } else {
      pass(`${name} returns error when session expired`);
    }
  }
}

staticChecks();

console.log('\nSM PWA session gate smoke (Step 13)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
