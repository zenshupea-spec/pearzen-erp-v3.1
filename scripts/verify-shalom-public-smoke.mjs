#!/usr/bin/env node
/**
 * Shalom guest website — public routes smoke (homepage, properties index, policies).
 *
 * Run (back-office on 3002):
 *   npm run verify:shalom-public-smoke
 *
 * Optional:
 *   BACK_OFFICE_URL=https://staging.example.com npm run verify:shalom-public-smoke
 *   SHALOM_PUBLIC_HOST=shalom.pearzen.tech npm run verify:shalom-public-smoke
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BACK_OFFICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:3002';
const SHALOM_HOST = process.env.SHALOM_PUBLIC_HOST?.trim() || 'shalom.pearzen.tech';

const failures = [];
const warnings = [];

const requiredFiles = [
  'apps/back-office/app/shalom-public/page.tsx',
  'apps/back-office/app/shalom-public/properties/page.tsx',
  'apps/back-office/app/shalom-public/privacy-policy/page.tsx',
  'apps/back-office/app/shalom-public/refund-policy/page.tsx',
  'apps/back-office/app/shalom-public/terms-and-conditions/page.tsx',
  'apps/back-office/app/api/shalom-public/payhere-notify/route.ts',
  'apps/back-office/app/api/shalom-public/payhere-checkout/route.ts',
  'apps/back-office/lib/shalom-public-host.ts',
  'apps/back-office/lib/shalom-public-seo.ts',
  'docs/runbooks/shalom-guest-website.md',
];

for (const rel of requiredFiles) {
  if (!existsSync(join(ROOT, rel))) failures.push(`Missing file: ${rel}`);
}

const middleware = readFileSync(join(ROOT, 'apps/back-office/middleware.ts'), 'utf8');
for (const needle of ['isShalomPublicHost', 'shalomPublicInternalPath']) {
  if (!middleware.includes(needle)) failures.push(`middleware missing ${needle}`);
}

const hostSource = readFileSync(join(ROOT, 'apps/back-office/lib/shalom-public-host.ts'), 'utf8');
for (const needle of [
  "DEFAULT_SHALOM_PUBLIC_DOMAIN = 'shalom.pearzen.tech'",
  "return '/shalom-public/properties'",
  "return `/shalom-public/properties/${slug}`",
  "return `/shalom-public/confirmation/${bookingId}`",
]) {
  if (!hostSource.includes(needle)) failures.push(`shalom-public-host missing ${needle}`);
}

async function checkHttp(path, { expectStatus = 200, host, expectBodyIncludes = [] } = {}) {
  const url = `${BASE}${path}`;
  const headers = host ? { Host: host.includes(':') ? host : `${host}:3002` } : undefined;

  try {
    const res = await fetch(url, { redirect: 'manual', headers });
    if (res.status !== expectStatus) {
      failures.push(`${path} expected HTTP ${expectStatus}, got ${res.status}${host ? ` (Host: ${host})` : ''}`);
      return;
    }

    if (expectBodyIncludes.length > 0) {
      const body = await res.text();
      for (const needle of expectBodyIncludes) {
        if (!body.includes(needle)) {
          failures.push(`${path} response missing "${needle}"${host ? ` (Host: ${host})` : ''}`);
        }
      }
    }
  } catch (err) {
    failures.push(
      `${path} HTTP check failed (${url}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const publicRoutes = [
  {
    path: '/shalom-public',
    needles: ['Shalom Residence', 'Our properties'],
  },
  {
    path: '/shalom-public/properties',
    needles: ['All properties'],
  },
  {
    path: '/shalom-public/privacy-policy',
    needles: ['Privacy Policy'],
  },
  {
    path: '/shalom-public/refund-policy',
    needles: ['Refund Policy'],
  },
  {
    path: '/shalom-public/terms-and-conditions',
    needles: ['Terms'],
  },
];

for (const route of publicRoutes) {
  await checkHttp(route.path, { expectBodyIncludes: route.needles });
}

await checkHttp('/', {
  host: SHALOM_HOST,
  expectBodyIncludes: ['Shalom Residence'],
});
await checkHttp('/properties', {
  host: SHALOM_HOST,
  expectBodyIncludes: ['All properties'],
});
await checkHttp('/privacy-policy', {
  host: SHALOM_HOST,
  expectBodyIncludes: ['Privacy Policy'],
});

try {
  const health = await fetch(`${BASE}/shalom-public`);
  if (!health.ok && health.status !== 307) {
    warnings.push(`Back-office responded ${health.status} — confirm npm run dev is up on port 3002`);
  }
} catch {
  warnings.push('Back-office not reachable — start with npm run dev, then re-run smoke');
}

if (failures.length > 0) {
  console.error('Shalom public smoke FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const msg of warnings) console.error(`  • ${msg}`);
  }
  process.exit(1);
}

console.log('✓ Shalom public smoke passed');
console.log(`  Prefix routes on ${BASE}/shalom-public/*`);
console.log(`  Clean URLs verified with Host: ${SHALOM_HOST}`);
if (warnings.length) {
  console.log('Warnings:');
  for (const msg of warnings) console.warn(`  • ${msg}`);
}
