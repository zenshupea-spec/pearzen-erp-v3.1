#!/usr/bin/env node
/**
 * Wire classicventuresecurity.com → Vercel back-office (public /security-website) + Porkbun DNS.
 *
 * Requires in .env.seed.tmp (or env):
 *   VERCEL_TOKEN
 *   PORKBUN_API_KEY
 *   PORKBUN_SECRET_API_KEY
 *
 * Run: npm run connect:classicventure-security
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = process.env.CLASSIC_VENTURE_SECURITY_DOMAIN?.trim() || 'classicventure.com';
const VERCEL_CNAME = 'cname.vercel-dns.com';
const VERCEL_APEX_A = '76.76.21.21';
const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';

const DOMAINS_TO_ADD = [DOMAIN, `www.${DOMAIN}`];

const DNS_RECORDS = [
  { name: '', type: 'A', content: VERCEL_APEX_A },
  { name: 'www', type: 'CNAME', content: VERCEL_CNAME },
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
      `Could not find back-office Vercel project (looked for "${BACK_OFFICE_PROJECT}").`,
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

  const key = 'NEXT_PUBLIC_SECURITY_WEBSITE_HOST';
  const value = DOMAIN;

  const hit = envs.find((e) => e.key === key && e.target?.includes('production'));
  if (hit) {
    await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery}`, {
      method: 'PATCH',
      body: { value, target: ['production'], type: 'plain' },
    });
    console.log(`  ✓ Updated Vercel env: ${key}=${value}`);
  } else {
    await vercelFetch(`/v10/projects/${projectId}/env${teamQuery}`, {
      method: 'POST',
      body: { key, value, type: 'plain', target: ['production'] },
    });
    console.log(`  ✓ Created Vercel env: ${key}=${value}`);
  }
}

async function syncPorkbunDns() {
  const { records = [] } = await porkbunFetch(`dns/retrieve/${DOMAIN}`, {});

  // Remove Porkbun parking / URL-forward records that block Vercel.
  const parkingTargets = ['uixie.porkbun.com', 'pixie.porkbun.com'];
  for (const rec of records) {
    const isParking =
      (rec.type === 'ALIAS' && parkingTargets.some((t) => rec.content?.includes(t))) ||
      (rec.type === 'CNAME' &&
        rec.name?.startsWith('*.') &&
        parkingTargets.some((t) => rec.content?.includes(t)));
    if (isParking) {
      await porkbunFetch(`dns/delete/${DOMAIN}/${rec.id}`, {});
      console.log(`  ✓ Removed parking DNS: ${rec.type} ${rec.name} → ${rec.content}`);
    }
  }

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

async function main() {
  loadEnv();
  loadVercelCliAuth();
  loadVercelRepoLink();

  console.log(`\nConnecting ${DOMAIN} → Classic Venture public security website…\n`);

  const hasVercel = Boolean(process.env.VERCEL_TOKEN?.trim());
  const hasPorkbun =
    Boolean(process.env.PORKBUN_API_KEY?.trim()) &&
    Boolean(process.env.PORKBUN_SECRET_API_KEY?.trim());

  if (!hasVercel || !hasPorkbun) {
    console.log('Missing API credentials. Add to .env.seed.tmp:\n');
    if (!hasVercel) console.log('  VERCEL_TOKEN=…');
    if (!hasPorkbun) {
      console.log('  PORKBUN_API_KEY=…');
      console.log('  PORKBUN_SECRET_API_KEY=…');
    }
    console.log('\nManual DNS (Porkbun → classicventuresecurity.com → DNS):\n');
    for (const rec of DNS_RECORDS) {
      console.log(`  ${rec.type.padEnd(7)} ${(rec.name || '@').padEnd(8)} ${rec.content}`);
    }
    console.log('\nManual Vercel domains (back-office → Settings → Domains):');
    for (const name of DOMAINS_TO_ADD) console.log(`  • ${name}`);
    console.log('');
  }

  if (hasPorkbun) {
    console.log('STEP 1 — Porkbun DNS');
    try {
      await syncPorkbunDns();
    } catch (err) {
      console.error(`  ⚠ Porkbun DNS failed: ${err.message}`);
    }
  }

  if (hasVercel) {
    console.log('\nSTEP 2 — Vercel domains + env');
    const projectId = await resolveProjectId();
    console.log(`  Project: ${BACK_OFFICE_PROJECT} (${projectId})`);
    await addVercelDomains(projectId);
    await upsertVercelEnv(projectId);
  }

  console.log(`
Done. After DNS propagates (5–60 min), verify:
  https://${DOMAIN}              → redirects to /security-website
  https://www.${DOMAIN}/security-website
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
