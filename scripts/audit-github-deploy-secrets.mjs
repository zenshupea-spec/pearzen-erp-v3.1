#!/usr/bin/env node
/**
 * S-28 — verify GitHub Actions deploy secrets exist for CVS production workflow.
 *
 * Run: npm run audit:github-deploy-secrets
 */

import { homedir } from 'os';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  REQUIRED_DEPLOY_SECRETS,
  githubToken,
  listActionSecretNames,
  loadEnv,
  parseGitHubRepo,
} from './lib/github-repo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/post-l2-github-deploy-secrets.txt');

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

async function main() {
  loadEnv();
  loadVercelCliAuth();

  const repo = parseGitHubRepo();
  if (!repo) {
    console.error('Could not parse GitHub repo from git remote origin');
    process.exit(1);
  }

  console.log('\nS-28 — GitHub deploy secrets audit\n');
  console.log(`  Repo: ${repo.owner}/${repo.repo}`);

  const token = githubToken();
  if (!token) {
    console.log('  ⚠ GITHUB_TOKEN not set — cannot list remote secrets');
    console.log('  Local Vercel creds:');
    console.log(`    ${process.env.VERCEL_TOKEN?.trim() ? '✓' : '✗'} VERCEL_TOKEN`);
    console.log(
      `    ${process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim() ? '✓' : '✗'} VERCEL_TEAM_ID / VERCEL_ORG_ID`,
    );
    console.log('\n  Run: export GITHUB_TOKEN=ghp_… && npm run configure:github-deploy-secrets\n');
    writeEvidence(repo, null, 'BLOCKED — no GitHub token for API audit');
    process.exit(1);
  }

  const names = await listActionSecretNames(repo);
  const missing = REQUIRED_DEPLOY_SECRETS.filter((s) => !names.includes(s));

  for (const name of REQUIRED_DEPLOY_SECRETS) {
    console.log(`  ${names.includes(name) ? '✓' : '✗'} ${name}`);
  }

  mkdirSync(dirname(EVIDENCE), { recursive: true });
  const status = missing.length ? `FAIL — missing: ${missing.join(', ')}` : 'PASS';
  const lines = [
    'POST-L2 FOLLOW-UP — GitHub Vercel deploy secrets (S-28 operator)',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Repo: ${repo.owner}/${repo.repo}`,
    '',
    'Required secrets:',
    ...REQUIRED_DEPLOY_SECRETS.map((s) => `  ${names.includes(s) ? '✓' : '✗'} ${s}`),
    '',
    `Status: ${status}`,
    '',
    'Configure: npm run configure:github-deploy-secrets',
    'Workflow:  .github/workflows/cvs-production-deploy.yml',
  ];
  writeFileSync(EVIDENCE, `${lines.join('\n')}\n`);
  console.log(`\n  Evidence: ${EVIDENCE}`);

  if (missing.length) {
    console.log(`\n✗ Missing secrets: ${missing.join(', ')}`);
    console.log('  npm run configure:github-deploy-secrets\n');
    process.exit(1);
  }

  console.log('\n✓ All deploy secrets configured.\n');
}

function writeEvidence(repo, names, status) {
  mkdirSync(dirname(EVIDENCE), { recursive: true });
  writeFileSync(
    EVIDENCE,
    [
      'POST-L2 FOLLOW-UP — GitHub Vercel deploy secrets (S-28 operator)',
      `Generated: ${new Date().toISOString().slice(0, 10)}`,
      '',
      `Repo: ${repo.owner}/${repo.repo}`,
      `Status: ${status}`,
      '',
      'Configure: npm run configure:github-deploy-secrets',
    ].join('\n') + '\n',
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
