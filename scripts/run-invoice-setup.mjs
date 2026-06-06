/**
 * One-shot setup for Invoice Desk ↔ MD Settings (remote Supabase).
 * Run: npm run db:invoice-setup
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script)], {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

console.log('▶ Syncing VAT, SSCL, and invoice letterhead for all companies…');
await run('sync-invoice-md-settings.mjs');
console.log('✅ Invoice MD settings sync complete.');
