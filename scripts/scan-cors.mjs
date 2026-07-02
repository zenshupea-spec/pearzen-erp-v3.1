#!/usr/bin/env node
/**
 * Fail if tracked PWA sources set Access-Control-Allow-Origin: *
 *
 * Run: npm run scan:cors
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  scanTextForForbiddenCors,
  shouldScanPathForCors,
} from './lib/cors-scan-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' });
  return out
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

const files = listTrackedFiles().filter(shouldScanPathForCors);
const violations = [];

for (const rel of files) {
  let content;
  try {
    content = readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  if (content.includes('\0')) continue;
  violations.push(...scanTextForForbiddenCors(content, rel));
}

if (!violations.length) {
  console.log(`✓ CORS scan passed (${files.length} PWA paths)`);
  process.exit(0);
}

console.error('✗ CORS scan failed — wildcard Access-Control-Allow-Origin detected:\n');
for (const v of violations) {
  console.error(`  ${v.filePath}:${v.lineNumber} — ${v.message}`);
  console.error(`    ${v.line}\n`);
}
process.exit(1);
