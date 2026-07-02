#!/usr/bin/env node
/**
 * S-19 — tenant-erp deploy smoke: /forge blocked, /hq on cvshq host loads.
 *
 * Run: npm run smoke:tenant-erp-deployment
 * Requires: production build in apps/back-office/.next
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'apps/back-office');
const PORT = Number(process.env.SMOKE_PORT ?? 3099);
const BASE = `http://127.0.0.1:${PORT}`;
const CVS_HQ_HOST = process.env.SMOKE_CVS_HQ_HOST ?? 'cvshq.pearzen.tech';

const failures = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(`${BASE}/hq`, {
        headers: { Host: CVS_HQ_HOST },
        redirect: 'manual',
      });
      if (res.status < 500) return true;
    } catch {
      // not ready
    }
    await sleep(500);
  }
  return false;
}

async function fetchStatus(path, host = CVS_HQ_HOST) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Host: host },
    redirect: 'manual',
  });
  return res.status;
}

async function main() {
  if (!existsSync(join(APP, '.next'))) {
    failures.push(
      'Missing apps/back-office/.next — run PEARZEN_DEPLOYMENT_MODE=tenant-erp npm run build --workspace=pearzen-erp-back-office first',
    );
    report();
    return;
  }

  const child = spawn('npx', ['next', 'start', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: APP,
    env: {
      ...process.env,
      PEARZEN_DEPLOYMENT_MODE: 'tenant-erp',
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

    const forgeStatus = await fetchStatus('/forge');
    if (forgeStatus !== 404) {
      failures.push(`/forge expected 404, got ${forgeStatus}`);
    }

    const hqStatus = await fetchStatus('/hq');
    if (hqStatus === 404) {
      failures.push(`/hq on ${CVS_HQ_HOST} returned 404 (expected page load — 200 or auth redirect)`);
    }

    const omStatus = await fetchStatus('/om', 'cvsom.pearzen.tech');
    if (omStatus === 404) {
      failures.push(`/om on cvsom.pearzen.tech returned 404 (tenant ERP path should load)`);
    }

    console.log('tenant-erp deployment smoke:');
    console.log(`  GET /forge (Host: ${CVS_HQ_HOST}) → ${forgeStatus}`);
    console.log(`  GET /hq (Host: ${CVS_HQ_HOST}) → ${hqStatus}`);
    console.log(`  GET /om (Host: cvsom.pearzen.tech) → ${omStatus}`);
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
