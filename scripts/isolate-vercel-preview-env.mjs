#!/usr/bin/env node
/**
 * R-INFRA-02 — isolate Vercel preview from CVS production Supabase.
 *
 * On `pearzen-erp-v3-1-back-office`, restrict the Supabase trio to **production**
 * target only so PR previews cannot use service_role against live CVS data.
 *
 * Run: npm run isolate:vercel-preview-env
 * Audit only (includes client-pwa note): npm run isolate:vercel-preview-env -- --audit
 * Dry run: npm run isolate:vercel-preview-env -- --dry-run
 *
 * Requires VERCEL_TOKEN (or logged-in Vercel CLI) and optional VERCEL_TEAM_ID.
 */

import { homedir } from 'os';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BACK_OFFICE_PROJECT =
  process.env.VERCEL_BACK_OFFICE_PROJECT?.trim() || 'pearzen-erp-v3-1-back-office';
const CLIENT_PWA_PROJECT =
  process.env.VERCEL_CLIENT_PWA_PROJECT?.trim() || 'pearzen-erp-client-pwa';

/** Keys that must never reach preview/development on back-office (§3.10.5). */
const BACK_OFFICE_PRODUCTION_ONLY_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

/** Set on Vercel production only — not in tracked `.env.production` (bakes into PR builds). */
const BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY = 'NEXT_PUBLIC_DEV_TENANT_SLUG';

const NON_PRODUCTION_TARGETS = new Set(['preview', 'development']);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const auditOnly = args.has('--audit');

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

function loadVercelRepoLink() {
  const repoPath = join(ROOT, '.vercel/repo.json');
  try {
    const repo = JSON.parse(readFileSync(repoPath, 'utf8'));
    const backOffice = repo.projects?.find((p) => p.name?.includes('back-office'));
    if (backOffice) {
      if (!process.env.VERCEL_PROJECT_ID) process.env.VERCEL_PROJECT_ID = backOffice.id;
      if (!process.env.VERCEL_TEAM_ID) process.env.VERCEL_TEAM_ID = backOffice.orgId;
    }
  } catch {
    /* not linked */
  }
}

async function vercelFetch(path, { method = 'GET', body } = {}) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) throw new Error('VERCEL_TOKEN missing — add to .env.seed.tmp or run `vercel login`');

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

function teamQuery() {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return teamId ? `?teamId=${teamId}` : '';
}

async function resolveProjectId(projectName, presetId) {
  if (presetId?.trim()) return presetId.trim();

  const projects = await vercelFetch(`/v9/projects${teamQuery()}`);
  const match = projects.projects?.find(
    (p) => p.name === projectName || p.name?.includes(projectName),
  );
  if (!match?.id) {
    throw new Error(`Could not find Vercel project "${projectName}"`);
  }
  return match.id;
}

function formatTargets(target) {
  return (target ?? []).join(', ') || '(none)';
}

function rowHasNonProductionTarget(row) {
  return (row.target ?? []).some((t) => NON_PRODUCTION_TARGETS.has(t));
}

/**
 * @returns {{ isolated: number, skipped: number, issues: string[] }}
 */
