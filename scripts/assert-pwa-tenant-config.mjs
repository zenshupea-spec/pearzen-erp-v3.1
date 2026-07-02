#!/usr/bin/env node
/**
 * Guardrail: PWAs must not silently default tenant slug to CVS in source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  join(root, 'apps/field-pwa/lib/field-tenant.ts'),
  join(root, 'packages/supabase/pwa-tenant-host.ts'),
  join(root, 'apps/sm-pwa/lib/sm-tenant.ts'),
];

const forbidden = [/\?\?\s*['"]cvs['"]/];

let failed = false;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(src)) {
      console.error(`PWA tenant guardrail failed: ${file} matches ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('PWA tenant slug guardrail: OK');
