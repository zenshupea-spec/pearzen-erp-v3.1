#!/usr/bin/env node
/**
 * Wire pearzen.tech → Vercel back-office + Porkbun DNS.
 *
 * Requires in .env.seed.tmp (or env):
 *   VERCEL_TOKEN          — https://vercel.com/account/settings/tokens
 *   PORKBUN_API_KEY       — Porkbun → Account → API Access
 *   PORKBUN_SECRET_API_KEY
 *
 * Run: npm run connect:pearzen-tech
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';
const VERCEL_CNAME = 'cname.vercel-dns.com';
const VERCEL_APEX_A = '76.76.21.21';
const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';

const TENANT_SUBDOMAINS = (process.env.PEARZEN_TENANT_SUBDOMAINS ?? 'cvs')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DOMAINS_TO_ADD = [
  DOMAIN,
  `www.${DOMAIN}`,
  `forge.${DOMAIN}`,
  `erp.${DOMAIN}`,
  `*.${DOMAIN}`,
  ...TENANT_SUBDOMAINS.map((sub) => `${sub}.${DOMAIN}`),
];

const DNS_RECORDS = [
  { name: '', type: 'A', content: VERCEL_APEX_A },
  { name: 'www', type: 'CNAME', content: VERCEL_CNAME },
  { name: 'forge', type: 'CNAME', content: VERCEL_CNAME },
  { name: 'erp', type: 'CNAME', content: VERCEL_CNAME },
  { name: 'sm', type: 'CNAME', content: VERCEL_CNAME },
  { name: 'field', type: 'CNAME', content: VERCEL_CNAME },
  { name: '*', type: 'CNAME', content: VERCEL_CNAME },
  ...TENANT_SUBDOMAINS.map((sub) => ({ name: sub, type: 'CNAME', content: VERCEL_CNAME })),
];

const VERCEL_ENV = {
  NEXT_PUBLIC_TENANT_BASE_DOMAIN: DOMAIN,
  NEXT_PUBLIC_FORGE_HOST: `forge.${DOMAIN}`,
  NEXT_PUBLIC_BACK_OFFICE_URL: `https://${TENANT_SUBDOMAINS[0] ?? 'cvs'}.${DOMAIN}`,
  NEXT_PUBLIC_TENANT_SUBDOMAINS_LIVE: 'true',
  NEXT_PUBLIC_PLATFORM_HOSTS: `${BACK_OFFICE_PROJECT}.vercel.app`,
  NEXT_PUBLIC_SM_PWA_URL: `https://sm.${DOMAIN}`,
  NEXT_PUBLIC_FIELD_PWA_URL: `https://field.${DOMAIN}`,
};

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

function loadVercelRepoLink() {
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

async function resolveProjectId() {
  const preset = process.env.VERCEL_PROJECT_ID?.trim();
  if (preset) return preset;

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  const projects = await vercelFetch(`/v9/projects${teamQuery}`);
  const match = projects.projects?.find(
    (p) =>
      p.name === BACK_OFFICE_PROJECT ||
      p.name?.includes('back-office') ||
      p.alias?.some?.((a) => a.includes('back-office')),
  );
  if (!match?.id) {
    throw new Error(
      `Could not find back-office Vercel project (looked for "${BACK_OFFICE_PROJECT}"). ` +
        'Set VERCEL_BACK_OFFICE_PROJECT or VERCEL_TEAM_ID in .env.seed.tmp.',
    );
  }
  return match.id;
}

async function addVercelDomains(projectId) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  for (const name of DOMAINS_TO_ADD) {
    try {
      await vercelFetch(`/v10/projects/${projectId}/domains${teamQuery}`, {
        method: 'POST',
        body: { name },
      });
      console.log(`  ✓ Added Vercel domain: ${name}`);
    } catch (err) {
      if (String(err.message).includes('already exists') || String(err.message).includes('409')) {
        console.log(`  · Already on Vercel: ${name}`);
      } else {
        console.warn(`  ⚠ ${name}: ${err.message}`);
      }
    }
  }
}

async function upsertVercelEnv(projectId) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  const existing = await vercelFetch(`/v10/projects/${projectId}/env${teamQuery}`);
  const envs = existing.envs ?? [];

  for (const [key, value] of Object.entries(VERCEL_ENV)) {
    const hit = envs.find((e) => e.key === key && e.target?.includes('production'));
    if (hit) {
      await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery}`, {
        method: 'PATCH',
        body: { value, target: ['production'], type: 'plain' },
      });
      console.log(`  ✓ Updated Vercel env: ${key}`);
    } else {
      await vercelFetch(`/v10/projects/${projectId}/env${teamQuery}`, {
        method: 'POST',
        body: { key, value, type: 'plain', target: ['production'] },
      });
      console.log(`  ✓ Created Vercel env: ${key}`);
    }
  }
}

async function triggerRedeploy(projectId) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const teamQuery = teamId ? `?teamId=${teamId}` : '';
  const deployments = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=1&target=production${teamId ? `&teamId=${teamId}` : ''}`,
  );
  const latest = deployments.deployments?.[0];
  if (!latest?.uid) {
    console.log('  · No prior production deployment — redeploy from Vercel dashboard after DNS is live.');
    return;
  }

  await vercelFetch(`/v13/deployments${teamQuery}`, {
    method: 'POST',
    body: {
      name: BACK_OFFICE_PROJECT,
      project: projectId,
      target: 'production',
      deploymentId: latest.uid,
    },
  });
  console.log('  ✓ Triggered production redeploy');
}

async function syncPorkbunDns() {
  const { records = [] } = await porkbunFetch(`dns/retrieve/${DOMAIN}`, {});

  for (const rec of DNS_RECORDS) {
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

    await porkbunFetch(`dns/create/${DOMAIN}`, {
      name: rec.name,
      type: rec.type,
      content: rec.content,
      ttl: 600,
    });
    console.log(`  ✓ Created DNS: ${rec.type} ${rec.name || '@'} → ${rec.content}`);
  }
}

function runSupabaseAuth() {
  if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    console.log('\n⚠ SUPABASE_ACCESS_TOKEN not set — skipping Supabase auth URLs.');
    return;
  }

  console.log('\nConfiguring Supabase auth redirects…');
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/configure-supabase-production-auth.mjs')],
    {
      stdio: 'inherit',
      env: { ...process.env, NEXT_PUBLIC_TENANT_BASE_DOMAIN: DOMAIN },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  loadEnv();
  loadVercelCliAuth();
  loadVercelRepoLink();

  console.log(`\nConnecting ${DOMAIN} to Pearzen back-office on Vercel…\n`);

  const hasVercel = Boolean(process.env.VERCEL_TOKEN?.trim());
  const hasPorkbun =
    Boolean(process.env.PORKBUN_API_KEY?.trim()) &&
    Boolean(process.env.PORKBUN_SECRET_API_KEY?.trim());

  if (!hasVercel || !hasPorkbun) {
    console.log('Missing API credentials. Add to .env.seed.tmp:\n');
    if (!hasVercel) {
      console.log('  VERCEL_TOKEN=…              # vercel.com/account/settings/tokens');
      console.log('  VERCEL_TEAM_ID=…            # optional, if project is under a team');
    }
    if (!hasPorkbun) {
      console.log('  PORKBUN_API_KEY=…           # porkbun.com/account/api');
      console.log('  PORKBUN_SECRET_API_KEY=…');
    }
    console.log('\nManual DNS (Porkbun → pearzen.tech → DNS):\n');
    console.log('  Type    Host     Value');
    for (const rec of DNS_RECORDS) {
      console.log(`  ${rec.type.padEnd(7)} ${(rec.name || '@').padEnd(8)} ${rec.content}`);
    }
    console.log('\nManual Vercel domains (back-office project → Settings → Domains):');
    for (const name of DOMAINS_TO_ADD) console.log(`  • ${name}`);
    console.log('');
  }

  if (hasPorkbun) {
    console.log('STEP 1 — Porkbun DNS');
    try {
      await syncPorkbunDns();
    } catch (err) {
      console.error(`  ⚠ Porkbun DNS failed: ${err.message}`);
      console.log(
        '  Enable API access at porkbun.com/account/api, then re-run npm run connect:pearzen-tech',
      );
      console.log('\n  Or add DNS manually in Porkbun → pearzen.tech → DNS:\n');
      console.log('  Type    Host     Value');
      for (const rec of DNS_RECORDS) {
        console.log(`  ${rec.type.padEnd(7)} ${(rec.name || '@').padEnd(8)} ${rec.content}`);
      }
      console.log('');
    }
  }

  if (hasVercel) {
    console.log('\nSTEP 2 — Vercel domains + env');
    const projectId = await resolveProjectId();
    console.log(`  Project: ${BACK_OFFICE_PROJECT} (${projectId})`);
    await addVercelDomains(projectId);
    await upsertVercelEnv(projectId);
    await triggerRedeploy(projectId);
  }

  runSupabaseAuth();

  console.log(`
Done. After DNS propagates (5–60 min), verify:
  https://forge.${DOMAIN}/forge
  https://<tenant-slug>.${DOMAIN}/login/head-office
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
