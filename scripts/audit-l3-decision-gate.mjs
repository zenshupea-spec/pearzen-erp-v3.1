#!/usr/bin/env node
/**
 * S-33 — L3 decision gate audit (AKSD sign-off + fresh CVS backup).
 *
 * Run: npm run audit:l3-decision-gate
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = join(ROOT, 'audit-evidence/platform/s-33-l3-decision-backup.txt');
const SIGNOFF = join(ROOT, 'audit-evidence/platform/aksd-l3-supabase-signoff.md');
const RUNBOOK = join(ROOT, 'docs/runbooks/cvs-l3-supabase-isolation.md');

function loadEnv() {
  for (const file of ['.env.seed.tmp', '.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
          process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {
      /* try next */
    }
  }
}

function aksdSignoffComplete() {
  if (!existsSync(SIGNOFF)) return false;
  const text = readFileSync(SIGNOFF, 'utf8');
  const hasDate = /Date:\s*\S/.test(text) && !/Date:\s*_+/.test(text);
  const hasSignature = /Signature|typed name:\s*\S/.test(text) && !/_{3,}/.test(text.split('Approval')[1] ?? '');
  return hasDate && hasSignature;
}

function hasBackupCredentials() {
  if (process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim()) return true;
  return Boolean(
    process.env.SUPABASE_DB_PASSWORD?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  );
}

function main() {
  loadEnv();

  console.log('\nS-33 L3 decision gate audit\n');

  const checks = [
    ['L3 runbook exists', existsSync(RUNBOOK)],
    ['AKSD sign-off form exists', existsSync(SIGNOFF)],
    ['AKSD sign-off completed', aksdSignoffComplete()],
    ['Backup credentials configured', hasBackupCredentials()],
  ];

  const failures = [];
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
    if (!ok && label !== 'AKSD sign-off completed') failures.push(label);
  }

  let backupStatus = 'skipped — no DATABASE_URL / SUPABASE_DB_PASSWORD';
  let backupPass = false;

  if (hasBackupCredentials()) {
    console.log('\n── backup:cvs-database ──');
    try {
      execSync('npm run backup:cvs-database', { cwd: ROOT, stdio: 'inherit' });
      backupStatus = 'PASS';
      backupPass = true;
    } catch {
      backupStatus = 'FAIL — see backup script output';
    }
  } else {
    console.log('\n  · backup:cvs-database not run — credentials missing');
  }

  const signoffPass = aksdSignoffComplete();
  const pass = signoffPass && backupPass;

  const lines = [
    'FORGE ↔ CVS ISOLATION — S-33 L3 decision + backup',
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Gate status (required before S-34):',
    `  AKSD sign-off: ${signoffPass ? 'PASS' : 'PENDING — complete audit-evidence/platform/aksd-l3-supabase-signoff.md'}`,
    `  Fresh backup:  ${backupStatus}`,
    '',
    'L2 decision (S-4): Phase H deferred until AKSD requests L3',
    'CVS Supabase ref (current): ktfgvcrdfbapmefktgjc',
    '',
    'Artifacts:',
    '  · docs/runbooks/cvs-l3-supabase-isolation.md',
    '  · audit-evidence/platform/aksd-l3-supabase-signoff.md',
    '',
    pass ? 'Status: PASS — proceed to S-34' : 'Status: GATED — do not proceed to S-34',
    '',
    'Repeatable: npm run audit:l3-decision-gate',
  ];

  const report = lines.join('\n');
  console.log('\n' + report);
  writeFileSync(EVIDENCE, `${report}\n`);

  if (!pass) process.exit(1);
}

main();
