/** GitHub repo + Actions secrets helpers. */

import { execSync } from 'child_process';
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SODIUM_DIR = join(ROOT, '.tmp-github-secrets');
const require = createRequire(import.meta.url);

export const REQUIRED_DEPLOY_SECRETS = [
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_TENANT_ERP_PROJECT_ID',
];

export function loadEnv() {
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

export function githubToken() {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_PAT?.trim() ||
    null
  );
}

export function parseGitHubRepo() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim();
  if (fromEnv?.includes('/')) {
    const [owner, repo] = fromEnv.split('/');
    return { owner, repo: repo.replace(/\.git$/, '') };
  }

  let remote = '';
  try {
    remote = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }

  const ssh = remote.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  const https = remote.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return { owner: https[1], repo: https[2] };

  return null;
}

export async function githubFetch(path, { method = 'GET', body, token } = {}) {
  const auth = token || githubToken();
  if (!auth) throw new Error('GITHUB_TOKEN / GH_TOKEN / GITHUB_PAT required');

  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
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
    const msg = json?.message || text || res.statusText;
    throw new Error(`GitHub ${method} ${path}: ${res.status} ${msg}`);
  }
  return json;
}

function ensureTweetsodium() {
  const modPath = join(SODIUM_DIR, 'node_modules/tweetsodium');
  if (!existsSync(modPath)) {
    mkdirSync(SODIUM_DIR, { recursive: true });
    execSync('npm init -y && npm install tweetsodium@0.0.5 --silent', {
      cwd: SODIUM_DIR,
      stdio: 'pipe',
    });
  }
  return modPath;
}

export function encryptGitHubSecret(plainText, publicKeyBase64) {
  const modPath = ensureTweetsodium();
  const sodium = require(modPath);
  const messageBytes = Buffer.from(plainText, 'utf8');
  const keyBytes = Buffer.from(publicKeyBase64, 'base64');
  const encryptedBytes = sodium.encrypt(messageBytes, keyBytes);
  return Buffer.from(encryptedBytes).toString('base64');
}

export async function listActionSecretNames(repo) {
  const names = [];
  let page = 1;
  while (true) {
    const data = await githubFetch(
      `/repos/${repo.owner}/${repo.repo}/actions/secrets?per_page=100&page=${page}`,
    );
    for (const secret of data.secrets ?? []) names.push(secret.name);
    if (!data.secrets?.length || names.length >= data.total_count) break;
    page += 1;
  }
  return names.sort();
}

export async function upsertActionSecret(repo, name, value) {
  const { key_id: keyId, key } = await githubFetch(
    `/repos/${repo.owner}/${repo.repo}/actions/secrets/public-key`,
  );
  const encrypted_value = encryptGitHubSecret(value, key);
  await githubFetch(`/repos/${repo.owner}/${repo.repo}/actions/secrets/${name}`, {
    method: 'PUT',
    body: { encrypted_value, key_id: keyId },
  });
}
