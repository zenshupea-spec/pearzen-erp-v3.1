#!/usr/bin/env node
/**
 * U-28 — tasha.lk production smoke (DNS → Vercel client-pwa, menu, prices, stock badges).
 *
 * Run: npm run verify:tasha-lk-production
 * Writes: audit-evidence/cvs/tasha-lk-production-smoke.json
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/tasha-lk-production-smoke.json');
const MENU_DOMAIN = process.env.CUSTOMER_MENU_DOMAIN?.trim() || 'tasha.lk';
const MENU_URL = `https://${MENU_DOMAIN}/`;
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const CLIENT_PWA_PROJECT =
  process.env.VERCEL_CLIENT_PWA_PROJECT?.trim() || 'pearzen-erp-client-pwa';

const failures = [];
const warnings = [];
const checks = [];

function record(id, label, status, detail) {
  checks.push({ id, label, status, detail });
}

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/client-pwa/.env.local', '.env']) {
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
  if (!process.env.VERCEL_TOKEN?.trim()) {
    try {
      const auth = JSON.parse(
        readFileSync(join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8'),
      );
      if (auth.token) process.env.VERCEL_TOKEN = auth.token;
    } catch {
      /* CLI not logged in */
    }
  }
}

async function fetchMenuHtml() {
  const res = await fetch(MENU_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'pearzen-verify-tasha-lk/1.0' },
    signal: AbortSignal.timeout(25_000),
  });
  const html = await res.text();
  return { res, html };
}

