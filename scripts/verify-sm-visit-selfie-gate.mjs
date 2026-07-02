/**
 * Step 15 smoke: SM visit log blocks insert when selfie upload fails.
 * Run: node scripts/verify-sm-visit-selfie-gate.mjs
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

const src = readFileSync(join(root, 'apps/sm-pwa/app/(portal)/visit/actions.ts'), 'utf8');

if (!src.includes('if (!selfiePhoto)')) {
  fail('Requires selfie photo before logging visit');
} else {
  pass('Requires selfie photo before logging visit');
}

if (!src.includes('if (!selfieUpload.ok)')) {
  fail('Blocks visit insert when selfie upload fails');
} else {
  pass('Blocks visit insert when selfie upload fails');
}

if (src.includes('photo_url: photoUrl') || src.includes('photo_url: null')) {
  fail('No nullable photo_url insert path');
} else {
  pass('Visit insert always uses uploaded photo ref');
}

if (!src.includes('createSupabaseServiceClient')) {
  fail('Selfie upload uses service client');
} else {
  pass('Selfie upload uses service client');
}

if (!src.includes('Visit selfie could not be read')) {
  fail('Clear error when selfie decode fails');
} else {
  pass('Clear error when selfie decode fails');
}

if (!src.includes('Failed to upload visit selfie')) {
  fail('Clear error when storage upload fails');
} else {
  pass('Clear error when storage upload fails');
}

console.log('\nSM visit selfie gate smoke (Step 15)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
