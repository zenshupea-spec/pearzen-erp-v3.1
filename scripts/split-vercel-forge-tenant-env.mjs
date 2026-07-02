#!/usr/bin/env node
/**
 * S-23 — Forge vs CVS tenant Vercel environment variable split.
 *
 * Run:
 *   npm run split:vercel-forge-tenant-env -- --audit
 *   npm run split:vercel-forge-tenant-env -- --dry-run
 *   npm run split:vercel-forge-tenant-env
 *
 * Writes audit-evidence/platform/s-23-vercel-env-matrix.txt on --audit or apply.
 */

import { homedir } from 'os';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-23-vercel-env-matrix.txt');

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FORGE_PROJECT =
  process.env.VERCEL_FORGE_BACK_OFFICE_PROJECT?.trim() || 'pearzen-forge-back-office';

/** Both projects (L2 shared Supabase until Phase H). */
const SHARED_FROM_TENANT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_TENANT_BASE_DOMAIN',
  'NEXT_PUBLIC_FORGE_HOST',
  'NEXT_PUBLIC_FORGE_LEGACY_HOSTS',
];

const FORGE_REQUIRED_KEYS = {
  PEARZEN_DEPLOYMENT_MODE: 'forge',
};

function forgeRequiredEnv() {
  return {
    ...FORGE_REQUIRED_KEYS,
    NEXT_PUBLIC_PEARZEN_WEBSITE_HOST: process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech',
  };
}

const FORGE_OPTIONAL_COPY = [
  'FORGE_OPERATOR_EMAILS',
  'SUPERAPP_EXPORT_SERVICE_TOKEN',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'FORGE_EMAIL_FROM',
  'FORGE_CONTACT_INBOX',
  'FORGE_CONTACT_FORWARD_TO',
  'FORGE_CONTACT_FROM',
  'NEXT_PUBLIC_PEARZEN_WEBSITE_HOST',
];

/** Must not exist on forge production. */
const FORGE_FORBIDDEN = [
  'NEXT_PUBLIC_DEV_TENANT_SLUG',
  'ENCRYPTION_KEY',
  'PORTAL_PIN_COOKIE_SECRET',
  'PORTAL_TOTP_ENCRYPTION_SECRET',
  'CRON_SECRET',
  'NEXT_PUBLIC_BACK_OFFICE_URL',
  'NEXT_PUBLIC_FIELD_PWA_URL',
  'NEXT_PUBLIC_SM_PWA_URL',
  'NEXT_PUBLIC_SECURITY_WEBSITE_HOST',
];

/** Tenant project production keys. */
const TENANT_REQUIRED = {
  PEARZEN_DEPLOYMENT_MODE: 'tenant-erp',
};

const TENANT_OPTIONAL_COPY = [
  'ENCRYPTION_KEY',
  'PORTAL_PIN_COOKIE_SECRET',
  'PORTAL_TOTP_ENCRYPTION_SECRET',
  'CRON_SECRET',
  'RESEND_API_KEY',
  'PORTAL_EMAIL_FROM',
  'PORTAL_OTP_EMAIL_FROM',
  'NEXT_PUBLIC_BACK_OFFICE_URL',
  'NEXT_PUBLIC_TENANT_SUBDOMAINS_LIVE',
  'NEXT_PUBLIC_PLATFORM_HOSTS',
  'NEXT_PUBLIC_DEV_TENANT_SLUG',
  'NEXT_PUBLIC_FIELD_PWA_URL',
  'NEXT_PUBLIC_SM_PWA_URL',
  'NEXT_PUBLIC_SECURITY_WEBSITE_HOST',
  'NEXT_PUBLIC_CLIENT_PWA_URL',
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const auditOnly = args.has('--audit');

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

function loadVercelCliAuth() {
  if (process.env.VERCEL_TOKEN?.trim()) return;
  const authPath = join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.token) process.env.VERCEL_TOKEN = auth.token;
  } catch {
    /* CLI not logged in */
  }
}

function teamQuery(extra = '') {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const parts = [];
  if (teamId) parts.push(`teamId=${teamId}`);
  if (extra) parts.push(extra);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function vercelFetch(path, { method = 'GET', body } = {}) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error('VERCEL_TOKEN missing');

  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || res.statusText;
    throw new Error(`Vercel ${method} ${path}: ${res.status} ${msg}`);
  }
  return json;
}

async function findProject(name) {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  const match = data.projects?.find((p) => p.name === name);
  if (!match?.id) throw new Error(`Project not found: ${name}`);
  return match;
}