function digShort(name, type = 'A') {
  try {
    const flag = type === 'CNAME' ? '+short CNAME' : '+short';
    const out = execSync(`dig ${flag} ${name}`, { encoding: 'utf8' }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function vercelProductionEnv() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) return null;

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  const projects = await fetch(`https://api.vercel.com/v9/projects${teamQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const project = (projects.projects ?? []).find((row) => row.name === CLIENT_PWA_PROJECT);
  if (!project?.id) return { error: `Project not found: ${CLIENT_PWA_PROJECT}` };

  const envRes = await fetch(`https://api.vercel.com/v10/projects/${project.id}/env${teamQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  const production = new Map();
  for (const row of envRes.envs ?? []) {
    if (row.target?.includes('production')) production.set(row.key, row.value ?? '(encrypted)');
  }
  return { projectId: project.id, production };
}

loadEnv();

console.log(`\nU-28 — tasha.lk production smoke (${MENU_URL})\n`);

const dnsA = digShort(MENU_DOMAIN);
const dnsCname = digShort(MENU_DOMAIN, 'CNAME');
if (!dnsA.length && !dnsCname.length) {
  failures.push(`DNS: ${MENU_DOMAIN} has no A/CNAME records`);
  record('dns', 'DNS resolves', 'failed', 'no records');
} else {
  record('dns', 'DNS resolves', 'pass', { A: dnsA, CNAME: dnsCname });
  console.log(`  ✓ DNS ${MENU_DOMAIN} → ${(dnsCname[0] ?? dnsA.join(', ')).slice(0, 80)}`);
}

let html = '';
let headers = {};
try {
  const { res, html: body } = await fetchMenuHtml();
  html = body;
  headers = Object.fromEntries(res.headers.entries());
  if (res.status !== 200) {
    failures.push(`HTTP ${res.status} from ${MENU_URL}`);
    record('http', 'Menu homepage', 'failed', String(res.status));
  } else {
    record('http', 'Menu homepage', 'pass', 'HTTP 200');
    console.log('  ✓ HTTPS menu returns 200');
  }
} catch (err) {
  failures.push(`Fetch ${MENU_URL}: ${err.message}`);
  record('http', 'Menu homepage', 'failed', err.message);
}

const vercelHeader = headers['x-vercel-id'] ?? headers['X-Vercel-Id'];
if (vercelHeader) {
  record('vercel', 'Served by Vercel', 'pass', vercelHeader);
  console.log(`  ✓ x-vercel-id present (${String(vercelHeader).slice(0, 40)}…)`);
} else if (html) {
  warnings.push('x-vercel-id header missing — confirm domain aliases client-pwa production');
  record('vercel', 'Served by Vercel', 'warn', 'header missing');
}

if (html) {
  const hasCafeName = /Caf[eé] Tasha/i.test(html);
  const hasLkr = html.includes('LKR');
  const hasMenuItem = html.includes('CAPA') || /class="truncate text-sm font-semibold/.test(html);

  if (!hasCafeName || !hasLkr || !hasMenuItem) {
    failures.push('Production HTML missing café branding, LKR prices, or menu rows');
    record('menu-html', 'Menu content visible', 'failed', { hasCafeName, hasLkr, hasMenuItem });
  } else {
    record('menu-html', 'Menu content visible', 'pass', { hasCafeName, hasLkr, hasMenuItem });
    console.log('  ✓ Menu HTML has branding + LKR + items');
  }

  const hasStockBadge = /\d+ left/.test(html) || html.includes('Sold out');
  if (hasStockBadge) {
    record('stock-badges', 'Stock badges on prod', 'pass', 'found left/sold-out copy');
    console.log('  ✓ Stock badges present on production HTML');
  } else {
    warnings.push(
      'Stock badges not on production yet — redeploy pearzen-erp-client-pwa after U-27 merge',
    );
    record('stock-badges', 'Stock badges on prod', 'warn', 'missing — deploy client-pwa');
    console.log('  ⚠ Stock badges not on prod HTML (redeploy client-pwa after U-27)');
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (supabaseUrl && anonKey && html) {
  const supabase = createClient(supabaseUrl, anonKey);
  const { data, error } = await supabase.rpc('get_cafe_public_menu', {
    p_company_id: CVS_COMPANY_ID,
  });

  if (error) {
    warnings.push(`Supabase menu RPC: ${error.message}`);
    record('rpc-prices', 'RPC price cross-check', 'warn', error.message);
  } else if (!data?.length) {
    warnings.push('RPC returned no menu rows for CVS company');
    record('rpc-prices', 'RPC price cross-check', 'warn', 'empty menu');
  } else {
    const sample = data[0];
    const price = Number(sample.selling_price_lkr);
    const name = String(sample.item_name);
    const priceInHtml = html.includes(String(price)) || html.includes(price.toLocaleString());
    const nameInHtml = html.includes(name);

    if (!nameInHtml || !priceInHtml) {
      warnings.push(`Could not match RPC sample "${name}" / LKR ${price} in prod HTML`);
      record('rpc-prices', 'RPC price cross-check', 'warn', { name, price, nameInHtml, priceInHtml });
    } else {
      record('rpc-prices', 'RPC price cross-check', 'pass', { name, priceLkr: price });
      console.log(`  ✓ RPC sample "${name}" LKR ${price} appears on ${MENU_DOMAIN}`);
    }

    const withQty = data.filter((row) => row.available_qty != null);
    if (withQty.length > 0 && !/\d+ left/.test(html)) {
      record('rpc-stock', 'RPC available_qty on prod UI', 'warn', `${withQty.length} RPC rows have qty`);
    } else if (withQty.length > 0) {
      record('rpc-stock', 'RPC available_qty on prod UI', 'pass', `${withQty.length} items tracked`);
    }
  }
} else {
  warnings.push('Skipped Supabase RPC cross-check (env missing)');
}

try {
  const vercel = await vercelProductionEnv();
  if (!vercel) {
    warnings.push('Skipped Vercel env audit (VERCEL_TOKEN missing)');
    record('vercel-env', 'CUSTOMER_MENU_COMPANY_ID on prod', 'operator_manual', 'no token');
  } else if (vercel.error) {
    warnings.push(vercel.error);
    record('vercel-env', 'CUSTOMER_MENU_COMPANY_ID on prod', 'warn', vercel.error);
  } else {
    const companyId = vercel.production.get('NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID');
    if (companyId === CVS_COMPANY_ID) {
      record('vercel-env', 'CUSTOMER_MENU_COMPANY_ID on prod', 'pass', companyId);
      console.log(`  ✓ Vercel prod NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID = ${CVS_COMPANY_ID}`);
    } else if (companyId === '(encrypted)' || !companyId) {
      warnings.push('Could not read company UUID from Vercel API (encrypted or unset)');
      record('vercel-env', 'CUSTOMER_MENU_COMPANY_ID on prod', 'operator_manual', String(companyId));
    } else {
      failures.push(`Vercel prod company ID mismatch: ${companyId}`);
      record('vercel-env', 'CUSTOMER_MENU_COMPANY_ID on prod', 'failed', companyId);
    }

    const menuHost = vercel.production.get('NEXT_PUBLIC_CUSTOMER_MENU_HOST');
    if (menuHost && menuHost !== MENU_DOMAIN) {
      warnings.push(`Vercel NEXT_PUBLIC_CUSTOMER_MENU_HOST=${menuHost} (expected ${MENU_DOMAIN})`);
    }
  }
} catch (err) {
  warnings.push(`Vercel env audit: ${err.message}`);
}

mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
const evidence = {
  checkedAt: new Date().toISOString(),
  menuUrl: MENU_URL,
  cvsCompanyId: CVS_COMPANY_ID,
  clientPwaProject: CLIENT_PWA_PROJECT,
  checks,
  failures,
  warnings,
  operatorManual: [
    'After U-27 merge: npx vercel deploy --prod --project pearzen-erp-client-pwa (stock badges)',
    'Change prep stock in /executive/cafe → confirm tasha.lk updates within 60s poll',
    'Confirm PayHere production keys if taking live card payments',
  ],
};
writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

if (failures.length > 0) {
  console.error('\nFAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const msg of warnings) console.error(`  • ${msg}`);
  }
  process.exit(1);
}

console.log(`\n✓ tasha.lk production smoke passed (${warnings.length} warning(s))`);
console.log(`  Evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
if (warnings.length) {
  console.log('Warnings:');
  for (const msg of warnings) console.warn(`  • ${msg}`);
}
