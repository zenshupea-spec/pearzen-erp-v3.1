#!/usr/bin/env node
/**
 * Wire sm.pearzen.tech + field.pearzen.tech to their PWA Vercel projects.
 *
 * Run: npm run connect:pearzen-pwas
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';

const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FIELD_PWA_PROJECT =
  process.env.VERCEL_FIELD_PWA_PROJECT?.trim() || 'pearzen-erp-field-pwa';
const SM_PWA_PROJECT =
  process.env.VERCEL_SM_PWA_PROJECT?.trim() || 'pearzen-erp-sm-pwa';

const FIELD_DOMAIN = `field.${DOMAIN}`;
const SM_DOMAIN = `sm.${DOMAIN}`;

const PWA_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'FIELD_PWA_AUTH_EMAIL_TEMPLATE',
  'FIELD_PWA_AUTH_PASSWORD_TEMPLATE',
];

const FIELD_PWA_ENV = {
  NEXT_PUBLIC_TENANT_BASE_DOMAIN: DOMAIN,
};

const SM_PWA_ENV = {
  NEXT_PUBLIC_TENANT_BASE_DOMAIN: DOMAIN,
};

const SM_ONLY_ENV_KEYS = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

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
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const q = teamId ? `?teamId=${teamId}` : '';
  const data = await vercelFetch(`/v9/projects${q}`);
  return data.projects ?? [];
}

async function resolveProjectId(name, { rootDirectory, createIfMissing = false } = {}) {
  const projects = await listProjects();
  const match = projects.find((p) => p.name === name);
  if (match?.id) return { id: match.id, name: match.name, created: false };

  if (!createIfMissing) {
    throw new Error(`Could not find Vercel project "${name}"`);
  }

  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const backOffice = projects.find((p) => p.name === BACK_OFFICE_PROJECT);
  const gitRepository = backOffice?.link
    ? {
        type: backOffice.link.type,
        repo: backOffice.link.repo,
        repoId: backOffice.link.repoId,
      }
    : undefined;

  const body = {
    name,
    framework: 'nextjs',
    rootDirectory,
    ...(gitRepository ? { gitRepository } : {}),
  };

  const created = await vercelFetch(`/v11/projects${teamQuery()}`, {
    method: 'POST',
    body,
  });

  if (teamId) {
    await vercelFetch(`/v9/projects/${created.id}${teamQuery()}`, {
      method: 'PATCH',
      body: {
        buildCommand: `cd ../.. && npx turbo build --filter=${rootDirectory?.split('/').pop()}`,
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
    console.log(`  ✓ Removed ${domain} from back-office`);
  } catch (err) {
    if (String(err.message).includes('404')) {
      console.log(`  · ${domain} not on back-office`);
    } else {
      console.warn(`  ⚠ Could not remove ${domain} from back-office: ${err.message}`);
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

async function collectSharedEnv(backOfficeProjectId) {
  const env = await readProjectEnv(backOfficeProjectId);
  const out = { ...FIELD_PWA_ENV, ...SM_PWA_ENV };

  for (const key of PWA_ENV_KEYS) {
    const hit = env.get(key);
    if (hit?.value) out[key] = hit.value;
  }

  // Sensitive Vercel env vars are not returned by the API — use local .env.seed.tmp.
  for (const key of PWA_ENV_KEYS) {
    if (!out[key] && process.env[key]) out[key] = process.env[key];
  }
  if (!out.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    out.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  const seedValues = {
    FIELD_PWA_AUTH_EMAIL_TEMPLATE: '{{epfNo}}@pearzen.local',
    FIELD_PWA_AUTH_PASSWORD_TEMPLATE: '{{epfNo}}',
  };
  for (const [key, fallback] of Object.entries(seedValues)) {
    if (!out[key]) out[key] = fallback;
  }

  return out;
}

async function wirePwaProject({ label, projectName, rootDirectory, domain, env }) {
  console.log(`\nSTEP — ${label}`);
  const project = await resolveProjectId(projectName, {
    rootDirectory,
    createIfMissing: label.includes('SM'),
  });
  if (project.created) {
    console.log(`  ✓ Created Vercel project: ${project.name} (${project.id})`);
  } else {
    console.log(`  Project: ${project.name} (${project.id})`);
  }

  await addDomainToProject(project.id, domain);
  await upsertProjectEnv(project.id, env);
  await triggerRedeploy(project.id, project.name);
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  if (!process.env.VERCEL_TOKEN?.trim()) {
    console.error('VERCEL_TOKEN missing — add to .env.seed.tmp');
    process.exit(1);
  }

  console.log(`\nWiring PWA domains on ${DOMAIN}…`);

  const backOfficeId = await resolveProjectId(BACK_OFFICE_PROJECT);
  console.log(`\nBack-office: ${BACK_OFFICE_PROJECT} (${backOfficeId.id})`);
  await removeDomainFromProject(backOfficeId.id, FIELD_DOMAIN);
  await removeDomainFromProject(backOfficeId.id, SM_DOMAIN);

  const sharedEnv = await collectSharedEnv(backOfficeId.id);

  await wirePwaProject({
    label: 'Field PWA (check-in)',
    projectName: FIELD_PWA_PROJECT,
    rootDirectory: 'apps/field-pwa',
    domain: FIELD_DOMAIN,
    env: sharedEnv,
  });

  const smEnv = Object.fromEntries(
    Object.entries(sharedEnv).filter(
      ([key]) => SM_ONLY_ENV_KEYS.has(key) || key === 'NEXT_PUBLIC_TENANT_BASE_DOMAIN',
    ),
  );

  await wirePwaProject({
    label: 'SM PWA',
    projectName: SM_PWA_PROJECT,
    rootDirectory: 'apps/sm-pwa',
    domain: SM_DOMAIN,
    env: smEnv,
  });

  console.log(`
Done. After DNS propagates, verify:
  https://${FIELD_DOMAIN}/login
  https://${SM_DOMAIN}/login
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