async function listProductionEnv(projectId) {
  const data = await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`);
  const map = new Map();
  for (const row of data.envs ?? []) {
    if (!row.target?.includes('production')) continue;
    if (!map.has(row.key)) map.set(row.key, row);
  }
  return map;
}

function maskValue(key, value, type) {
  if (!value) {
    if (type === 'encrypted' || type === 'secret') return '(encrypted — value hidden by Vercel API)';
    return '(unset)';
  }
  if (value.length > 80) {
    return `${value.slice(0, 12)}…(${value.length} chars)`;
  }
  if (key.includes('SECRET') || key.includes('KEY') || key.includes('TOKEN') || key === 'ENCRYPTION_KEY') {
    return value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)` : '***';
  }
  return value;
}

function productionRows(envMap) {
  return [...envMap.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function buildMatrixReport(forgeMap, tenantMap, issues) {
  const lines = [];
  lines.push('FORGE ↔ CVS ISOLATION — S-23 Vercel environment matrix');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('================================================================================');
  lines.push('POLICY');
  lines.push('================================================================================');
  lines.push('');
  lines.push('Forge (pearzen-forge-back-office):');
  lines.push('  REQUIRED: PEARZEN_DEPLOYMENT_MODE=forge, shared SUPABASE_*, forge host vars');
  lines.push('  OPTIONAL: FORGE_OPERATOR_EMAILS, SUPERAPP_EXPORT_SERVICE_TOKEN, RESEND_*, FORGE_*');
  lines.push('  FORBIDDEN: NEXT_PUBLIC_DEV_TENANT_SLUG, ENCRYPTION_KEY, CRON_SECRET, tenant PWA URLs');
  lines.push('');
  lines.push('Tenant (pearzen-erp-v3-1-back-office):');
  lines.push('  REQUIRED: PEARZEN_DEPLOYMENT_MODE=tenant-erp, shared SUPABASE_*, tenant portal vars');
  lines.push('  OPTIONAL: ENCRYPTION_KEY, PORTAL_PIN_COOKIE_SECRET, CRON_SECRET, RESEND_*');
  lines.push('');
  lines.push('================================================================================');
  lines.push(`FORGE PROJECT — ${FORGE_PROJECT}`);
  lines.push('================================================================================');
  for (const [key, row] of productionRows(forgeMap)) {
    const flag = FORGE_FORBIDDEN.includes(key) ? ' ⚠ FORBIDDEN' : '';
    lines.push(`  ${key}=${maskValue(key, row.value, row.type)}${flag}`);
  }
  if (!forgeMap.size) lines.push('  (no production env rows)');
  lines.push('');
  lines.push('================================================================================');
  lines.push(`TENANT PROJECT — ${TENANT_PROJECT}`);
  lines.push('================================================================================');
  for (const [key, row] of productionRows(tenantMap)) {
    lines.push(`  ${key}=${maskValue(key, row.value, row.type)}`);
  }
  if (!tenantMap.size) lines.push('  (no production env rows)');
  lines.push('');
  if (issues.length) {
    lines.push('================================================================================');
    lines.push('ISSUES');
    lines.push('================================================================================');
    for (const i of issues) lines.push(`  · ${i}`);
    lines.push('');
  } else {
    lines.push('Status: matrix compliant');
    lines.push('');
  }
  return lines.join('\n');
}

function collectIssues(forgeMap, tenantMap) {
  const issues = [];

  for (const key of FORGE_FORBIDDEN) {
    if (forgeMap.has(key)) issues.push(`Forge has forbidden key: ${key}`);
  }

  for (const [key, value] of Object.entries(forgeRequiredEnv())) {
    const row = forgeMap.get(key);
    if (!row) issues.push(`Forge missing required: ${key}`);
    else if (row.value !== value) issues.push(`Forge ${key}=${row.value} (expected ${value})`);
  }

  for (const key of SHARED_FROM_TENANT) {
    if (!forgeMap.has(key)) {
      issues.push(`Forge missing shared key: ${key}`);
    }
  }

  for (const [key, value] of Object.entries(TENANT_REQUIRED)) {
    const row = tenantMap.get(key);
    if (!row) issues.push(`Tenant missing required: ${key}`);
    else if (row.value !== value) issues.push(`Tenant ${key}=${row.value} (expected ${value})`);
  }

  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!tenantMap.has(key)) issues.push(`Tenant missing: ${key}`);
  }

  if (tenantMap.has('RESEND_WEBHOOK_SECRET') && !forgeMap.has('RESEND_WEBHOOK_SECRET')) {
    issues.push(
      'Forge missing RESEND_WEBHOOK_SECRET — /api/resend/inbound on forge.pearzen.tech will reject webhooks (401)',
    );
  }

  return issues;
}

