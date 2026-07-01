#!/usr/bin/env node
/**
 * U-24 — Shalom front automated smoke (routes + calendar/login logic).
 * Full caretaker E2E (Step 25 checklist rows 1–9) still needs operator actors.
 *
 * Run: npm run verify:shalom-front-smoke
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BACK_OFFICE_URL ?? 'http://127.0.0.1:3002';

const requiredFiles = [
  'apps/back-office/app/shalom-front/layout.tsx',
  'apps/back-office/app/login/shalom-front/ShalomFrontLoginForm.tsx',
  'apps/back-office/components/shalom-front/ShalomFrontPortalShell.tsx',
  'apps/back-office/components/shalom-front/ShalomFrontCalendar.tsx',
  'apps/back-office/app/shalom-front/actions.ts',
  'apps/back-office/app/hr/shalom-portal/page.tsx',
  'apps/back-office/middleware.ts',
];

const failures = [];

for (const rel of requiredFiles) {
  if (!existsSync(join(ROOT, rel))) failures.push(`Missing file: ${rel}`);
}

const layout = readFileSync(join(ROOT, 'apps/back-office/app/shalom-front/layout.tsx'), 'utf8');
if (!layout.includes('ExecutiveBrandThemeProvider')) {
  failures.push('shalom-front/layout missing ExecutiveBrandThemeProvider (U-23 regression)');
}
if (!layout.includes('CafeFrontDeviceFrame')) {
  failures.push('shalom-front/layout missing vault device frame');
}

const actions = readFileSync(join(ROOT, 'apps/back-office/app/shalom-front/actions.ts'), 'utf8');
for (const needle of [
  'authenticateShalomFrontStaff',
  'recordShalomPortalDailyLogin',
  'getShalomFrontCalendarData',
  'signOutShalomFrontAction',
]) {
  if (!actions.includes(needle)) failures.push(`shalom-front/actions missing ${needle}`);
}

const middleware = readFileSync(join(ROOT, 'apps/back-office/middleware.ts'), 'utf8');
if (!middleware.includes('/shalom-front')) {
  failures.push('middleware missing /shalom-front gate');
}
if (!middleware.includes('resolveShalomEmployeeForUser')) {
  failures.push('middleware missing resolveShalomEmployeeForUser');
}

const shell = readFileSync(
  join(ROOT, 'apps/back-office/components/shalom-front/ShalomFrontPortalShell.tsx'),
  'utf8',
);
if (!shell.includes('signOutShalomFrontAction')) {
  failures.push('ShalomFrontPortalShell missing sign-out action');
}

const calendar = await import(join(ROOT, 'apps/back-office/lib/shalom-calendar.ts'));
const loggedIn = new Set(['2026-05-10']);
const today = '2026-05-15';
if (calendar.resolveShalomLoginDotStatus('2026-05-10', loggedIn, today) !== 'green') {
  failures.push('resolveShalomLoginDotStatus green dot failed');
}
if (calendar.resolveShalomLoginDotStatus('2026-05-11', loggedIn, today) !== 'red') {
  failures.push('resolveShalomLoginDotStatus red dot failed');
}
if (calendar.buildShalomLoginDateSet(['2026-05-10T12:00:00']).has('2026-05-10') !== true) {
  failures.push('buildShalomLoginDateSet normalization failed');
}

async function checkHttp(path, expectStatus, expectRedirectPrefix) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    if (res.status !== expectStatus) {
      failures.push(`${path} expected HTTP ${expectStatus}, got ${res.status}`);
      return;
    }
    if (expectRedirectPrefix) {
      const location = res.headers.get('location') ?? '';
      if (!location.includes(expectRedirectPrefix)) {
        failures.push(`${path} redirect expected ${expectRedirectPrefix}, got ${location}`);
      }
    }
  } catch (err) {
    failures.push(`${path} HTTP check failed (${BASE}): ${err.message}`);
  }
}

await checkHttp('/login/shalom-front', 200);
await checkHttp('/shalom-front', 307, '/login/shalom-front');

const loginHtml = await fetch(`${BASE}/login/shalom-front`).then((r) => r.text()).catch(() => '');
if (loginHtml && !loginHtml.includes('Secure access')) {
  failures.push('/login/shalom-front missing Secure access CTA');
}

if (failures.length > 0) {
  console.error('Shalom front smoke FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ Shalom front smoke passed (routes, theme shell, login dots logic)');
console.log('  Operator: complete PORTAL_AUTH Step 25 rows 1–9 on dev + cvsexec.pearzen.tech');
