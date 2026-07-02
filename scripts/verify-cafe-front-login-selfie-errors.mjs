/**
 * Step 17 smoke: Café front login returns actionable errors when selfie capture/upload fails.
 * Run: node scripts/verify-cafe-front-login-selfie-errors.mjs
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

const selfieLib = readFileSync(join(root, 'apps/back-office/lib/cafe-login-selfie.ts'), 'utf8');
const actions = readFileSync(join(root, 'apps/back-office/app/cafe-front/actions.ts'), 'utf8');

if (!selfieLib.includes('validateCafeLoginSelfieCapture')) {
  fail('Selfie validation helper exists');
} else {
  pass('Selfie validation helper exists');
}

if (!selfieLib.includes('Face snapshot could not be read')) {
  fail('Decode failure message');
} else {
  pass('Decode failure message');
}

if (!selfieLib.includes('too small or blank')) {
  fail('Too-small capture message');
} else {
  pass('Too-small capture message');
}

if (!selfieLib.includes('selfieStorageErrorMessage')) {
  fail('Storage-specific error mapping');
} else {
  pass('Storage-specific error mapping');
}

if (!actions.includes('validateCafeLoginSelfieCapture(faceSnapshot)')) {
  fail('Login validates selfie before sign-in');
} else {
  pass('Login validates selfie before sign-in');
}

const validateBeforeSignIn =
  actions.indexOf('validateCafeLoginSelfieCapture(faceSnapshot)') <
  actions.indexOf('signInWithPassword');
if (!validateBeforeSignIn) {
  fail('Selfie validation runs before signInWithPassword');
} else {
  pass('Selfie validation runs before signInWithPassword');
}

if (!actions.includes('uploadCafeLoginSelfieDecoded')) {
  fail('Login uploads decoded selfie buffer');
} else {
  pass('Login uploads decoded selfie buffer');
}

if (!actions.includes('if (!selfieUpload.ok)')) {
  fail('Sign-out rollback on upload failure');
} else {
  pass('Sign-out rollback on upload failure');
}

if (actions.includes('Could not save face snapshot. Retake the photo and try again.')) {
  fail('Generic selfie error removed from login action');
} else {
  pass('Generic selfie error removed from login action');
}

console.log('\nCafé front login selfie errors smoke (Step 17)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
