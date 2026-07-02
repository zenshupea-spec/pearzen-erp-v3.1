/**
 * Step 16 smoke: café front check-in/out store private bucket storage refs.
 * Run: node scripts/verify-cafe-front-selfie-storage-ref.mjs
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

const cafeFront = readFileSync(
  join(root, 'apps/back-office/app/cafe-front/actions.ts'),
  'utf8',
);
const cafeRoster = readFileSync(
  join(root, 'apps/back-office/app/hr/cafe-roster/actions.ts'),
  'utf8',
);

if (cafeFront.includes('getPublicUrl')) {
  fail('Café front actions no longer use getPublicUrl for selfies');
} else {
  pass('Café front actions no longer use getPublicUrl for selfies');
}

if (
  !cafeFront.includes('formatVerificationPhotoStorageRef') ||
  !cafeFront.includes('ATTENDANCE_SELFIES_BUCKET')
) {
  fail('Café front uses storage:// refs for attendance selfies');
} else {
  pass('Café front uses storage:// refs for attendance selfies');
}

if (!cafeFront.includes('checkout_selfie_url: photoRef')) {
  fail('Checkout selfie stored as storage ref');
} else {
  pass('Checkout selfie stored as storage ref');
}

if (!cafeRoster.includes('signVerificationPhotoRef')) {
  fail('HR café roster signs selfie URLs for display');
} else {
  pass('HR café roster signs selfie URLs for display');
}

console.log('\nCafé front selfie storage ref smoke (Step 16)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
