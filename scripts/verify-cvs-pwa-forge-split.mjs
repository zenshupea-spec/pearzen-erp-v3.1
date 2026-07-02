#!/usr/bin/env node
/**
 * S-24 — verify field-pwa + sm-pwa still on CVS hosts after Forge split.
 *
 * Run:
 *   npm run verify:cvs-pwa-forge-split
 *   npm run verify:cvs-pwa-forge-split -- --audit
 */

import { homedir } from 'os';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-24-pwa-cvs-hosts-verified.txt');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';

const FIELD_PROJECT =
  process.env.VERCEL_FIELD_PWA_PROJECT?.trim() || 'pearzen-erp-field-pwa';
const SM_PROJECT = process.env.VERCEL_SM_PWA_PROJECT?.trim() || 'pearzen-erp-sm-pwa';

const CVS_FIELD_HOST = process.env.FIELD_PWA_DOMAIN?.trim() || `cv.${DOMAIN}`;
const CVS_SM_HOST = process.env.SM_PWA_DOMAIN?.trim() || `cvssm.${DOMAIN}`;

const FORGE_EXACT_HOSTS = new Set([
  DOMAIN,
  `www.${DOMAIN}`,
  `forge.${DOMAIN}`,
  `superadmin.${DOMAIN}`,
  `erp.${DOMAIN}`,
  `partners.${DOMAIN}`,
]);

function isForgePlatformHost(host) {
  if (host.endsWith('.vercel.app')) return false;
  return FORGE_EXACT_HOSTS.has(host);
}

const args = new Set(process.argv.slice(2));
const auditOnly = args.has('--audit');

const failures = [];
const lines = [];

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

async function vercelFetch(path) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error('VERCEL_TOKEN missing');
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || res.statusText);
  return json;
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

async function findProject(name) {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  return data.projects?.find((p) => p.name === name) ?? null;
}

function auditPwaDomains(projectName, domains, requiredCvsHost) {
  lines.push(`\n${projectName} domains (${domains.length}):`);
  for (const d of domains) lines.push(`  · ${d}`);

  if (!domains.includes(requiredCvsHost)) {
    failures.push(`${projectName} missing CVS host: ${requiredCvsHost}`);
  }

  const forgeLeaks = domains.filter(isForgePlatformHost);
  if (forgeLeaks.length) {
    failures.push(`${projectName} has forge/platform hosts: ${forgeLeaks.join(', ')}`);
  }
}

async function httpSmoke(host) {
  const url = `https://${host}/`;
  const res = await fetch(url, { redirect: 'manual' });
  lines.push(`  GET ${url} → ${res.status}`);
  if (res.status === 404) {
    failures.push(`${host} returned 404`);
  } else if (res.status >= 500) {
    failures.push(`${host} returned ${res.status}`);
  }
  return res.status;
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  lines.push('FORGE ↔ CVS ISOLATION — S-24 PWA CVS hosts verified');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  if (!process.env.VERCEL_TOKEN?.trim()) {
    failures.push('VERCEL_TOKEN missing — domain audit skipped');
  } else {
    const field = await findProject(FIELD_PROJECT);
    const sm = await findProject(SM_PROJECT);
    if (!field) failures.push(`Project not found: ${FIELD_PROJECT}`);
    if (!sm) failures.push(`Project not found: ${SM_PROJECT}`);

    if (field) auditPwaDomains(FIELD_PROJECT, await listProjectDomains(field.id), CVS_FIELD_HOST);
    if (sm) auditPwaDomains(SM_PROJECT, await listProjectDomains(sm.id), CVS_SM_HOST);
  }

  lines.push('\nHTTP smoke (production):');
  try {
    await httpSmoke(CVS_FIELD_HOST);
    await httpSmoke(CVS_SM_HOST);
  } catch (err) {
    failures.push(`HTTP smoke failed: ${err.message}`);
  }

  lines.push('\nVercel preview isolation (isolate:vercel-preview-env --audit):');
  const iso = spawnSync(process.execPath, [join(ROOT, 'scripts/isolate-vercel-preview-env.mjs'), '--audit'], {
    encoding: 'utf8',
    env: process.env,
  });
  const isoOut = (iso.stdout || '') + (iso.stderr || '');
  const backOfficeOk = isoOut.includes('NEXT_PUBLIC_SUPABASE_URL production-only');
  const clientPwaWarn = isoOut.includes('pearzen-erp-client-pwa');
  lines.push(`  back-office Supabase production-only: ${backOfficeOk ? 'YES' : 'NO'}`);
  lines.push(`  client-pwa preview/dev Supabase scope: DOCUMENTED EXCEPTION (café menu — not CVS staff)`);
  lines.push(`  field-pwa + sm-pwa: not in isolate script scope (separate Vercel projects; CVS hosts only)`);
  if (!backOfficeOk) failures.push('back-office preview isolation audit failed');
  if (clientPwaWarn) {
    lines.push('  client-pwa audit flags (expected): Supabase trio on preview+dev — remediate separately');
  }

  if (failures.length) {
    lines.push('\nFAILURES:');
    for (const f of failures) lines.push(`  · ${f}`);
  } else {
    lines.push('\nStatus: PASS');
  }

  const report = lines.join('\n');
  console.log(report);

  if (!auditOnly) {
    writeFileSync(EVIDENCE, `${report}\n`);
    console.log(`\nWrote ${EVIDENCE}`);
  }

  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
