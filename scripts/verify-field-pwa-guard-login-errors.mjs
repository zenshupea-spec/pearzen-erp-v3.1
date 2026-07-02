/**
 * Step 22 smoke: Field PWA guard login surfaces actionable errors on the form.
 * Run: node scripts/verify-field-pwa-guard-login-errors.mjs
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

const loginActions = readFileSync(join(root, 'apps/field-pwa/app/login/actions.ts'), 'utf8');
const loginForm = readFileSync(join(root, 'apps/field-pwa/app/login/FieldLoginForm.tsx'), 'utf8');
const guardAuth = readFileSync(join(root, 'apps/field-pwa/lib/guard-auth.ts'), 'utf8');
const empLogin = readFileSync(join(root, 'apps/field-pwa/app/api/auth/emp-login/route.ts'), 'utf8');

if (!loginActions.includes('EPF number not found on the master nominal roll')) {
  fail('Unknown EPF returns clear MNR message');
} else {
  pass('Unknown EPF returns clear MNR message');
}

if (!loginActions.includes('if (!signIn.ok)')) {
  fail('authenticateGuard forwards sign-in failure');
} else {
  pass('authenticateGuard forwards sign-in failure');
}

if (!guardAuth.includes('formatGuardProvisionError')) {
  fail('Provision failures mapped to actionable copy');
} else {
  pass('Provision failures mapped to actionable copy');
}

if (!guardAuth.includes('formatGuardSignInError')) {
  fail('Sign-in failures mapped to actionable copy');
} else {
  pass('Sign-in failures mapped to actionable copy');
}

if (guardAuth.includes('EPF not found? Contact HR')) {
  fail('Misleading EPF-not-found sign-in message removed');
} else {
  pass('Misleading EPF-not-found sign-in message removed');
}

if (!guardAuth.includes('resolveFieldPwaAuthPassword')) {
  fail('Missing FIELD_PWA_AUTH_PASSWORD handled without throw');
} else {
  pass('Missing FIELD_PWA_AUTH_PASSWORD handled without throw');
}

if (!loginForm.includes('setErrorMsg(result.error)')) {
  fail('FieldLoginForm displays server error message');
} else {
  pass('FieldLoginForm displays server error message');
}

if (!loginForm.includes('Sign-in failed. Check your EPF')) {
  fail('FieldLoginForm fallback error message');
} else {
  pass('FieldLoginForm fallback error message');
}

if (!empLogin.includes('error: signIn.error')) {
  fail('emp-login API returns sign-in error text');
} else {
  pass('emp-login API returns sign-in error text');
}

console.log('\nField PWA guard login errors smoke (Step 22)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
