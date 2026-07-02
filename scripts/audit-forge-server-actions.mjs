#!/usr/bin/env node
/**
 * Audit Forge server actions for platform-operator guards (FORGE_CVS_ISOLATION S-7).
 *
 * Run: npm run verify:forge-actions
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FORGE_OPERATOR_GUARD =
  /assertForgeOperator\s*\(|assertForgeOperatorSession\s*\(|assertForgeOperatorWith2faStepUp\s*\(|requireForgeOperator\s*\(|isForgeOperatorEmail\s*\(/;

const FM_TENANT_SCOPE_GUARD =
  /resolveFmCompanyId\s*\(|resolveCompanyIdForSession\s*\(/;

function listForgeActionFiles(dir = join(ROOT, 'apps/back-office/app/forge'), acc = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      listForgeActionFiles(abs, acc);
      continue;
    }
    if (entry === 'actions.ts' || entry.endsWith('-actions.ts')) {
      acc.push(abs.slice(ROOT.length + 1));
    }
  }
  return acc.sort();
}

function extractExportedFunctions(source) {
  const names = [...source.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]);
  const results = [];

  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const start = source.indexOf(`export async function ${name}`);
    const next =
      i + 1 < names.length
        ? source.indexOf(`export async function ${names[i + 1]}`, start + 1)
        : source.length;
    results.push({ name, body: source.slice(start, next) });
  }

  return results;
}

const DELEGATION_GUARD =
  /(?:await\s+)?(?:fetchForgePayoutAuditLedger|setTenantVerticalStatus|createForgeProductInvoiceForPurchase)\s*\(/;

function exportIsGuarded({ name, body }) {
  if (FORGE_OPERATOR_GUARD.test(body)) return true;
  if (FM_TENANT_SCOPE_GUARD.test(body)) return true;
  if (DELEGATION_GUARD.test(body)) return true;
  return false;
}

function auditFile(relPath) {
  const abs = join(ROOT, relPath);
  const source = readFileSync(abs, 'utf8');
  const exports = extractExportedFunctions(source);
  const unguarded = exports.filter((entry) => !exportIsGuarded(entry));

  return { relPath, exports, unguarded };
}

function auditServiceClientFiles(files) {
  const issues = [];
  const guardPattern =
    /assertForgeOperator\s*\(|assertForgeOperatorSession\s*\(|assertForgeOperatorWith2faStepUp\s*\(|requireForgeOperator\s*\(|isForgeOperatorEmail\s*\(/;

  for (const relPath of files) {
    const source = readFileSync(join(ROOT, relPath), 'utf8');
    if (!source.includes('createSupabaseServiceClient')) continue;
    if (!guardPattern.test(source)) {
      issues.push(`${relPath}: uses service client without operator guard helper`);
    }
  }
  return issues;
}

function main() {
  const files = listForgeActionFiles();
  const failures = [];

  console.log('Forge server action operator guard audit\n');

  for (const relPath of files) {
    const { exports, unguarded } = auditFile(relPath);
    if (!exports.length) continue;

    if (unguarded.length === 0) {
      console.log(`  ✓ ${relPath} (${exports.length} export(s))`);
      continue;
    }

    console.log(`  ✗ ${relPath}`);
    for (const entry of unguarded) {
      console.log(`      · export async function ${entry.name}()`);
      failures.push({ relPath, name: entry.name });
    }
  }

  if (failures.length) {
    console.log(`\n${failures.length} unguarded Forge export(s) found.`);
    console.log('Add assertForgeOperator() (lib/forge-operator-server.ts) or FM tenant scope.');
    process.exit(1);
  }

  const serviceIssues = auditServiceClientFiles(files);
  if (serviceIssues.length) {
    console.log('\nService client file-level issues:');
    for (const issue of serviceIssues) {
      console.log(`  ✗ ${issue}`);
    }
    process.exit(1);
  }

  console.log(`\n✓ All ${files.length} Forge action file(s) pass operator guard audit`);
}

main();
