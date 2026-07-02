#!/usr/bin/env node
/**
 * Lint tracked apps/back-office/.env.production — NEXT_PUBLIC_* only (R-SECRETS-01).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  lintTrackedEnvProductionContent,
  TRACKED_ENV_PRODUCTION_PATH,
} from './lib/secret-scan-rules.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(ROOT, TRACKED_ENV_PRODUCTION_PATH);

let content;
try {
  content = readFileSync(target, 'utf8');
} catch {
  console.error(`Missing ${TRACKED_ENV_PRODUCTION_PATH}`);
  process.exit(1);
}

const violations = lintTrackedEnvProductionContent(content);

if (!violations.length) {
  console.log(`✓ ${TRACKED_ENV_PRODUCTION_PATH} — public vars only`);
  process.exit(0);
}

console.error(`✗ ${TRACKED_ENV_PRODUCTION_PATH} lint failed:\n`);
for (const v of violations) {
  console.error(`  line ${v.lineNumber}: ${v.message}`);
}
process.exit(1);