async function auditProjectEnv(projectName, projectId, keysOfInterest) {
  const data = await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`);
  const envs = data.envs ?? [];
  const issues = [];
  let isolated = 0;
  let skipped = 0;

  console.log(`\n── ${projectName} (${projectId}) ──`);

  for (const key of keysOfInterest) {
    const rows = envs.filter((e) => e.key === key);
    if (!rows.length) {
      console.log(`  · ${key}: not set`);
      continue;
    }

    for (const row of rows) {
      const targets = row.target ?? [];
      const onPreview = targets.some((t) => NON_PRODUCTION_TARGETS.has(t));
      const onProduction = targets.includes('production');

      if (onPreview) {
        issues.push(`${projectName}: ${key} on [${formatTargets(targets)}]`);
        console.log(`  ✗ ${key} on ${formatTargets(targets)} — must be production-only`);
      } else if (onProduction) {
        console.log(`  ✓ ${key} production-only`);
        skipped += 1;
      } else {
        console.log(`  ? ${key} on ${formatTargets(targets)} (no production target)`);
      }
    }
  }

  return { isolated, skipped, issues, envs };
}

async function isolateBackOfficeSupabase(projectId, envs) {
  let changed = 0;

  for (const key of BACK_OFFICE_PRODUCTION_ONLY_KEYS) {
    const rows = envs.filter((e) => e.key === key);
    for (const row of rows) {
      const targets = row.target ?? [];
      const onPreview = targets.some((t) => NON_PRODUCTION_TARGETS.has(t));
      const onProduction = targets.includes('production');

      if (!onPreview) continue;

      if (onProduction && targets.length > 1) {
        console.log(`  → PATCH ${key}: [${formatTargets(targets)}] → [production]`);
        if (!dryRun) {
          await vercelFetch(`/v10/projects/${projectId}/env/${row.id}${teamQuery()}`, {
            method: 'PATCH',
            body: { target: ['production'], type: row.type ?? 'encrypted' },
          });
        }
        changed += 1;
      } else if (!onProduction) {
        console.log(`  → DELETE ${key} (preview/dev-only row)`);
        if (!dryRun) {
          await vercelFetch(`/v10/projects/${projectId}/env/${row.id}${teamQuery()}`, {
            method: 'DELETE',
          });
        }
        changed += 1;
      }
    }
  }

  return changed;
}

async function ensureProductionTenantSlug(projectId, envs) {
  const slug =
    process.env.NEXT_PUBLIC_DEV_TENANT_SLUG?.trim() ||
    process.env.PEARZEN_TENANT_SUBDOMAINS?.split(',')[0]?.trim() ||
    'cvs';

  const rows = envs.filter((e) => e.key === BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY);
  const productionRow = rows.find((e) => e.target?.includes('production'));
  const previewRow = rows.find((e) => rowHasNonProductionTarget(e));

  if (previewRow) {
    console.log(
      `  → DELETE ${BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY} preview/dev row (must not bake into PR builds)`,
    );
    if (!dryRun) {
      await vercelFetch(`/v10/projects/${projectId}/env/${previewRow.id}${teamQuery()}`, {
        method: 'DELETE',
      });
    }
  }

  if (productionRow) {
    if (productionRow.value !== slug || (productionRow.target ?? []).length > 1) {
      console.log(
        `  → PATCH ${BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY}=${slug} target=[production]`,
      );
      if (!dryRun) {
        await vercelFetch(`/v10/projects/${projectId}/env/${productionRow.id}${teamQuery()}`, {
          method: 'PATCH',
          body: { value: slug, target: ['production'], type: 'plain' },
        });
      }
      return 1;
    }
    console.log(`  ✓ ${BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY}=${productionRow.value} production-only`);
    return 0;
  }

  console.log(`  → CREATE ${BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY}=${slug} target=[production]`);
  if (!dryRun) {
    await vercelFetch(`/v10/projects/${projectId}/env${teamQuery()}`, {
      method: 'POST',
      body: {
        key: BACK_OFFICE_PRODUCTION_TENANT_SLUG_KEY,
        value: slug,
        type: 'plain',
        target: ['production'],
      },
    });
  }
  return 1;
}

async function main() {
  loadEnv();
  loadVercelCliAuth();
  loadVercelRepoLink();

  const prefix = dryRun ? '[dry-run] ' : auditOnly ? '[audit] ' : '';
  console.log(`\n${prefix}R-INFRA-02 — Vercel preview / Supabase isolation\n`);

  const backOfficeId = await resolveProjectId(
    BACK_OFFICE_PROJECT,
    process.env.VERCEL_PROJECT_ID,
  );

  const backOfficeAudit = await auditProjectEnv(
    BACK_OFFICE_PROJECT,
    backOfficeId,
    BACK_OFFICE_PRODUCTION_ONLY_KEYS,
  );

  const clientPwaId = await resolveProjectId(CLIENT_PWA_PROJECT, null);
  const clientPwaAudit = await auditProjectEnv(clientPwaId ? CLIENT_PWA_PROJECT : '', clientPwaId, [
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]);

  const allIssues = [...backOfficeAudit.issues, ...clientPwaAudit.issues];

  if (clientPwaAudit.issues.length) {
    console.log(
      `\n⚠ client-pwa (${CLIENT_PWA_PROJECT}): service role on preview/dev is out of CVS staff scope`,
    );
    console.log('  Remediate separately — see Audit_Plan.md §3.10.5 ancillary row.');
  }

  if (auditOnly) {
    if (allIssues.length) {
      console.log(`\n${allIssues.length} issue(s) found. Re-run without --audit to apply fixes on back-office.`);
      process.exit(1);
    }
    console.log('\nAudit passed — back-office Supabase trio is production-only.');
    return;
  }

  if (!backOfficeAudit.issues.length) {
    console.log('\nBack-office Supabase trio already production-only.');
  } else {
    console.log('\nIsolating back-office Supabase env…');
    const changed = await isolateBackOfficeSupabase(backOfficeId, backOfficeAudit.envs);
    console.log(`  ${changed} row(s) ${dryRun ? 'would be ' : ''}updated`);
  }

  console.log('\nEnsuring production-only tenant slug for erp.pearzen.tech redirects…');
  const slugChanges = await ensureProductionTenantSlug(backOfficeId, backOfficeAudit.envs);
  if (slugChanges && !dryRun) {
    console.log('  Redeploy production after env change for erp redirect slug to take effect.');
  }

  if (allIssues.length && !dryRun) {
    console.log('\nRe-run audit: npm run isolate:vercel-preview-env -- --audit');
  } else if (!allIssues.length) {
    console.log('\nDone.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
