#!/usr/bin/env node
/**
 * S-26 — ensure pearzen-erp-v3-1-back-office has no forge-only Vercel domains.
 *
 * Run:
 *   npm run audit:tenant-no-forge-domains
 *   npm run audit:tenant-no-forge-domains -- --purge
 */

import { homedir } from 'os';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-26-tenant-forge-domain-purge.txt');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FORGE_PROJECT =
  process.env.VERCEL_FORGE_BACK_OFFICE_PROJECT?.trim() || 'pearzen-forge-back-office';

const FORGE_ONLY_DOMAINS = [
  DOMAIN,
  `www.${DOMAIN}`,
  `forge.${DOMAIN}`,
  `superadmin.${DOMAIN}`,
  `erp.${DOMAIN}`,
  `partners.${DOMAIN}`,
];

const purge = process.argv.includes('--purge');

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
  return data.projects?.find((p) => p.name === name) ?? null;
}

async function listProjectDomains(projectId) {
  const all = [];
  let until = null;
  do {
    const qs = teamQuery('limit=100') + (until ? `&until=${until}` : '');
    const data = await vercelFetch(`/v9/projects/${projectId}/domains${qs}`);
    for (const d of data.domains ?? []) all.push(d.name);
    until = data.pagination?.next ?? null;
  } while (until);
  return all.sort();
}

async function removeDomain(projectId, name) {
  if (purge) {
    await vercelFetch(
      `/v9/projects/${projectId}/domains/${encodeURIComponent(name)}${teamQuery()}`,
      { method: 'DELETE' },
    );
    console.log(`  ✓ REMOVED ${name} from ${TENANT_PROJECT}`);
  } else {
    console.log(`  [dry-run] would remove ${name} from ${TENANT_PROJECT}`);
  }
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  const tenant = await findProject(TENANT_PROJECT);
  const forge = await findProject(FORGE_PROJECT);
  if (!tenant) throw new Error(`Tenant project not found: ${TENANT_PROJECT}`);

  let tenantDomains = await listProjectDomains(tenant.id);
  const leaks = tenantDomains.filter((d) => FORGE_ONLY_DOMAINS.includes(d));

  console.log(`\nS-26 tenant forge-domain audit — ${TENANT_PROJECT}\n`);
  console.log(`Tenant domains (${tenantDomains.length}):`);
  for (const d of tenantDomains) console.log(`  · ${d}`);

  if (leaks.length) {
    console.log(`\nForge-only domains on tenant (${leaks.length}):`);
    for (const d of leaks) {
      await removeDomain(tenant.id, d);
    }
    if (purge) tenantDomains = await listProjectDomains(tenant.id);
  } else {
    console.log('\nNo forge-only domains on tenant project.');
  }

  const forgeDomains = forge ? await listProjectDomains(forge.id) : [];
  const remaining = tenantDomains.filter((d) => FORGE_ONLY_DOMAINS.includes(d));
  const pass = remaining.length === 0;

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-26 Tenant forge-domain purge',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Tenant project: ${TENANT_PROJECT} (${tenant.id})`,
    `Forge project:  ${forge ? `${FORGE_PROJECT} (${forge.id})` : 'NOT FOUND'}`,
    '',
    'Forge-only domain set (must NOT be on tenant):',
    ...FORGE_ONLY_DOMAINS.map((d) => `  · ${d}`),
    '',
    `Tenant domains (${tenantDomains.length}):`,
    ...tenantDomains.map((d) => `  · ${d}`),
    '',
    `Forge-only leaks on tenant: ${remaining.length ? remaining.join(', ') : 'none'}`,
    '',
    `Forge project domains (${forgeDomains.length}):`,
    ...forgeDomains.map((d) => `  · ${d}`),
    '',
    pass ? 'Status: PASS — zero forge-only hosts on tenant project' : 'Status: FAIL',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);

  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
