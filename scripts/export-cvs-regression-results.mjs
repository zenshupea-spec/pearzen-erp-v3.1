#!/usr/bin/env node
/**
 * Re-export CVS calculation regression CSV (§2.14.2).
 *
 * Run: npm run export:cvs-regression
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync(
  'npx vitest run apps/back-office/lib/cvs-regression-export.test.ts apps/back-office/lib/cvs-calc-regression.test.ts',
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, EXPORT_CVS_REGRESSION: '1' },
  },
);

console.log('✓ Wrote audit-evidence/cvs/regression-results-v1.csv');
