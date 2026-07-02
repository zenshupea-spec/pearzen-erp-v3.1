#!/usr/bin/env node
/**
 * S-21 — provision pearzen-forge-back-office Vercel project + platform domains.
 *
 * Run:
 *   node scripts/provision-forge-vercel-project.mjs --audit
 *   node scripts/provision-forge-vercel-project.mjs --dry-run
 *   node scripts/provision-forge-vercel-project.mjs
 *
 * Requires VERCEL_TOKEN (or Vercel CLI login) in .env.seed.tmp.
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FORGE_PROJECT =
  process.env.VERCEL_FORGE_BACK_OFFICE_PROJECT?.trim() || 'pearzen-forge-back-office';

const FORGE_DOMAINS = [
  DOMAIN,
  `www.${DOMAIN}`,
  `forge.${DOMAIN}`,
  `superadmin.${DOMAIN}`,
  `erp.${DOMAIN}`,
  `partners.${DOMAIN}`,
];

const TENANT_DOMAIN_PREFIXES = ['cvs', 'cvshq', 'cvsexec', 'cvsom', 'cvstm', 'cvssm'];

const FORGE_BUILD = {
  framework: 'nextjs',
  rootDirectory: 'apps/back-office',
  installCommand: 'cd ../.. && npm install',
  buildCommand:
    'cd ../.. && PEARZEN_DEPLOYMENT_MODE=forge npx turbo build --filter=pearzen-erp-back-office',
};

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

function teamQuery(extra = '') {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const parts = [];
  if (teamId) parts.push(`teamId=${teamId}`);
  if (extra) parts.push(extra);
  return parts.length ? `?${parts.join('&')}` : '';
}

async function findProjectByName(name) {
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
  return all;
}

async function upsertEnv(projectId, key, value, envs) {
  const hit = envs.find((e) => e.key === key && e.target?.includes('production'));
  const body = { key, value, type: 'plain', target: ['production'] };
  if (hit) {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}PATCH env ${key}`);
    if (!dryRun) {
      await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
        method: 'PATCH',
        body: { value, target: ['production'], type: 'plain' },
      });
    }
  } else {
    console.log(`  ${dryRun ? '[dry-run] ' : ''}POST env ${key}`);
    if (!dryRun) {
      await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
        method: 'POST',
        body,
      });
    }
  }
}

async function addDomain(projectId, name, tenantProjectId) {
  console.log(`  ${dryRun ? '[dry-run] ' : ''}ADD domain ${name} → ${FORGE_PROJECT}`);
  if (dryRun) return;

  try {
    await vercelFetch(`/v10/projects/${projectId}/domains${teamQuery()}`, {
      method: 'POST',
      body: { name },
    });
  } catch (err) {
    const msg = String(err.message);
    const inUse = msg.match(/domain_already_in_use.*"projectId":"([^"]+)"/);
    if (inUse && tenantProjectId && inUse[1] === tenantProjectId) {
      console.log(`    · on tenant — moving`);
      await removeDomain(tenantProjectId, name, TENANT_PROJECT);
      await vercelFetch(`/v10/projects/${projectId}/domains${teamQuery()}`, {
        method: 'POST',
        body: { name },
      });
      return;
    }
    if (msg.includes('already') || msg.includes('409')) {
      console.log(`    · already on forge project`);
      return;
    }
    throw err;
  }
}

async function removeDomain(projectId, name, projectLabel) {
  console.log(`  ${dryRun ? '[dry-run] ' : ''}REMOVE domain ${name} from ${projectLabel}`);
  if (!dryRun) {
    try {
      await vercelFetch(
        `/v9/projects/${projectId}/domains/${encodeURIComponent(name)}${teamQuery()}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      if (String(err.message).includes('404') || String(err.message).includes('not found')) {
        console.log(`    · not on project`);
      } else {
        throw err;
      }
    }
  }
}

async function audit() {
  const tenant = await findProjectByName(TENANT_PROJECT);
  const forge = await findProjectByName(FORGE_PROJECT);

  console.log('\n── S-21 Vercel audit ──\n');
  console.log(`Tenant project: ${tenant ? `${TENANT_PROJECT} (${tenant.id})` : 'NOT FOUND'}`);
  console.log(`Forge project:  ${forge ? `${FORGE_PROJECT} (${forge.id})` : 'NOT FOUND'}`);

  if (tenant) {
    const domains = await listProjectDomains(tenant.id);
    console.log(`\n${TENANT_PROJECT} domains (${domains.length}):`);
    for (const d of domains.sort()) console.log(`  · ${d}`);
    const forgeOnTenant = domains.filter((d) => FORGE_DOMAINS.includes(d));
    if (forgeOnTenant.length) {
      console.log(`\n  ⚠ Platform domains still on tenant (should move): ${forgeOnTenant.join(', ')}`);
    }
  }

  if (forge) {
    const domains = await listProjectDomains(forge.id);
    console.log(`\n${FORGE_PROJECT} domains (${domains.length}):`);
    for (const d of domains.sort()) console.log(`  · ${d}`);
    const missing = FORGE_DOMAINS.filter((d) => !domains.includes(d));
    if (missing.length) console.log(`\n  ⚠ Missing forge domains: ${missing.join(', ')}`);
  } else {
    console.log(`\n  ⚠ Create project: ${FORGE_PROJECT}`);
  }

  return { tenant, forge };
}

async function provision() {
  const { tenant, forge: existingForge } = await audit();
  if (!tenant) throw new Error(`Tenant project ${TENANT_PROJECT} not found`);

  let forge = existingForge;
  if (!forge) {
    console.log(`\n── Create ${FORGE_PROJECT} ──`);
    const git = tenant.link;
    const body = {
      name: FORGE_PROJECT,
      ...FORGE_BUILD,
    };
    if (git?.type && git?.repo) {
      body.gitRepository = { type: git.type, repo: git.repo };
    }
    console.log(`  ${dryRun ? '[dry-run] ' : ''}POST /v11/projects`);
    if (!dryRun) {
      forge = await vercelFetch(`/v11/projects${teamQuery()}`, { method: 'POST', body });
      console.log(`  ✓ Created ${forge.name} (${forge.id})`);
    } else {
      forge = { id: 'dry-run-forge-id', name: FORGE_PROJECT };
    }
  } else {
    console.log(`\n── Update ${FORGE_PROJECT} build settings ──`);
    const patchBody = { ...FORGE_BUILD };
    console.log(`  ${dryRun ? '[dry-run] ' : ''}PATCH project settings`);
    if (!dryRun) {
      await vercelFetch(`/v9/projects/${forge.id}${teamQuery()}`, {
        method: 'PATCH',
        body: patchBody,
      });
    }
  }

  if (!dryRun || existingForge) {
    console.log('\n── Forge production env ──');
    const envData = forge.id !== 'dry-run-forge-id'
      ? await vercelFetch(`/v10/projects/${forge.id}/env${teamQuery()}`)
      : { envs: [] };
    await upsertEnv(forge.id, 'PEARZEN_DEPLOYMENT_MODE', 'forge', envData.envs ?? []);
    await upsertEnv(
      forge.id,
      'NEXT_PUBLIC_TENANT_BASE_DOMAIN',
      DOMAIN,
      envData.envs ?? [],
    );
    await upsertEnv(
      forge.id,
      'NEXT_PUBLIC_FORGE_HOST',
      `superadmin.${DOMAIN}`,
      envData.envs ?? [],
    );
    await upsertEnv(
      forge.id,
      'NEXT_PUBLIC_FORGE_LEGACY_HOSTS',
      `forge.${DOMAIN}`,
      envData.envs ?? [],
    );
    await upsertEnv(
      forge.id,
      'NEXT_PUBLIC_PEARZEN_WEBSITE_HOST',
      DOMAIN,
      envData.envs ?? [],
    );
  }

  console.log('\n── Domain split ──');
  const tenantDomains = await listProjectDomains(tenant.id);
  for (const name of FORGE_DOMAINS) {
    if (tenantDomains.includes(name)) {
      await removeDomain(tenant.id, name, TENANT_PROJECT);
    }
    await addDomain(forge.id, name, tenant.id);
  }

  console.log('\n── Tenant CVS domains (verify unchanged) ──');
  const afterTenantDomains = dryRun
    ? tenantDomains
    : await listProjectDomains(tenant.id);
  for (const prefix of TENANT_DOMAIN_PREFIXES) {
    const host = `${prefix}.${DOMAIN}`;
    const ok = afterTenantDomains.includes(host);
    console.log(`  ${ok ? '✓' : '·'} ${host} ${ok ? 'on tenant' : '(not on tenant — may use wildcard)'}`);
  }
  for (const d of ['classicventuresecurity.com', 'classicventure.com']) {
    const ok = afterTenantDomains.includes(d);
    console.log(`  ${ok ? '✓' : '·'} ${d} ${ok ? 'on tenant' : 'not listed'}`);
  }

  if (!dryRun && forge.id !== 'dry-run-forge-id') {
    console.log('\n── Post-provision audit ──');
    await audit();
    console.log(
      '\nNext: copy Supabase + Forge secrets to forge project (S-23), then production deploy.',
    );
  }
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error('VERCEL_TOKEN missing — add to .env.seed.tmp or run vercel login');
    process.exit(1);
  }

  if (auditOnly) {
    await audit();
    return;
  }

  await provision();
  console.log(dryRun ? '\nDry run complete.' : '\nProvision complete.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
