/**
 * Shared Vercel + Porkbun helpers for pearzen.tech domain connect scripts (S-22).
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(LIB_DIR, '../..');

export const VERCEL_CNAME = 'cname.vercel-dns.com';
export const VERCEL_APEX_A = '76.76.21.21';

export function pearzenDomain() {
  return process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';
}

export function parseConnectArgs(argv = process.argv.slice(2)) {
  return { dryRun: argv.includes('--dry-run') };
}

export function loadEnv() {
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

export function loadVercelCliAuth() {
  if (process.env.VERCEL_TOKEN?.trim()) return;
  const authPath = join(homedir(), 'Library/Application Support/com.vercel.cli/auth.json');
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.token) process.env.VERCEL_TOKEN = auth.token;
  } catch {
    /* CLI not logged in */
  }
}

export function loadVercelRepoLink() {
  const repoPath = join(ROOT, '.vercel/repo.json');
  try {
    const repo = JSON.parse(readFileSync(repoPath, 'utf8'));
    const backOffice = repo.projects?.find((p) => p.name?.includes('back-office'));
    if (backOffice) {
      if (!process.env.VERCEL_PROJECT_ID) process.env.VERCEL_PROJECT_ID = backOffice.id;
      if (!process.env.VERCEL_TEAM_ID) process.env.VERCEL_TEAM_ID = backOffice.orgId;
      if (!process.env.VERCEL_BACK_OFFICE_PROJECT) {
        process.env.VERCEL_BACK_OFFICE_PROJECT = backOffice.name;
      }
    }
  } catch {
    /* not linked */
  }
}

