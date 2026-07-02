#!/usr/bin/env node
/**
 * S-18 — forge deploy smoke: tenant routes 404, /forge reachable.
 *
 * Run: npm run smoke:forge-deployment
 * Requires: production build in apps/back-office/.next
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/back-office');
const PORT = Number(process.env.SMOKE_PORT ?? 3098);
const BASE = `http://127.0.0.1:${PORT}`;

const failures = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(`${BASE}/forge`, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch {
      // not ready
    }
    await sleep(500);
  }
  return false;
}

async function fetchStatus(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  return res.status;
}

async function main() {
  if (!existsSync(join(APP, '.next'))) {
    failures.push('Missing apps/back-office/.next — run PEARZEN_DEPLOYMENT_MODE=forge npm run build --workspace=pearzen-erp-back-office first');
    report();
    return;
  }

  const child = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: APP,
    env: {
      ...process.env,
      PEARZEN_DEPLOYMENT_MODE: 'forge',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const killChild = () =>
    new Promise((resolve) => {
      if (child.killed || child.exitCode != null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000);
    });

  try {
    if (!(await waitForServer())) {
      failures.push(`Server not ready on ${BASE} within 90s`);
      if (stderr) failures.push(stderr.slice(-500));
      report();
      return;
    }

    const omStatus = await fetchStatus('/om');
    if (omStatus !== 404) {
      failures.push(`/om expected 404, got ${omStatus}`);
    }

    const cronStatus = await fetchStatus('/api/cron/purge-verification-photos');
    if (cronStatus !== 404) {
      failures.push(`/api/cron/purge-verification-photos expected 404, got ${cronStatus}`);
    }

    const forgeStatus = await fetchStatus('/forge');
    if (forgeStatus === 404) {
      failures.push(`/forge returned 404 (expected page load — 200 or auth redirect)`);
    }

    console.log('forge deployment smoke:');
    console.log(`  GET /om → ${omStatus}`);
    console.log(`  GET /api/cron/purge-verification-photos → ${cronStatus}`);
    console.log(`  GET /forge → ${forgeStatus}`);
  } finally {
    await killChild();
  }

  report();
}

function report() {
  if (failures.length) {
    console.error('\nFAIL:');
    for (const f of failures) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log('\nPASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
