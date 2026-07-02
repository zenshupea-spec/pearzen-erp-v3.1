#!/usr/bin/env node
/**
 * Wire pearzen.tech → split Forge + CVS tenant Vercel projects + Porkbun DNS.
 *
 * Prefer the split scripts directly (FORGE_CVS_ISOLATION S-22):
 *   npm run connect:forge-platform
 *   npm run connect:cvs-tenant
 *
 * This wrapper runs both in sequence for backward compatibility.
 *
 * Env posture (R-INFRA-02):
 *   - Public URL vars use Vercel **production** target only.
 *   - Supabase secrets are NOT set here — use dashboard or isolate:vercel-preview-env.
 *
 * Requires in .env.seed.tmp (or env):
 *   VERCEL_TOKEN, PORKBUN_API_KEY, PORKBUN_SECRET_API_KEY
 *
 * Run: npm run connect:pearzen-tech
 */

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, pearzenDomain } from './lib/pearzen-domain-connect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const extraArgs = process.argv.slice(2);

const SCRIPTS = ['connect-forge-platform.mjs', 'connect-cvs-tenant.mjs'];

function runSupabaseAuth() {
  if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    console.log('\n⚠ SUPABASE_ACCESS_TOKEN not set — skipping Supabase auth URLs.');
    return;
  }

  console.log('\nConfiguring Supabase auth redirects…');
  const result = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/configure-supabase-production-auth.mjs')],
    {
      stdio: 'inherit',
      env: { ...process.env, NEXT_PUBLIC_TENANT_BASE_DOMAIN: pearzenDomain() },
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  loadEnv();

  console.log(`\nconnect:pearzen-tech — running forge + CVS tenant scripts for ${pearzenDomain()}\n`);

  for (const script of SCRIPTS) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...extraArgs], {
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  if (!extraArgs.includes('--dry-run')) {
    runSupabaseAuth();
    console.log(
      '\nTip: run npm run isolate:vercel-preview-env to ensure Supabase keys are production-only on tenant project.',
    );
  }

  console.log('\nDone (split scripts: connect:forge-platform, connect:cvs-tenant).\n');
}

main();
