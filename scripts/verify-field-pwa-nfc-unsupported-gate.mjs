/**
 * Step 21 smoke: Field PWA NFC unsupported shows inline error instead of throwing.
 * Run: node scripts/verify-field-pwa-nfc-unsupported-gate.mjs
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

const nfcLib = readFileSync(join(root, 'apps/field-pwa/lib/location-verification.ts'), 'utf8');
const checkIn = readFileSync(join(root, 'apps/field-pwa/app/components/CheckInButton.tsx'), 'utf8');

if (!nfcLib.includes('export type NfcScanResult')) {
  fail('NfcScanResult result type');
} else {
  pass('NfcScanResult result type');
}

if (!nfcLib.includes('export function isNfcScanSupported')) {
  fail('isNfcScanSupported helper');
} else {
  pass('isNfcScanSupported helper');
}

if (nfcLib.includes('throw new Error')) {
  fail('scanSiteNFC does not throw');
} else {
  pass('scanSiteNFC does not throw');
}

if (!nfcLib.includes('ok: false')) {
  fail('scanSiteNFC returns ok: false on failure');
} else {
  pass('scanSiteNFC returns ok: false on failure');
}

if (!checkIn.includes('isNfcScanSupported')) {
  fail('CheckInButton probes NFC support before scanning');
} else {
  pass('CheckInButton probes NFC support before scanning');
}

if (!checkIn.includes('if (!scan.ok)')) {
  fail('CheckInButton handles scanSiteNFC failure result');
} else {
  pass('CheckInButton handles scanSiteNFC failure result');
}

if (!checkIn.includes('verificationError')) {
  fail('Inline verification error state');
} else {
  pass('Inline verification error state');
}

if (!checkIn.includes('setVerificationError')) {
  fail('Sets inline verification error message');
} else {
  pass('Sets inline verification error message');
}

const nfcCatchIdx = checkIn.indexOf('NFC scan failed', checkIn.indexOf('catch'));
if (nfcCatchIdx !== -1) {
  fail('NFC catch + alert path removed from CheckInButton');
} else {
  pass('NFC catch + alert path removed from CheckInButton');
}

console.log('\nField PWA NFC unsupported gate smoke (Step 21)\n');
console.log(checks.join('\n'));
console.log(failed ? '\n❌ FAILED\n' : '\n✅ PASSED\n');
process.exit(failed ? 1 : 0);
