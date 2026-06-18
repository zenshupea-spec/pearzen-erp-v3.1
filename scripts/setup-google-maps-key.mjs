#!/usr/bin/env node
/**
 * Store Google Maps API key for back-office geofence preview.
 *
 * Usage:
 *   node scripts/setup-google-maps-key.mjs AIzaSy...
 *   GOOGLE_MAPS_API_KEY=AIzaSy... node scripts/setup-google-maps-key.mjs
 *
 * Then: npm run wire:backend && npm run dev
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const key =
  process.argv[2]?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  process.env.GOOGLE_MAPS_API_KEY?.trim() ||
  '';

if (!key || !key.startsWith('AIza')) {
  console.error(
    'Usage: node scripts/setup-google-maps-key.mjs AIzaSy...\n' +
      'Create a key at https://console.cloud.google.com/google/maps-apis/credentials\n' +
      'Enable: Maps JavaScript API',
  );
  process.exit(1);
}

function upsertEnvFile(path, entries) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  const keys = new Set(Object.keys(entries));
  const kept = lines.filter((line) => {
    const m = line.match(/^([^=]+)=/);
    return !(m && keys.has(m[1].trim()));
  });
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  for (const [name, value] of Object.entries(entries)) {
    kept.push(`${name}=${value}`);
  }
  writeFileSync(path, `${kept.join('\n')}\n`, 'utf8');
  console.log(`✓ ${path}`);
}

upsertEnvFile(join(root, '.env.seed.tmp'), {
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: key,
});
upsertEnvFile(join(root, '.env.local'), {
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: key,
});

spawnSync('npm', ['run', 'wire:backend'], { cwd: root, stdio: 'inherit' });

async function pushVercelEnv() {
  for (const file of ['.env.seed.tmp', '.env.local', '.env']) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^(VERCEL_TOKEN|VERCEL_TEAM_ID|VERCEL_BACK_OFFICE_PROJECT)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }

  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const project = process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
  if (!token || !teamId) return;

  const res = await fetch(`https://api.vercel.com/v10/projects/${project}/env?teamId=${teamId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
      value: key,
      type: 'encrypted',
      target: ['production', 'preview', 'development'],
    }),
  });
  if (res.ok) {
    console.log(`✓ Vercel env NEXT_PUBLIC_GOOGLE_MAPS_API_KEY on ${project}`);
  } else {
    const body = await res.text();
    console.warn(`Vercel env update skipped (${res.status}): ${body.slice(0, 200)}`);
  }
}

await pushVercelEnv();

console.log('\nDone. Restart dev: npm run dev');
