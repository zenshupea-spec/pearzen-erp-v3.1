#!/usr/bin/env node
/**
 * S-28 operator follow-up — push Vercel deploy secrets to GitHub Actions.
 *
 * Requires:
 *   GITHUB_TOKEN / GH_TOKEN / GITHUB_PAT (repo admin, actions:write)
 *   VERCEL_TOKEN, VERCEL_TEAM_ID in .env.seed.tmp
 *
 * Run:
 *   npm run configure:github-deploy-secrets
 *   npm run configure:github-deploy-secrets -- --dry-run
 */

import { homedir } from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  REQUIRED_DEPLOY_SECRETS,
  githubToken,
  loadEnv,
  parseGitHubRepo,
  upsertActionSecret,
} from './lib/github-repo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/post-l2-github-deploy-secrets.txt');

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';

const dryRun = process.argv.includes('--dry-run');

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
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || res.statusText;
    throw new Error(`Vercel GET ${path}: ${res.status} ${msg}`);
  }
  return json;
}

async function resolveTenantProjectId() {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  const project = data.projects?.find((p) => p.name === TENANT_PROJECT);
  if (!project?.id) {
    throw new Error(`Tenant Vercel project not found: ${TENANT_PROJECT}`);
  }
  return project.id;
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  const repo = parseGitHubRepo();
  if (!repo) {
    console.error('Could not parse GitHub repo from git remote origin');
    process.exit(1);
  }

  const vercelToken = process.env.VERCEL_TOKEN?.trim();
  const vercelOrgId = process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  if (!vercelToken || !vercelOrgId) {
    console.error('Missing VERCEL_TOKEN or VERCEL_TEAM_ID / VERCEL_ORG_ID in .env.seed.tmp');
    process.exit(1);
  }

  const tenantProjectId = await resolveTenantProjectId();

  const secrets = {
    VERCEL_TOKEN: vercelToken,
    VERCEL_ORG_ID: vercelOrgId,
    VERCEL_TENANT_ERP_PROJECT_ID: tenantProjectId,
  };

  console.log('\nS-28 — configure GitHub deploy secrets\n');
  console.log(`  Repo: ${repo.owner}/${repo.repo}`);
  console.log(`  Tenant project: ${TENANT_PROJECT} (${tenantProjectId})`);
  console.log(`  VERCEL_ORG_ID: ${vercelOrgId.slice(0, 12)}…`);

  if (dryRun) {
    console.log('\n--dry-run: would upsert secrets:', REQUIRED_DEPLOY_SECRETS.join(', '));
    writeEvidence(repo, tenantProjectId, vercelOrgId, 'DRY-RUN — Vercel creds OK; GitHub push pending');
    process.exit(0);
  }

  const gh = githubToken();
  if (!gh) {
    console.log('\n✗ GITHUB_TOKEN / GH_TOKEN / GITHUB_PAT not set — cannot push secrets.');
    console.log('  Manual: GitHub → Settings → Secrets → Actions → add:');
    for (const name of REQUIRED_DEPLOY_SECRETS) console.log(`    · ${name}`);
    console.log('  Or: export GITHUB_TOKEN=ghp_… && npm run configure:github-deploy-secrets\n');
    writeEvidence(repo, tenantProjectId, vercelOrgId, 'BLOCKED — no GitHub token');
    process.exit(1);
  }

  for (const name of REQUIRED_DEPLOY_SECRETS) {
    await upsertActionSecret(repo, name, secrets[name]);
    console.log(`  ✓ ${name}`);
  }

  console.log('\nVerify: npm run audit:github-deploy-secrets\n');
  writeEvidence(repo, tenantProjectId, vercelOrgId, 'PASS — secrets upserted');
}

function writeEvidence(repo, tenantProjectId, vercelOrgId, status) {
  mkdirSync(dirname(EVIDENCE), { recursive: true });
  const lines = [
    'POST-L2 FOLLOW-UP — GitHub Vercel deploy secrets (S-28 operator)',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Repo: ${repo.owner}/${repo.repo}`,
    `Tenant Vercel project: ${TENANT_PROJECT}`,
    `VERCEL_TENANT_ERP_PROJECT_ID: ${tenantProjectId}`,
    `VERCEL_ORG_ID: ${vercelOrgId}`,
    '',
    `Status: ${status}`,
    '',
    'Required GitHub Actions secrets:',
    '  · VERCEL_TOKEN',
    '  · VERCEL_ORG_ID',
    '  · VERCEL_TENANT_ERP_PROJECT_ID',
    '',
    'Configure: npm run configure:github-deploy-secrets',
    'Verify:    npm run audit:github-deploy-secrets',
    'Workflow:  .github/workflows/cvs-production-deploy.yml',
  ];
  writeFileSync(EVIDENCE, `${lines.join('\n')}\n`);
  console.log(`  Evidence: ${EVIDENCE}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
