#!/usr/bin/env node
/**
 * Sync PayHere + service-role env to Vercel client-pwa (tasha.lk).
 * Run: npm run setup:customer-menu-vercel-env
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_PWA_PROJECT = process.env.VERCEL_CLIENT_PWA_PROJECT?.trim() || 'pearzen-erp-client-pwa';
const MENU_DOMAIN = process.env.CUSTOMER_MENU_DOMAIN?.trim() || 'tasha.lk';

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

function teamQuery() {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return teamId ? `?teamId=${teamId}` : '';
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

async function resolveProjectId(name) {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  const match = (data.projects ?? []).find((p) => p.name === name);
  if (!match?.id) throw new Error(`Vercel project not found: ${name}`);
  return match.id;
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

async function upsertEnv(projectId, key, value, { sensitive = false } = {}) {
  if (!value) {
    console.log(`  · Skipped (no local value): ${key}`);
    return;
  }

  const existing = await readProjectEnv(projectId);
  const hit = existing.get(key);
  const type = sensitive ? 'encrypted' : 'plain';
  const target = ['production', 'preview', 'development'];

  if (hit) {
    try {
      await vercelFetch(`/v10/projects/${projectId}/env/${hit.id}${teamQuery()}`, {
        method: 'PATCH',
        body: { value, target, type },
      });
      console.log(`  ✓ Updated env: ${key}`);
    } catch (err) {
      if (String(err.message).includes('Sensitive Environment Variable')) {
        console.log(`  · Skipped sensitive update (already set): ${key}`);
      } else {
        throw err;
      }
    }
    return;
  }

  await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
    method: 'POST',
    body: { key, value, type, target },
  });
  console.log(`  ✓ Created env: ${key}`);
}

async function triggerRedeploy(projectId, projectName) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const deployments = await vercelFetch(
    `/v6/deployments?projectId=${projectId}&limit=1&target=production${teamId ? `&teamId=${teamId}` : ''}`,
  );
  const latest = deployments.deployments?.[0];
  if (!latest?.uid) {
    console.log('  · No prior deployment — push to main to deploy');
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

async function main() {
  loadEnv();
  loadVercelCliAuth();

  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error('VERCEL_TOKEN missing — add to .env.seed.tmp');
    process.exit(1);
  }

  console.log(`\nSyncing env → ${CLIENT_PWA_PROJECT} (${MENU_DOMAIN})…`);
  const projectId = await resolveProjectId(CLIENT_PWA_PROJECT);

  await upsertEnv(projectId, 'NEXT_PUBLIC_CUSTOMER_MENU_URL', `https://${MENU_DOMAIN}`);
  await upsertEnv(projectId, 'NEXT_PUBLIC_CUSTOMER_MENU_HOST', MENU_DOMAIN);
  await upsertEnv(
    projectId,
    'NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID',
    process.env.NEXT_PUBLIC_CUSTOMER_MENU_COMPANY_ID?.trim() ||
      '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e',
  );
  await upsertEnv(projectId, 'NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  await upsertEnv(projectId, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  await upsertEnv(projectId, 'SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY, {
    sensitive: true,
  });
  await upsertEnv(projectId, 'PAYHERE_SANDBOX', process.env.PAYHERE_SANDBOX?.trim() || 'true');
  await upsertEnv(projectId, 'PAYHERE_MERCHANT_ID', process.env.PAYHERE_MERCHANT_ID?.trim(), {
    sensitive: true,
  });
  await upsertEnv(projectId, 'PAYHERE_MERCHANT_SECRET', process.env.PAYHERE_MERCHANT_SECRET?.trim(), {
    sensitive: true,
  });

  await triggerRedeploy(projectId, CLIENT_PWA_PROJECT);

  const missingPayHere =
    !process.env.PAYHERE_MERCHANT_ID?.trim() || !process.env.PAYHERE_MERCHANT_SECRET?.trim();
  if (missingPayHere) {
    console.log(`
PayHere keys not in .env.seed.tmp — card checkout will show "not configured" until you:
  1. Sign up at https://www.payhere.lk and get sandbox Merchant ID + Secret
  2. Add PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET to .env.seed.tmp
  3. Re-run: npm run setup:customer-menu-vercel-env
`);
  } else {
    console.log('\nDone — tasha.lk will redeploy with PayHere + service role env.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
