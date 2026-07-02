#!/usr/bin/env node
/**
 * U-30 — Build & automated gates for CVS handover.
 *
 * Run: npm run verify:cvs-build-gates
 * Writes: audit-evidence/cvs/build-gates.json
 *
 * Gates:
 *   1. npm run scan:secrets — PASS
 *   2. npm run build (turbo, all 4 apps) — PASS
 *   3. PWA typecheck (client-pwa, field-pwa, sm-pwa) — PASS
 *
 * Back-office full `tsc` has known drift (see apps/back-office/next.config.js
 * ignoreBuildErrors); production deploy gate for back-office is turbo build.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = join(ROOT, 'audit-evidence/cvs/build-gates.json');

function run(label, cmd) {
  const started = Date.now();
  console.log(`\n▶ ${label}`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
    const ms = Date.now() - started;
    console.log(`✓ ${label} (${ms}ms)`);
    return { gate: label, status: 'PASS', durationMs: ms };
  } catch (err) {
    const ms = Date.now() - started;
    console.error(`✗ ${label} failed (${ms}ms)`);
    throw err;
  }
}

const results = [];
const runAt = new Date().toISOString();

try {
  results.push(run('scan:secrets', 'npm run scan:secrets'));
  results.push(run('turbo build (4 apps)', 'npm run build'));
  results.push(
    run(
      'typecheck (client-pwa, field-pwa, sm-pwa)',
      'npm run typecheck -- --filter=client-pwa --filter=field-pwa --filter=sm-pwa',
    ),
  );

  const evidence = {
    step: 'U-30',
    runAt,
    status: 'PASS',
    gates: results,
    notes: [
      'Back-office deploy gate is turbo build (typescript.ignoreBuildErrors: true until TS drift is cleared).',
      'PWA apps run strict tsc via turbo typecheck.',
    ],
  };

  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\n✓ U-30 build gates PASS — evidence: ${EVIDENCE_PATH.replace(`${ROOT}/`, '')}`);
} catch {
  const evidence = {
    step: 'U-30',
    runAt,
    status: 'FAIL',
    gates: results,
  };
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.exit(1);
}
