/**
 * Step 20 smoke: Field PWA blocks attendance insert when selfie upload fails.
 * Run: node scripts/verify-field-pwa-checkin-selfie-gate.mjs
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

const src = readFileSync(join(root, 'apps/field-pwa/app/actions.ts'), 'utf8');

if (!src.includes('function guardSelfieRequired')) {
  fail('Selfie required helper for GPS/NFC verification modes');
} else {
  pass('Selfie required helper for GPS/NFC verification modes');
}

if (!src.includes("verificationMode === 'B'") || !src.includes("verificationMode === 'C'")) {
  fail('Modes B and C require selfie');
} else {
  pass('Modes B and C require selfie');
}

if (!src.includes('Live selfie is required')) {
  fail('Clear error when selfie missing');
} else {
  pass('Clear error when selfie missing');
}

if (!src.includes('uploadGuardAttendanceSelfie')) {
  fail('Dedicated selfie upload helper');
} else {
  pass('Dedicated selfie upload helper');
}

if (!src.includes('if (!selfieUpload.ok)')) {
  fail('Blocks attendance insert when selfie upload fails');
} else {
  pass('Blocks attendance insert when selfie upload fails');
}

if (!src.includes('Attendance selfie could not be read')) {
  fail('Clear error when selfie decode fails');
} else {
  pass('Clear error when selfie decode fails');
}

if (!src.includes('Failed to upload attendance selfie')) {
  fail('Clear error when storage upload fails');
} else {
  pass('Clear error when storage upload fails');
}

if (src.includes('if (!uploadError)')) {
  fail('Silent selfie upload failure path removed');
} else {
  pass('Silent selfie upload failure path removed');
}

const insertIdx = src.indexOf("from('attendance_logs').insert");
const uploadGateIdx = src.indexOf('if (!selfieUpload.ok)');
if (insertIdx < uploadGateIdx) {
  fail('Selfie gate runs before attendance_logs insert');
} else {
  pass('Selfie gate runs before attendance_logs insert');
}

console.log('\nField PWA check-in selfie gate smoke (Step 20)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
