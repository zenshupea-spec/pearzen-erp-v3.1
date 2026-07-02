#!/usr/bin/env node
/**
 * Verify Forge server actions include platform-operator guards.
 *
 * Run: npm run verify:forge-actions
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync('node scripts/audit-forge-server-actions.mjs', {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log('✓ Forge server action operator guard audit passed');
