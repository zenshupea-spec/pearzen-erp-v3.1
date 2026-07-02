#!/usr/bin/env node
/**
 * S-25 — post-split production smoke (CVS tenant + Forge platform hosts).
 *
 * Run: npm run smoke:post-split-production
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-25-post-split-smoke.txt');
const DOMAIN = process.env.PEARZEN_DOMAIN?.trim() || 'pearzen.tech';

const CHECKS = [
  { group: 'CVS', label: 'cvshq.pearzen.tech — HQ login', url: `https://cvshq.${DOMAIN}/login/hq` },
  { group: 'CVS', label: 'cvsexec.pearzen.tech — MD login', url: `https://cvsexec.${DOMAIN}/login/md` },
  { group: 'CVS', label: 'cvsom.pearzen.tech — OM queue', url: `https://cvsom.${DOMAIN}/login/om` },
  { group: 'CVS', label: 'cvstm.pearzen.tech — TM', url: `https://cvstm.${DOMAIN}/login/tm` },
  { group: 'CVS', label: 'cv.pearzen.tech — guard check-in', url: `https://cv.${DOMAIN}/` },
  { group: 'CVS', label: 'cvssm.pearzen.tech — SM roster', url: `https://cvssm.${DOMAIN}/` },
  {
    group: 'CVS',
    label: 'npm run export:cvs-regression',
    run: () => spawnSync('npm', ['run', 'export:cvs-regression'], { cwd: ROOT, encoding: 'utf8' }),
  },
  {
    group: 'Forge',
    label: 'forge.pearzen.tech — operator login',
    url: `https://forge.${DOMAIN}/login/forge`,
  },
  {
    group: 'Forge',
    label: '/forge/tenants — list tenants',
    url: `https://superadmin.${DOMAIN}/forge/tenants`,
  },
  {
    group: 'Forge',
    label: '/forge/billing — pick tenant manually',
    url: `https://superadmin.${DOMAIN}/forge/billing`,
  },
  {
    group: 'Forge',
    label: 'pearzen.tech — marketing page',
    url: `https://www.${DOMAIN}/`,
    altUrl: `https://superadmin.${DOMAIN}/pearzen-website`,
  },
];

const results = [];

async function fetchStatus(url) {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, error: res.headers.get('x-vercel-error') };
}

function passHttp(status, error) {
  if (status === 404) return false;
  if (error === 'DEPLOYMENT_NOT_FOUND') return false;
  return status > 0 && status < 500;
}

async function runCheck(check) {
  if (check.run) {
    const out = check.run();
    const ok = out.status === 0;
    results.push({ ...check, ok, detail: ok ? 'exit 0' : `exit ${out.status}` });
    return;
  }

  let { status, error } = await fetchStatus(check.url);
  let detail = `${status}${error ? ` (${error})` : ''}`;

  if (!passHttp(status, error) && check.altUrl) {
    const alt = await fetchStatus(check.altUrl);
    if (passHttp(alt.status, alt.error)) {
      status = alt.status;
      error = alt.error;
      detail = `${alt.status} via ${check.altUrl}`;
    }
  }

  results.push({ ...check, ok: passHttp(status, error), detail });
}

async function main() {
  for (const check of CHECKS) {
    await runCheck(check);
  }

  const lines = [];
  lines.push('FORGE ↔ CVS ISOLATION — S-25 Post-split production smoke');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');

  for (const group of ['CVS', 'Forge']) {
    lines.push(group === 'CVS' ? 'CVS (must PASS):' : 'Forge (must PASS):');
    for (const r of results.filter((x) => x.group === group)) {
      lines.push(`  [${r.ok ? 'x' : ' '}] ${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    lines.push('');
  }

  const failed = results.filter((r) => !r.ok);
  lines.push(failed.length ? `Status: ${results.length - failed.length}/${results.length} PASS` : 'Status: ALL PASS');

  const report = lines.join('\n');
  console.log(report);
  writeFileSync(EVIDENCE, `${report}\n`);

  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed — see ${EVIDENCE}`);
    process.exit(1);
  }
  console.log(`\nWrote ${EVIDENCE}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
