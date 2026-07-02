#!/usr/bin/env node
/**
 * Verify CVS §3.11 threat scenario remediations (code-path checks).
 *
 * Run: npm run verify:cvs-threats
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync('npx vitest run apps/back-office/lib/cvs-threat-scenarios.test.ts', {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log('✓ CVS §3.11 threat scenario checks passed');
