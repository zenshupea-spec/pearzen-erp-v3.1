#!/usr/bin/env node
/**
 * Platform regression gate — no silent CVS tenant/company defaults (S-16).
 *
 * Run: npm run verify:platform-no-cvs-default
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(ROOT, 'apps/back-office');

/** Entire files exempt — constant defs, CVS host map, anchor migration default, security-site middleware. */
const ALLOWLIST_FILES = new Set([
  'apps/back-office/lib/company-ids.ts',
  'apps/back-office/lib/tenant-portal-host.ts',
  'apps/back-office/lib/forge-anchor-tenant.ts',
  'apps/back-office/middleware.ts',
  'apps/back-office/lib/company-context.ts',
  'apps/back-office/lib/company-context-server.ts',
  // Shalom guest site v1: explicit CVS fallback only after tenant host resolution misses.
  'apps/back-office/lib/shalom-public-data.ts',
]);

const FALLBACK_PATTERNS = [
  {
    re: /\?\?\s*(CVS_COMPANY_ID|CLASSIC_VENTURE_COMPANY_ID|CVS_TENANT_SLUG)\b/,
    label: 'nullish coalesce to CVS constant',
  },
  {
    re: /\|\|\s*(CVS_COMPANY_ID|CLASSIC_VENTURE_COMPANY_ID|CVS_TENANT_SLUG)\b/,
    label: 'logical OR fallback to CVS constant',
  },
  {
    re: /return\s+(CVS_COMPANY_ID|CLASSIC_VENTURE_COMPANY_ID)\s*;/,
    label: 'return CVS company id',
  },
  {
    re: /return\s+CVS_TENANT_SLUG\s*;/,
    label: 'return CVS tenant slug',
  },
];

const SKIP_LINE =
  /(===|!==|\.toBe\(|\.not\.toBe\(|expect\(|import\s+|export\s+\{|export\s+type|from\s+['"].*company-ids)/;

function listSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      listSourceFiles(abs, acc);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx|js)$/.test(entry)) continue;
    acc.push(abs);
  }
  return acc;
}

function auditFile(absPath) {
  const rel = relative(ROOT, absPath).split('\\').join('/');
  if (ALLOWLIST_FILES.has(rel)) return [];

  const lines = readFileSync(absPath, 'utf8').split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (SKIP_LINE.test(line)) continue;

    for (const { re, label } of FALLBACK_PATTERNS) {
      if (re.test(line)) {
        issues.push({ rel, line: i + 1, label, text: trimmed });
        break;
      }
    }
  }

  return issues;
}

function main() {
  const files = listSourceFiles(SCAN_ROOT);
  const issues = files.flatMap(auditFile);

  console.log('Platform no-CVS-default audit\n');

  if (issues.length === 0) {
    console.log(`✓ Scanned ${files.length} back-office source file(s) — no silent CVS fallbacks\n`);
    return;
  }

  console.error(`✗ Found ${issues.length} silent CVS fallback(s):\n`);
  for (const issue of issues) {
    console.error(`  ${issue.rel}:${issue.line} — ${issue.label}`);
    console.error(`    ${issue.text}\n`);
  }

  console.error(
    'Allowlisted: company-ids.ts, tenant-portal-host.ts, forge-anchor-tenant.ts, middleware.ts, *.test.ts, scripts/',
  );
  process.exit(1);
}

main();
