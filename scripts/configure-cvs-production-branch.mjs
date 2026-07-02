#!/usr/bin/env node
/**
 * S-27 — pin CVS tenant Vercel production to cvs-production; forge stays on main.
 *
 * Run:
 *   npm run configure:cvs-production-branch
 *   npm run configure:cvs-production-branch -- --audit
 *   npm run configure:cvs-production-branch -- --dry-run
 */

import { execSync } from 'child_process';
import { homedir } from 'os';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-27-cvs-production-branch.txt');

const CVS_BRANCH = 'cvs-production';
const FORGE_BRANCH = 'main';

const TENANT_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const FORGE_PROJECT =
  process.env.VERCEL_FORGE_BACK_OFFICE_PROJECT?.trim() || 'pearzen-forge-back-office';

const args = new Set(process.argv.slice(2));
const auditOnly = args.has('--audit');
const dryRun = args.has('--dry-run');

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

async function findProject(name) {
  const data = await vercelFetch(`/v9/projects${teamQuery()}`);
  return data.projects?.find((p) => p.name === name) ?? null;
}

async function getProductionBranch(projectId) {
  const project = await vercelFetch(`/v9/projects/${projectId}${teamQuery()}`);
  return project.link?.productionBranch || null;
}

async function setProductionBranch(projectId, branch) {
  if (dryRun) {
    console.log(`  [dry-run] would set production branch → ${branch}`);
    return;
  }
  await vercelFetch(`/v9/projects/${projectId}/branch${teamQuery()}`, {
    method: 'PATCH',
    body: { branch },
  });
  console.log(`  ✓ Production branch → ${branch}`);
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function remoteBranchExists(name) {
  try {
    const out = git(`git ls-remote --heads origin ${name}`);
    return Boolean(out.trim());
  } catch {
    return false;
  }
}

function ensureCvsProductionBranch() {
  const baseRef = process.env.CVS_PRODUCTION_BASE_REF?.trim() || 'origin/main';
  const baseSha = git(`git rev-parse ${baseRef}`);
  const baseSubject = git(`git log -1 --format=%s ${baseRef}`);

  if (remoteBranchExists(CVS_BRANCH)) {
    const remoteSha = git(`git ls-remote --heads origin ${CVS_BRANCH}`).split(/\s+/)[0];
    console.log(`  · Remote ${CVS_BRANCH} exists @ ${remoteSha.slice(0, 7)}`);
    return { baseRef, baseSha, baseSubject, remoteSha, created: false };
  }

  if (dryRun || auditOnly) {
    console.log(`  [dry-run] would create and push ${CVS_BRANCH} from ${baseRef} (${baseSha.slice(0, 7)})`);
    return { baseRef, baseSha, baseSubject, remoteSha: null, created: false, pendingPush: true };
  }

  try {
    git(`git branch -f ${CVS_BRANCH} ${baseRef}`);
  } catch {
    git(`git checkout -B ${CVS_BRANCH} ${baseRef}`);
  }
  git(`git push -u origin ${CVS_BRANCH}`);
  const remoteSha = git(`git ls-remote --heads origin ${CVS_BRANCH}`).split(/\s+/)[0];
  console.log(`  ✓ Created and pushed ${CVS_BRANCH} @ ${remoteSha.slice(0, 7)} from ${baseRef}`);
  return { baseRef, baseSha, baseSubject, remoteSha, created: true };
}

async function main() {
  loadEnv();
  loadVercelCliAuth();

  console.log('\nS-27 CVS production branch configuration\n');

  const tenant = await findProject(TENANT_PROJECT);
  const forge = await findProject(FORGE_PROJECT);
  if (!tenant) throw new Error(`Tenant project not found: ${TENANT_PROJECT}`);
  if (!forge) throw new Error(`Forge project not found: ${FORGE_PROJECT}`);

  const beforeTenant = await getProductionBranch(tenant.id);
  const beforeForge = await getProductionBranch(forge.id);

  console.log('Git — freeze CVS production ref');
  const branchInfo = ensureCvsProductionBranch();

  console.log('\nVercel — production branch pins');
  console.log(`Tenant (${TENANT_PROJECT}): ${beforeTenant} → ${CVS_BRANCH}`);
  if (!auditOnly && beforeTenant !== CVS_BRANCH) {
    await setProductionBranch(tenant.id, CVS_BRANCH);
  } else if (beforeTenant === CVS_BRANCH) {
    console.log('  · Already on cvs-production');
  }

  console.log(`Forge (${FORGE_PROJECT}): ${beforeForge} → ${FORGE_BRANCH}`);
  if (!auditOnly && beforeForge !== FORGE_BRANCH) {
    await setProductionBranch(forge.id, FORGE_BRANCH);
  } else if (beforeForge === FORGE_BRANCH) {
    console.log('  · Already on main');
  }

  const afterTenant = auditOnly ? beforeTenant : await getProductionBranch(tenant.id);
  const afterForge = auditOnly ? beforeForge : await getProductionBranch(forge.id);

  const remoteExists = remoteBranchExists(CVS_BRANCH);
  const pass =
    remoteExists &&
    afterTenant === CVS_BRANCH &&
    afterForge === FORGE_BRANCH;

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-27 CVS production branch',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Git repo: zenshupea-spec/pearzen-erp-v3.1`,
    `CVS production branch: ${CVS_BRANCH}`,
    `Forge production branch: ${FORGE_BRANCH}`,
    '',
    'Git branch:',
    `  Base ref: ${branchInfo.baseRef}`,
    `  Base SHA: ${branchInfo.baseSha}`,
    `  Base subject: ${branchInfo.baseSubject}`,
    `  Remote ${CVS_BRANCH} exists: ${remoteExists ? 'yes' : 'no'}`,
    branchInfo.remoteSha ? `  Remote SHA: ${branchInfo.remoteSha}` : '',
    branchInfo.created ? '  Action: branch created and pushed' : '  Action: branch already present',
    '',
    `Tenant project: ${TENANT_PROJECT} (${tenant.id})`,
    `  Production branch before: ${beforeTenant}`,
    `  Production branch after:  ${afterTenant}`,
    '',
    `Forge project: ${FORGE_PROJECT} (${forge.id})`,
    `  Production branch before: ${beforeForge}`,
    `  Production branch after:  ${afterForge}`,
    '',
    'Expected deploy behavior:',
    '  · Push to main → production deploy on forge project only',
    '  · Push/merge to cvs-production → production deploy on tenant project only',
    '',
    pass ? 'Status: PASS' : 'Status: FAIL',
    '',
    'Repeatable: npm run configure:cvs-production-branch -- --audit',
  ].filter(Boolean);

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);

  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