function teamQuery(extra = '') {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const parts = [];
  if (teamId) parts.push(`teamId=${teamId}`);
  if (extra) parts.push(extra);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function vercelFetch(path, { method = 'GET', body } = {}) {
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

export async function resolveProjectId(projectName) {
  const projects = await vercelFetch(`/v9/projects${teamQuery()}`);
  const match = projects.projects?.find((p) => p.name === projectName);
  if (!match?.id) {
    throw new Error(`Could not find Vercel project "${projectName}"`);
  }
  return match.id;
}

function printDnsTable(dnsRecords) {
  console.log('  Type    Host     Value');
  for (const rec of dnsRecords) {
    console.log(`  ${rec.type.padEnd(7)} ${(rec.name || '@').padEnd(8)} ${rec.content}`);
  }
}

export function printConnectPlan({ label, projectName, domains, dnsRecords, vercelEnv }) {
  console.log(`\n── ${label} ──`);
  console.log(`Vercel project: ${projectName}`);
  console.log('\nDomains:');
  for (const name of domains) console.log(`  • ${name}`);
  console.log('\nPorkbun DNS records:');
  printDnsTable(dnsRecords);
  if (vercelEnv && Object.keys(vercelEnv).length) {
    console.log('\nProduction env (Vercel):');
    for (const [key, value] of Object.entries(vercelEnv)) {
      console.log(`  ${key}=${value}`);
    }
  }
}

async function addVercelDomains(projectId, domains, dryRun) {
  for (const name of domains) {
    if (dryRun) {
      console.log(`  [dry-run] ADD Vercel domain: ${name}`);
      continue;
    }
    try {
      await vercelFetch(`/v10/projects/${projectId}/domains${teamQuery()}`, {
        method: 'POST',
        body: { name },
      });
      console.log(`  ✓ Added Vercel domain: ${name}`);
    } catch (err) {
      if (String(err.message).includes('already') || String(err.message).includes('409')) {
        console.log(`  · Already on Vercel: ${name}`);
      } else {
        console.warn(`  ⚠ ${name}: ${err.message}`);
      }
    }
  }
}

async function upsertVercelEnv(projectId, vercelEnv, dryRun) {
  if (!vercelEnv || !Object.keys(vercelEnv).length) return;

  const existing = await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`);
  const envs = existing.envs ?? [];

  for (const [key, value] of Object.entries(vercelEnv)) {
    if (dryRun) {
      console.log(`  [dry-run] UPSERT env ${key}`);
      continue;
    }
    const hit = envs.find((e) => e.key === key && e.target?.includes('production'));
    if (hit) {
      await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
        method: 'PATCH',
        body: { value, target: ['production'], type: 'plain' },
      });
      console.log(`  ✓ Updated Vercel env: ${key}`);
    } else {
      await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
        method: 'POST',
        body: { key, value, type: 'plain', target: ['production'] },
      });
      console.log(`  ✓ Created Vercel env: ${key}`);
    }
  }
}

async function triggerRedeploy(projectId, projectName, dryRun) {
  if (dryRun) {
    console.log('  [dry-run] Trigger production redeploy');
    return;
  }

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const deployments = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=1&target=production${teamId ? `&teamId=${teamId}` : ''}`,
  );
  const latest = deployments.deployments?.[0];
  if (!latest?.uid) {
    console.log('  · No prior production deployment — redeploy from Vercel dashboard after DNS is live.');
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
  console.log('  ✓ Triggered production redeploy');
}

async function syncPorkbunDns(domain, dnsRecords, dryRun) {
  if (dryRun) {
    console.log('  [dry-run] Sync Porkbun DNS:');
    printDnsTable(dnsRecords);
    return;
  }

  const { records = [] } = await porkbunFetch(`dns/retrieve/${domain}`, {});

  for (const rec of dnsRecords) {
    const exists = records.some(
      (r) =>
        r.type === rec.type &&
        (r.name === rec.name || (rec.name === '' && (r.name === '' || r.name === '@'))) &&
        r.content === rec.content,
    );
    if (exists) {
      console.log(`  · DNS already set: ${rec.type} ${rec.name || '@'} → ${rec.content}`);
      continue;
    }

    await porkbunFetch(`dns/create/${domain}`, {
      name: rec.name,
      type: rec.type,
      content: rec.content,
      ttl: 600,
    });
    console.log(`  ✓ Created DNS: ${rec.type} ${rec.name || '@'} → ${rec.content}`);
  }
}

/**
 * @param {{
 *   label: string,
 *   projectName: string,
 *   domains: string[],
 *   dnsRecords: { name: string, type: string, content: string }[],
 *   vercelEnv?: Record<string, string>,
 *   dryRun: boolean,
 *   skipDns?: boolean,
 * }} config
 */
export async function runDomainConnect(config) {
  const { label, projectName, domains, dnsRecords, vercelEnv, dryRun, skipDns } = config;

  printConnectPlan({ label, projectName, domains, dnsRecords, vercelEnv });

  if (dryRun) {
    console.log('\n(dry-run — no API changes)\n');
    return;
  }

  const hasVercel = Boolean(process.env.VERCEL_TOKEN?.trim());
  const hasPorkbun =
    Boolean(process.env.PORKBUN_API_KEY?.trim()) &&
    Boolean(process.env.PORKBUN_SECRET_API_KEY?.trim());

  if (!hasVercel && !hasPorkbun) {
    console.log('\nMissing VERCEL_TOKEN and/or Porkbun API keys — plan only (see above).\n');
    return;
  }

  const domain = pearzenDomain();

  if (!skipDns && hasPorkbun && dnsRecords.length) {
    console.log(`\n${label} — Porkbun DNS`);
    try {
      await syncPorkbunDns(domain, dnsRecords, false);
    } catch (err) {
      console.error(`  ⚠ Porkbun DNS failed: ${err.message}`);
    }
  }

  if (hasVercel) {
    console.log(`\n${label} — Vercel domains + env`);
    const projectId = await resolveProjectId(projectName);
    console.log(`  Project: ${projectName} (${projectId})`);
    await addVercelDomains(projectId, domains, false);
    await upsertVercelEnv(projectId, vercelEnv, false);
    await triggerRedeploy(projectId, projectName, false);
  }
}
