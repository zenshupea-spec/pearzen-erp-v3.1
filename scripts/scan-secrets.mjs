#!/usr/bin/env node
/**
 * Scan git-tracked files for leaked secrets (JWT, Resend, Stripe live keys).
 *
 * Run: npm run scan:secrets
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  scanTextForSecrets,
  shouldSkipSecretScanPath,
} from './lib/secret-scan-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const files = listTrackedFiles();
const violations = [];

for (const rel of files) {
  if (shouldSkipSecretScanPath(rel)) continue;

  let content;
  try {
    content = readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }

  if (content.includes('\0')) continue;

  violations.push(...scanTextForSecrets(content, rel));
}

if (!violations.length) {
  console.log(`✓ Secret scan passed (${files.length} tracked files)`);
  process.exit(0);
}

console.error(`✗ Secret scan found ${violations.length} issue(s):\n`);
for (const v of violations) {
  console.error(`  [${v.pattern}] ${v.file}`);
  console.error(`    ${v.line}\n`);
}
process.exit(1);
