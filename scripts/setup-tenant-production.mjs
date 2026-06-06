#!/usr/bin/env node
/**
 * Production tenant setup:
 * 1. Supabase auth redirect URLs (needs SUPABASE_ACCESS_TOKEN in .env.seed.tmp)
 * 2. Prints Vercel + DNS steps for *.pearzen.com
 *
 * Run: npm run setup:tenant-production
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['.env.seed.tmp', '.env.local', '.env']) {
    try {
      const env = readFileSync(join(root, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    } catch {
      /* try next */
    }
  }
}

loadEnv();

const base = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN ?? 'pearzen.com';
const vercelTarget = 'cname.vercel-dns.com';

console.log(`
═══════════════════════════════════════════════════════════
  Pearzen tenant production checklist
═══════════════════════════════════════════════════════════

STEP 1 — DNS (at your domain registrar for ${base})
  Add these records:

  Type    Name              Value
  ─────────────────────────────────────────
  CNAME   *                 ${vercelTarget}
  CNAME   forge             ${vercelTarget}
  CNAME   erp               ${vercelTarget}

STEP 2 — Vercel (https://vercel.com → back-office project → Settings → Domains)
  Add domains:
    • *.${base}
    • forge.${base}
    • erp.${base}

STEP 3 — Vercel env (Settings → Environment Variables → Production)
  NEXT_PUBLIC_TENANT_SUBDOMAINS_LIVE=true
  NEXT_PUBLIC_TENANT_BASE_DOMAIN=${base}
  NEXT_PUBLIC_FORGE_HOST=forge.${base}

  Then redeploy.

STEP 4 — Supabase auth redirects (this script runs below if token is set)
`);

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.log(
    '⚠️  SUPABASE_ACCESS_TOKEN not set — skip Step 4.\n' +
      '    Add token to .env.seed.tmp then re-run: npm run setup:tenant-production\n',
  );
  process.exit(0);
}

console.log('Running Supabase auth configuration…\n');
const result = spawnSync(
  process.execPath,
  [join(dirname(fileURLToPath(import.meta.url)), 'configure-supabase-production-auth.mjs')],
  { stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 1);
