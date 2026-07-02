#!/usr/bin/env node
/**
 * Wire info@pearzen.tech inbound email via Resend + Porkbun MX.
 *
 * Receiving uses Resend (not Porkbun forwarding) so Forge can store threads
 * and reply as info@pearzen.tech. Inbound copies still forward to Gmail.
 *
 * Requires in .env.seed.tmp:
 *   PORKBUN_API_KEY / PORKBUN_SECRET_API_KEY
 *   RESEND_INBOUND_MX_HOST   — copy from Resend → Domains → pearzen.tech → Receiving MX
 *
 * Run: npm run setup:pearzen-contact-email
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';
const INBOX = process.env.FORGE_CONTACT_INBOX?.trim() || 'info@pearzen.tech';
const FORWARD_TO = process.env.FORGE_CONTACT_FORWARD_TO?.trim() || 'zenshupea@gmail.com';
const MX_HOST = process.env.RESEND_INBOUND_MX_HOST?.trim();
const MX_PRIORITY = Number(process.env.RESEND_INBOUND_MX_PRIORITY ?? '10');

function loadEnv() {
  for (const file of ['.env.seed.tmp', '.env.local', '.env']) {
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

async function porkbunFetch(endpoint, body) {
  const apikey = process.env.PORKBUN_API_KEY?.trim();
  const secretapikey = process.env.PORKBUN_SECRET_API_KEY?.trim();
  if (!apikey || !secretapikey) throw new Error('PORKBUN_API_KEY / PORKBUN_SECRET_API_KEY missing');

  const res = await fetch(`https://api.porkbun.com/api/json/v3/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey, secretapikey, ...body }),
  });

  const json = await res.json();
  if (json.status !== 'SUCCESS') {
    throw new Error(`Porkbun ${endpoint}: ${json.message || JSON.stringify(json)}`);
  }
  return json;
}

async function ensureInboundMx() {
  if (!MX_HOST) {
    console.log('  · RESEND_INBOUND_MX_HOST not set — skip MX automation.');
    return false;
  }

  const { records = [] } = await porkbunFetch(`dns/retrieve/${DOMAIN}`, {});
  const exists = records.some(
    (r) =>
      r.type === 'MX' &&
      (r.name === '' || r.name === '@') &&
      String(r.content).toLowerCase() === MX_HOST.toLowerCase(),
  );

  if (exists) {
    console.log(`  · MX already set: @ → ${MX_HOST}`);
    return true;
  }

  await porkbunFetch(`dns/create/${DOMAIN}`, {
    name: '',
    type: 'MX',
    content: MX_HOST,
    prio: MX_PRIORITY,
    ttl: 600,
  });
  console.log(`  ✓ Created MX: @ → ${MX_HOST} (priority ${MX_PRIORITY})`);
  return true;
}

function printManualSteps() {
  const webhookUrl = `https://forge.${DOMAIN}/api/resend/inbound`;

  console.log(`
Pearzen contact email setup (${INBOX})
=====================================

1) Resend — enable receiving on pearzen.tech
   • https://resend.com/domains → pearzen.tech → toggle Receiving ON
   • Copy the MX record value into .env.seed.tmp:
       RESEND_INBOUND_MX_HOST=inbound-smtp.us-east-1.amazonaws.com
     (use the exact value Resend shows for your domain)

2) Porkbun DNS — add Resend MX on the root domain (@)
   • Do NOT also use Porkbun email forwarding for ${INBOX}
     (MX can only point to one mail receiver).
   • Re-run: npm run setup:pearzen-contact-email
     after setting RESEND_INBOUND_MX_HOST to add the MX record via API.

3) Resend webhook
   • https://resend.com/webhooks → Add webhook
   • URL: ${webhookUrl}
   • Event: email.received
   • Copy signing secret to Vercel env:
       RESEND_WEBHOOK_SECRET=whsec_...

4) Vercel env — pearzen-forge-back-office production (webhook host)
   • RESEND_API_KEY=re_...
   • RESEND_WEBHOOK_SECRET=whsec_...   ← required on Forge project (not tenant-only)
   • FORGE_CONTACT_INBOX=${INBOX}
   • FORGE_CONTACT_FORWARD_TO=${FORWARD_TO}
   • FORGE_CONTACT_FROM=Pearzen <info@pearzen.tech>
   • Or run: npm run split:vercel-forge-tenant-env

5) Apply database migration
   • npm run db:apply-forge-contact-inbox

6) Test
   • Email ${INBOX} from an external address
   • Check ${FORWARD_TO} for the forwarded copy
   • Open https://forge.${DOMAIN}/forge/inbox and reply

Gmail copy: every inbound message is auto-forwarded to ${FORWARD_TO}.
Forge replies: sent via Resend as info@pearzen.tech with proper threading headers.
`);
}

async function main() {
  loadEnv();

  console.log(`\nSetting up ${INBOX} contact email…\n`);

  const hasPorkbun =
    Boolean(process.env.PORKBUN_API_KEY?.trim()) &&
    Boolean(process.env.PORKBUN_SECRET_API_KEY?.trim());

  if (hasPorkbun && MX_HOST) {
    console.log('STEP 1 — Porkbun inbound MX (Resend receiving)');
    try {
      await ensureInboundMx();
    } catch (err) {
      console.error(`  ⚠ ${err.message}`);
    }
  }

  printManualSteps();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
