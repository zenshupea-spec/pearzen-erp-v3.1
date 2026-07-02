#!/usr/bin/env node
/**
 * MD Portal Step 15 — send a test OTP email via Resend (CVS MD inbox).
 *
 * Usage:
 *   npm run test:cvs-portal-otp-email
 *   npm run test:cvs-portal-otp-email -- --to susil@classicventure.com
 *   npm run test:cvs-portal-otp-email -- --dry-run
 *
 * Requires RESEND_API_KEY in .env.seed.tmp (or apps/back-office/.env.local).
 * Evidence: audit-evidence/cvs/md-portal-resend-test.json
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/md-portal-resend-test.json');
const DEFAULT_TO = 'susil@classicventure.com';
const DEFAULT_FROM =
  process.env.PORTAL_OTP_EMAIL_FROM?.trim() ||
  process.env.PORTAL_EMAIL_FROM?.trim() ||
  'Classic Venture Security <support@pearzen.tech>';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const toFlag = args.find((arg, i) => arg === '--to' && args[i + 1]);
const recipient = toFlag ? args[args.indexOf('--to') + 1] : DEFAULT_TO;

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

async function main() {
  loadEnv();

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.PORTAL_OTP_EMAIL_FROM?.trim() ||
    process.env.PORTAL_EMAIL_FROM?.trim() ||
    DEFAULT_FROM;

  const report = {
    capturedAt: new Date().toISOString(),
    step: 'MD_PORTAL_IMPLEMENTATION_STEPS — Step 15',
    dryRun,
    recipient,
    from,
    hasResendApiKey: Boolean(apiKey),
    portalOtpEmailFrom: process.env.PORTAL_OTP_EMAIL_FROM?.trim() || null,
    portalEmailFrom: process.env.PORTAL_EMAIL_FROM?.trim() || null,
    ok: false,
    resendMessageId: null,
    error: null,
  };

  console.log('\nCVS MD Portal — Resend OTP test\n');
  console.log(`  To:   ${recipient}`);
  console.log(`  From: ${from}`);

  if (!apiKey) {
    report.error = 'RESEND_API_KEY is not configured locally.';
    writeEvidence(report);
    console.error('\n✗ Missing RESEND_API_KEY — set in .env.seed.tmp or Vercel production env.');
    process.exit(1);
  }

  if (dryRun) {
    report.ok = true;
    report.error = 'dry-run — no email sent';
    writeEvidence(report);
    console.log('\n✓ Dry run — Resend key present, would send test email');
    return;
  }

  const otp = String(Math.floor(100_000 + Math.random() * 900_000));
  const signInUrl = 'https://md.cvshq.pearzen.tech/login/md';
  const subject = 'MD Portal — your sign-in code (Step 15 test)';
  const text = [
    'Hello AKSD Perera,',
    '',
    'This is a Step 15 Resend delivery test for the MD Portal.',
    '',
    `Test code: ${otp}`,
    '',
    'This 6-digit code is for delivery verification only — do not use to sign in.',
    '',
    `Sign in at: ${signInUrl}`,
    '',
    '— Classic Venture Security',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text,
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      report.error = bodyText || `Resend HTTP ${response.status}`;
      writeEvidence(report);
      console.error(`\n✗ Resend failed (${response.status}):`);
      console.error(bodyText);
      process.exit(1);
    }

    const json = JSON.parse(bodyText);
    report.ok = true;
    report.resendMessageId = json.id ?? null;
    writeEvidence(report);
    console.log(`\n✓ Test email sent (Resend id: ${json.id ?? 'unknown'})`);
    console.log(`  Evidence: ${EVIDENCE_PATH}`);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    writeEvidence(report);
    console.error('\n✗', report.error);
    process.exit(1);
  }
}

function writeEvidence(report) {
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
