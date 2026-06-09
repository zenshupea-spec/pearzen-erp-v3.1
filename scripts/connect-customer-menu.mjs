#!/usr/bin/env node
/**
 * Wire tasha.lk → client-pwa (public café menu) on Vercel.
 * Removes the domain from back-office if misconfigured.
 *
 * Cloudflare DNS (manual after this script):
 *   CNAME @  → cname.vercel-dns.com  (proxied)
 *   CNAME www → cname.vercel-dns.com  (proxied)
 *
 * Run: npm run connect:customer-menu
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const MENU_DOMAIN = process.env.CUSTOMER_MENU_DOMAIN?.trim() || 'tasha.lk';
const MENU_WWW = `www.${MENU_DOMAIN}`;

const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const CLIENT_PWA_PROJECT =
  process.env.VERCEL_CLIENT_PWA_PROJECT?.trim() || 'pearzen-erp-client-pwa';

const DEFAULT_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';
const VERCEL_CNAME = 'cname.vercel-dns.com';

const CLIENT_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID',
];

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

function teamQuery() {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return teamId ? `?teamId=${teamId}` : '';
}

async function listProjects() {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  return data.projects ?? [];
}

async function resolveProjectId(name, { rootDirectory, createIfMissing = false } = {}) {
  const projects = await listProjects();
  const match = projects.find((p) => p.name === name);
  if (match?.id) return { id: match.id, name: match.name, created: false };

  if (!createIfMissing) {
    throw new Error(`Could not find Vercel project "${name}"`);
  }

  const backOffice = projects.find((p) => p.name === BACK_OFFICE_PROJECT);
  const gitRepository = backOffice?.link
    ? {
        type: backOffice.link.type,
        repo: backOffice.link.repo,
        repoId: backOffice.link.repoId,
      }
    : undefined;

  const created = await vercelFetch(`/v11/projects${teamQuery()}`, {
    method: 'POST',
    body: {
      name,
      framework: 'nextjs',
      rootDirectory,
      ...(gitRepository ? { gitRepository } : {}),
    },
  });

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (teamId) {
    await vercelFetch(`/v9/projects/${created.id}${teamQuery()}`, {
      method: 'PATCH',
      body: {
        buildCommand: `cd ../.. && npx turbo build --filter=client-pwa`,
        installCommand: 'cd ../.. && npm install',
        rootDirectory,
        framework: 'nextjs',
      },
    });
  }

  return { id: created.id, name: created.name, created: true };
}

async function removeDomainFromProject(projectId, domain) {
  try {
    await vercelFetch(`/v9/projects/${projectId}/domains/${domain}${teamQuery()}`, {
      method: 'DELETE',
    });
    console.log(`  ✓ Removed ${domain} from project`);
  } catch (err) {
    if (String(err.message).includes('404')) {
      console.log(`  · ${domain} not on project`);
    } else {
      console.warn(`  ⚠ Could not remove ${domain}: ${err.message}`);
    }
  }
}

async function addDomainToProject(projectId, domain) {
  try {
    await vercelFetch(`/v10/projects/${projectId}/domains${teamQuery()}`, {
      method: 'POST',
      body: { name: domain },
    });
    console.log(`  ✓ Added domain: ${domain}`);
  } catch (err) {
    if (String(err.message).includes('already exists') || String(err.message).includes('409')) {
      console.log(`  · Already on project: ${domain}`);
    } else {
      throw err;
    }
  }
}

async function readProjectEnv(projectId) {
  const data = await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`);
  const map = new Map();
  for (const row of data.envs ?? []) {
    if (row.target?.includes('production')) {
      map.set(row.key, row);
    }
  }
  return map;
}

async function upsertProjectEnv(projectId, entries) {
  const existing = await readProjectEnv(projectId);

  for (const [key, value] of Object.entries(entries)) {
    if (!value) continue;
    const hit = existing.get(key);
    if (hit) {
      if (hit.value === value) {
        console.log(`  · Env unchanged: ${key}`);
        continue;
      }
      try {
        await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
          method: 'PATCH',
          body: { value, target: ['production'], type: hit.type ?? 'plain' },
        });
        console.log(`  ✓ Updated env: ${key}`);
      } catch (err) {
        if (String(err.message).includes('Sensitive Environment Variable')) {
          console.log(`  · Skipped sensitive env (already set): ${key}`);
        } else {
          throw err;
        }
      }
    } else {
      await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
        method: 'POST',
        body: { key, value, type: 'plain', target: ['production'] },
      });
      console.log(`  ✓ Created env: ${key}`);
    }
  }
}

async function triggerRedeploy(projectId, projectName) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const deployments = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=1&target=production${teamId ? `&teamId=${teamId}` : ''}`,
  );
  const latest = deployments.deployments?.[0];
  if (!latest?.uid) {
    console.log(`  · No prior deployment for ${projectName} — push to main to deploy`);
    return;
  }

  await vercelFetch(`/v13/deployments${teamQuery()}`, {
    method: 'POST',
    body: {
      name: projectName,
      project: projectId,
      target: 'production',
      deploymentId: latest.uid,
    },
  });
  console.log(`  ✓ Triggered production redeploy: ${projectName}`);
}

async function cloudflareFetch(path, { method = 'GET', body } = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) return null;

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`Cloudflare ${method} ${path}: ${msg}`);
  }
  return json.result;
}

async function resolveCloudflareZoneId(domain) {
  const zones = await cloudflareFetch(`/zones?name=${encodeURIComponent(domain)}`);
  const zone = zones?.[0];
  if (!zone?.id) throw new Error(`Cloudflare zone not found for ${domain} — add the site in Cloudflare first`);
  return zone.id;
}

async function upsertCloudflareCname(zoneId, name, content) {
  const existing = await cloudflareFetch(
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`,
  );

  const payload = {
    type: 'CNAME',
    name,
    content,
    proxied: true,
    ttl: 1,
  };

  const cname = (existing ?? []).find((r) => r.type === 'CNAME');
  const conflicts = (existing ?? []).filter((r) => r.type !== 'CNAME');

  for (const record of conflicts) {
    await cloudflareFetch(`/zones/${zoneId}/dns_records/${record.id}`, { method: 'DELETE' });
    console.log(`  ✓ Removed old ${record.type} record: ${name} → ${record.content}`);
  }

  if (cname?.id) {
    if (cname.content === content && cname.proxied) {
      console.log(`  · DNS unchanged: ${name}`);
      return;
    }
    await cloudflareFetch(`/zones/${zoneId}/dns_records/${cname.id}`, {
      method: 'PATCH',
      body: payload,
    });
    console.log(`  ✓ Updated DNS: ${name} → ${content}`);
    return;
  }

  await cloudflareFetch(`/zones/${zoneId}/dns_records`, { method: 'POST', body: payload });
  console.log(`  ✓ Created DNS: ${name} → ${content}`);
}

async function setCloudflareSslFull(zoneId) {
  try {
    await cloudflareFetch(`/zones/${zoneId}/settings/ssl`, {
      method: 'PATCH',
      body: { value: 'strict' },
    });
    console.log('  ✓ SSL mode: Full (strict)');
  } catch (err) {
    console.warn(`  ⚠ Could not set SSL mode: ${err.message}`);
  }
}

async function wireCloudflareDns(domain) {
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    console.log('\nCloudflare DNS skipped — add CLOUDFLARE_API_TOKEN to .env.seed.tmp and re-run.');
    return false;
  }

  console.log(`\nSTEP — Cloudflare DNS for ${domain}`);
  const zoneId = await resolveCloudflareZoneId(domain);
  console.log(`  Zone: ${zoneId}`);
  await upsertCloudflareCname(zoneId, domain, VERCEL_CNAME);
  await upsertCloudflareCname(zoneId, `www.${domain}`, VERCEL_CNAME);
  await setCloudflareSslFull(zoneId);
  return true;
}

async function createInitialDeployment(projectId, projectName) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  const project = await vercelFetch(`/v9/projects/${projectId}${teamQuery}`);
  const link = project.link;
  if (!link?.type || !link?.repoId) {
    console.log('  · No git link on project — deploy by pushing to main');
    return;
  }

  const deployments = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=1${teamId ? `&teamId=${teamId}` : ''}`,
  );
  if (deployments.deployments?.length) return;

  const ref = link.productionBranch || 'main';
  await vercelFetch(`/v13/deployments${teamQuery}`, {
    method: 'POST',
    body: {
      name: projectName,
      project: projectId,
      target: 'production',
      gitSource: {
        type: link.type,
        repoId: link.repoId,
        ref,
      },
    },
  });
  console.log(`  ✓ Triggered initial production deploy from git (${ref})`);
}

async function collectClientEnv(backOfficeProjectId) {
  const env = await readProjectEnv(backOfficeProjectId);
  const out = {
    NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID:
      process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim() ||
      process.env.CUSTOMER_MENU_COMPANY_ID?.trim() ||
      DEFAULT_COMPANY_ID,
    NEXT_PUBLIC_CUSTOMER_MENU_HOST: MENU_DOMAIN,
    NEXT_PUBLIC_CUSTOMER_MENU_URL: `https://${MENU_DOMAIN}`,
  };

  for (const key of CLIENT_ENV_KEYS) {
    const hit = env.get(key);
    if (hit?.value) out[key] = hit.value;
  }

  for (const key of CLIENT_ENV_KEYS) {
    if (!out[key] && process.env[key]) out[key] = process.env[key];
  }

  return out;
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error('VERCEL_TOKEN missing — add to .env.seed.tmp');
    process.exit(1);
  }

  console.log(`\nWiring customer menu domain ${MENU_DOMAIN}…`);

  const backOffice = await resolveProjectId(BACK_OFFICE_PROJECT);
  console.log(`\nBack-office: ${BACK_OFFICE_PROJECT} (${backOffice.id})`);
  await removeDomainFromProject(backOffice.id, MENU_DOMAIN);
  await removeDomainFromProject(backOffice.id, MENU_WWW);

  const client = await resolveProjectId(CLIENT_PWA_PROJECT, {
    rootDirectory: 'apps/client-pwa',
    createIfMissing: true,
  });
  if (client.created) {
    console.log(`\n✓ Created Vercel project: ${client.name} (${client.id})`);
  } else {
    console.log(`\nClient PWA: ${client.name} (${client.id})`);
  }

  await addDomainToProject(client.id, MENU_DOMAIN);
  await addDomainToProject(client.id, MENU_WWW);

  const clientEnv = await collectClientEnv(backOffice.id);
  await upsertProjectEnv(client.id, clientEnv);
  await createInitialDeployment(client.id, client.name);
  await triggerRedeploy(client.id, client.name);

  const dnsDone = await wireCloudflareDns(MENU_DOMAIN);

  console.log(`
Done.${dnsDone ? '' : ' Finish DNS in Cloudflare:'}
${dnsDone ? `  https://${MENU_DOMAIN} should resolve after DNS propagates (up to ~24h from LK registry NS change).` : `
  1. Add CLOUDFLARE_API_TOKEN to .env.seed.tmp → npm run connect:customer-menu
  2. Or manually: CNAME @ and www → ${VERCEL_CNAME} (proxied)`}

Orders → café front office: Back-office → Café Front → Orders (/cafe-front/orders)
Publish menu: Executive → Café → Menu (save once)
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
