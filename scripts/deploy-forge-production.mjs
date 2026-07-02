#!/usr/bin/env node
/**
 * Post-L2 — deploy pearzen-forge-back-office to Vercel production.
 *
 * Use when Git main deploy failed or apex pearzen.tech shows DEPLOYMENT_NOT_FOUND.
 * Uploads current workspace (not necessarily pushed to GitHub).
 *
 * Run:
 *   npm run deploy:forge-production
 *   npm run deploy:forge-production -- --dry-run
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/post-l2-forge-production-deploy.txt');

const FORGE_PROJECT_ID =
  process.env.VERCEL_FORGE_PROJECT_ID?.trim() || 'prj_MSZhouxH2naKCKIYBmJZWMp8Kwvq';

const dryRun = process.argv.includes('--dry-run');

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

async function checkApex() {
  const res = await fetch('https://pearzen.tech', { redirect: 'manual' });
  return {
    status: res.status,
    error: res.headers.get('x-vercel-error'),
    location: res.headers.get('location'),
  };
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  const token = process.env.VERCEL_TOKEN?.trim();
  const orgId = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  if (!token || !orgId) {
    console.error('Missing VERCEL_TOKEN or VERCEL_TEAM_ID in .env.seed.tmp');
    process.exit(1);
  }

  const before = await checkApex();
  console.log('\nForge production deploy\n');
  console.log(`  Before apex: ${before.status}${before.error ? ` (${before.error})` : ''}`);

  if (dryRun) {
    console.log('\n--dry-run: would run vercel deploy --prod --yes --archive=tgz from repo root');
    process.exit(0);
  }

  const env = {
    ...process.env,
    VERCEL_ORG_ID: orgId,
    VERCEL_PROJECT_ID: FORGE_PROJECT_ID,
    PEARZEN_DEPLOYMENT_MODE: 'forge',
  };

  console.log('  Deploying (archive=tgz)…');
  const r = spawnSync(
    'npx',
    ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes', '--archive=tgz'],
    { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );

  if (r.stdout) process.stdout.write(r.stdout.slice(-3000));
  if (r.stderr) process.stderr.write(r.stderr.slice(-1500));

  if (r.status !== 0) {
    console.error('\n✗ Deploy failed');
    process.exit(r.status ?? 1);
  }

  const after = await checkApex();
  const ok = after.status !== 404 && after.error !== 'DEPLOYMENT_NOT_FOUND';
  console.log(`\n  After apex: ${after.status}${after.location ? ` → ${after.location}` : ''}`);
  console.log(ok ? '\n✓ Forge production deploy OK\n' : '\n⚠ Deploy finished but apex still unhealthy\n');

  const lines = [
    'POST-L2 FOLLOW-UP — Forge production deploy',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Project: pearzen-forge-back-office (${FORGE_PROJECT_ID})`,
    `Before apex: ${before.status} ${before.error ?? ''}`.trim(),
    `After apex: ${after.status} ${after.location ?? after.error ?? ''}`.trim(),
    `CLI exit: ${r.status}`,
    '',
    'Repeatable: npm run deploy:forge-production',
    'Note: uploads local workspace; push main for Git-integrated deploys.',
  ];
  const { writeFileSync, mkdirSync } = await import('fs');
  mkdirSync(dirname(EVIDENCE), { recursive: true });
  writeFileSync(EVIDENCE, `${lines.join('\n')}\n`);
  console.log(`  Evidence: ${EVIDENCE}`);

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