async function upsertProduction(projectId, key, value, type, envMap) {
  const hit = envMap.get(key);
  if (dryRun) {
    console.log(`  [dry-run] UPSERT ${key} on ${projectId}`);
    return;
  }
  if (hit) {
    await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
      method: 'PATCH',
      body: { value, target: ['production'], type: type ?? hit.type ?? 'plain' },
    });
    console.log(`  ✓ PATCH ${key}`);
  } else {
    await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
      method: 'POST',
      body: { key, value, type: type ?? 'plain', target: ['production'] },
    });
    console.log(`  ✓ POST ${key}`);
  }
}

async function deleteProductionKey(projectId, key, envMap) {
  const hit = envMap.get(key);
  if (!hit) return;
  if (dryRun) {
    console.log(`  [dry-run] DELETE ${key} from ${projectId}`);
    return;
  }
  await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
    method: 'DELETE',
  });
  console.log(`  ✓ DELETE forbidden ${key}`);
}

async function applySplit(forgeId, tenantId, forgeMap, tenantMap) {
  console.log('\n── Tenant project env ──');
  for (const [key, value] of Object.entries(TENANT_REQUIRED)) {
    await upsertProduction(tenantId, key, value, 'plain', tenantMap);
    tenantMap.set(key, { id: 'new', value, type: 'plain' });
  }
  for (const key of TENANT_OPTIONAL_COPY) {
    if (tenantMap.has(key) || !process.env[key]?.trim()) continue;
    await upsertProduction(tenantId, key, process.env[key].trim(), 'plain', tenantMap);
  }

  console.log('\n── Forge project env ──');
  for (const key of FORGE_FORBIDDEN) {
    await deleteProductionKey(forgeId, key, forgeMap);
    forgeMap.delete(key);
  }

  for (const [key, value] of Object.entries(forgeRequiredEnv())) {
    await upsertProduction(forgeId, key, value, 'plain', forgeMap);
    forgeMap.set(key, { id: 'new', value, type: 'plain' });
  }

  for (const key of SHARED_FROM_TENANT) {
    const tenantRow = tenantMap.get(key);
    const value = tenantRow?.value?.trim() || process.env[key]?.trim();
    if (!value) {
      console.warn(`  ⚠ No value for ${key} — set on tenant or in .env.seed.tmp`);
      continue;
    }
    await upsertProduction(forgeId, key, value, tenantRow?.type ?? 'encrypted', forgeMap);
    forgeMap.set(key, { ...tenantRow, value });
  }

  for (const key of FORGE_OPTIONAL_COPY) {
    if (forgeMap.has(key)) continue;
    const tenantRow = tenantMap.get(key);
    const local = process.env[key]?.trim();
    const value = tenantRow?.value ?? local;
    if (!value) continue;
    await upsertProduction(forgeId, key, value, tenantRow?.type ?? 'plain', forgeMap);
    forgeMap.set(key, { id: 'new', value, type: tenantRow?.type ?? 'plain' });
  }
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error('VERCEL_TOKEN missing');
    process.exit(1);
  }

  const tenant = await findProject(TENANT_PROJECT);
  const forge = await findProject(FORGE_PROJECT);

  let forgeMap = await listProductionEnv(forge.id);
  let tenantMap = await listProductionEnv(tenant.id);
  let issues = collectIssues(forgeMap, tenantMap);

  console.log(`\nS-23 Vercel env split — ${FORGE_PROJECT} + ${TENANT_PROJECT}\n`);
  console.log(`Forge production keys: ${forgeMap.size}`);
  console.log(`Tenant production keys: ${tenantMap.size}`);
  console.log(`Issues before apply: ${issues.length}`);

  if (!auditOnly) {
    await applySplit(forge.id, tenant.id, forgeMap, tenantMap);
    forgeMap = await listProductionEnv(forge.id);
    tenantMap = await listProductionEnv(tenant.id);
    issues = collectIssues(forgeMap, tenantMap);
  }

  const report = buildMatrixReport(forgeMap, tenantMap, issues);
  if (!dryRun) {
    writeFileSync(EVIDENCE, `${report}\n`);
    console.log(`\nWrote ${EVIDENCE}`);
  } else {
    console.log('\n' + report);
  }

  if (issues.length) {
    console.log(`\n${issues.length} issue(s) remain.`);
    if (auditOnly) process.exit(1);
  } else {
    console.log('\nEnv matrix compliant.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
