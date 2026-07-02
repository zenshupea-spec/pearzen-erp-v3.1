#!/usr/bin/env node
/**
 * U-31 — redeploy all CVS production apps after UX handover fixes.
 *
 * Run: npm run deploy:cvs-production
 *      npm run deploy:cvs-production -- --dry-run
 *      npm run deploy:cvs-production -- --back-office-only
 *
 * Writes: audit-evidence/cvs/u-31-production-deploy.json
 */

import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/u-31-production-deploy.json');

const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FIELD_PWA_PROJECT =
  process.env.VERCEL_FIELD_PWA_PROJECT?.trim() || 'pearzen-erp-field-pwa';
const SM_PWA_PROJECT =
  process.env.VERCEL_SM_PWA_PROJECT?.trim() || 'pearzen-erp-sm-pwa';
const CLIENT_PWA_PROJECT =
  process.env.VERCEL_CLIENT_PWA_PROJECT?.trim() || 'pearzen-erp-client-pwa';

const TENANT_ERP_PROJECT_ID =
  process.env.VERCEL_TENANT_ERP_PROJECT_ID?.trim() ||
  process.env.VERCEL_PROJECT_ID?.trim();

const SMOKE_HOSTS = [
  { id: 'cvshq', host: 'cvshq.pearzen.tech', path: '/login/hq' },
  { id: 'cvsexec', host: 'cvsexec.pearzen.tech', path: '/login/md' },
  { id: 'cvsom', host: 'cvsom.pearzen.tech', path: '/login/om' },
  { id: 'cvstm', host: 'cvstm.pearzen.tech', path: '/login/tm' },
  { id: 'cvssm', host: 'cvssm.pearzen.tech', path: '/login' },
  { id: 'cv-field', host: 'cv.pearzen.tech', path: '/login' },
  { id: 'tasha', host: 'tasha.lk', path: '/' },
  { id: 'shalom-guest', host: 'shalom.pearzen.tech', path: '/' },
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const skipBuild = args.has('--skip-build');
const backOfficeOnly = args.has('--back-office-only');

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

function runCmd(label, cmd, args, envExtra = {}) {
  console.log(`\n▶ ${label}`);
  if (dryRun) {
    console.log(`  --dry-run: would run ${cmd} ${args.join(' ')}`);
    return { status: 0, stdout: 'dry-run', deploymentUrl: null, deploymentId: null };
  }

  const env = { ...process.env, ...envExtra };
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.stdout) process.stdout.write(r.stdout.slice(-2000));
  if (r.stderr) process.stderr.write(r.stderr.slice(-1500));

  const idMatch = out.match(/dpl_[A-Za-z0-9]+/);
  const urlMatch = out.match(/https:\/\/[^\s"\\]+\.vercel\.app/);

  if (r.status !== 0) {
    throw new Error(`${label} failed (exit ${r.status})`);
  }

  console.log(`✓ ${label}${idMatch ? ` — ${idMatch[0]}` : ''}`);
  return {
    status: r.status,
    deploymentId: idMatch?.[0] ?? null,
    deploymentUrl: urlMatch?.[0] ?? null,
    tail: out.slice(-500),
  };
}

async function vercelFetch(path) {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const sep = path.includes('?') ? '&' : '?';
  const url = teamId
    ? `https://api.vercel.com${path}${sep}teamId=${teamId}`
    : `https://api.vercel.com${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || res.statusText);
  return json;
}

async function resolveProjectId(name) {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const q = teamId ? `?teamId=${teamId}` : '';
  const data = await vercelFetch(`/v9/projects${q}`);
  const match = data.projects?.find((p) => p.name === name);
  if (!match?.id) throw new Error(`Vercel project not found: ${name}`);
  return match.id;
}

async function smokeHost({ id, host, path }) {
  const url = `https://${host}${path}`;
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'pearzen-u31-deploy-smoke/1.0' },
      signal: AbortSignal.timeout(25_000),
    });
    const ok = res.status >= 200 && res.status < 400;
    return { id, host, path, status: res.status, ok };
  } catch (err) {
    return { id, host, path, status: 0, ok: false, error: String(err.message || err) };
  }
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  const token = process.env.VERCEL_TOKEN?.trim();
  const orgId =
    process.env.VERCEL_ORG_ID?.trim() ||
    process.env.VERCEL_TEAM_ID?.trim();
  if (!token || !orgId) {
    console.error('Missing VERCEL_TOKEN or VERCEL_TEAM_ID / VERCEL_ORG_ID in .env.seed.tmp');
    process.exit(1);
  }

  const deploys = [];
  const runAt = new Date().toISOString();

  console.log('\nCVS production redeploy (U-31)\n');

  if (!skipBuild && !dryRun) {
    runCmd('Pre-deploy build gates', 'npm', ['run', 'verify:cvs-build-gates']);
  } else if (!skipBuild && dryRun) {
    console.log('▶ Pre-deploy: would run npm run verify:cvs-build-gates');
  }

  const backOfficeProjectId =
    TENANT_ERP_PROJECT_ID || (await resolveProjectId(BACK_OFFICE_PROJECT));

  deploys.push({
    app: 'back-office',
    project: BACK_OFFICE_PROJECT,
    ...runCmd('Deploy back-office (tenant-erp)', 'npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', '--archive=tgz'], {
      VERCEL_ORG_ID: orgId,
      VERCEL_PROJECT_ID: backOfficeProjectId,
      PEARZEN_DEPLOYMENT_MODE: 'tenant-erp',
    }),
  });

  if (!backOfficeOnly) {
    const fieldId = await resolveProjectId(FIELD_PWA_PROJECT);
    deploys.push({
      app: 'field-pwa',
      project: FIELD_PWA_PROJECT,
      ...runCmd('Deploy field-pwa', 'npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', '--archive=tgz'], {
        VERCEL_ORG_ID: orgId,
        VERCEL_PROJECT_ID: fieldId,
      }),
    });

    const smId = await resolveProjectId(SM_PWA_PROJECT);
    deploys.push({
      app: 'sm-pwa',
      project: SM_PWA_PROJECT,
      ...runCmd('Deploy sm-pwa', 'npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', '--archive=tgz'], {
        VERCEL_ORG_ID: orgId,
        VERCEL_PROJECT_ID: smId,
      }),
    });

    const clientId = await resolveProjectId(CLIENT_PWA_PROJECT);
    deploys.push({
      app: 'client-pwa',
      project: CLIENT_PWA_PROJECT,
      ...runCmd('Deploy client-pwa (tasha.lk)', 'npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', '--archive=tgz'], {
        VERCEL_ORG_ID: orgId,
        VERCEL_PROJECT_ID: clientId,
      }),
    });
  }

  console.log('\n▶ Post-deploy smoke (production hosts)');
  const smoke = [];
  for (const host of SMOKE_HOSTS) {
    if (backOfficeOnly && !['cvshq', 'cvsexec', 'cvsom', 'cvstm'].includes(host.id)) continue;
    const result = dryRun
      ? { ...host, status: 0, ok: true, skipped: true }
      : await smokeHost(host);
    smoke.push(result);
    const mark = result.ok ? '✓' : '✗';
    console.log(`  ${mark} ${host.host}${host.path} → ${result.status || 'skip'}${result.error ? ` (${result.error})` : ''}`);
  }

  const smokeFail = smoke.filter((s) => !s.ok && !s.skipped);
  const evidence = {
    step: 'U-31',
    runAt,
    status: smokeFail.length ? 'FAIL' : 'PASS',
    deploys: deploys.map(({ app, project, deploymentId, deploymentUrl }) => ({
      app,
      project,
      deploymentId,
      deploymentUrl,
    })),
    smoke,
    notes: [
      'Redeploy after U-0–U-29 UX handover (vault UX, tasha stock badges, mock sweep, etc.).',
      backOfficeOnly ? 'PWAs skipped (--back-office-only).' : 'All four CVS apps deployed.',
    ],
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  if (smokeFail.length) {
    console.error(`\n✗ U-31 deploy finished but ${smokeFail.length} smoke check(s) failed`);
    process.exit(1);
  }

  console.log(`\n✓ U-31 production deploy PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
