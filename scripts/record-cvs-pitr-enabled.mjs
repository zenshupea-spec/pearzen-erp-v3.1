#!/usr/bin/env node
/**
 * Record H-14 completion after Supabase Pro + PITR is verified live.
 *
 * Usage:
 *   npm run record:cvs-pitr-enabled -- --verified-at 2026-06-25
 *   npm run record:cvs-pitr-enabled -- --verified-at 2026-06-25 --retention-days 7 --operator "Pearzen ops"
 *
 * Requires SUPABASE_ACCESS_TOKEN — verifies pitr_enabled via Management API before recording.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CVS_PITR_RPO_MINUTES,
  CVS_PITR_RTO_HOURS,
  CVS_SUPABASE_ORG_ID,
  CVS_SUPABASE_PROJECT_REF,
} from './lib/cvs-database-backup.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '../audit-evidence/cvs/signoff-bundle.json');
const RUNBOOK_PATH = join(__dirname, '../docs/runbooks/cvs-database-recovery.md');
const ROOT = join(__dirname, '..');

function loadEnv() {
  for (const file of ['.env.seed.tmp', 'apps/back-office/.env.local', '.env']) {
    try {
      const env = readFileSync(join(ROOT, file), 'utf8');
      for (const line of env.split('\n')) {
        const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      return;
    } catch {
      /* try next */
    }
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verified-at') out.verifiedAt = argv[++i];
    else if (arg === '--retention-days') out.retentionDays = Number(argv[++i]);
    else if (arg === '--operator') out.operator = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Record H-14 Pro + PITR verification in signoff-bundle.json

Required:
  --verified-at    YYYY-MM-DD  Date PITR verified in dashboard/API

Optional:
  --retention-days Default: 7
  --operator       Who performed upgrade (default: Pearzen operator)
`);
}

async function managementFetch(path) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error('SUPABASE_ACCESS_TOKEN required — set in .env.seed.tmp');
  }
  const res = await fetch(`https://api.supabase.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.verifiedAt) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(args.verifiedAt)) {
  console.error('Date must be YYYY-MM-DD');
  process.exit(1);
}

loadEnv();

const projectRef =
  process.env.CVS_SUPABASE_PROJECT_REF?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
  CVS_SUPABASE_PROJECT_REF;

const org = await managementFetch(`/v1/organizations/${CVS_SUPABASE_ORG_ID}`);
const backups = await managementFetch(`/v1/projects/${projectRef}/database/backups`);

const orgPlan = String(org?.plan ?? 'unknown');
const pitrEnabled = Boolean(backups?.pitr_enabled);

console.log(`  Org plan: ${orgPlan}`);
console.log(`  PITR enabled: ${pitrEnabled}`);

if (!pitrEnabled) {
  console.error('\n✗ PITR not enabled — complete dashboard steps in docs/runbooks/cvs-supabase-pro-pitr-upgrade.md first.\n');
  process.exit(1);
}

const retentionDays = args.retentionDays ?? 7;
const operator = args.operator ?? 'Pearzen operator';

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.pitrUpgrade = {
  status: 'COMPLETE',
  handoverStep: 'H-14',
  orgId: CVS_SUPABASE_ORG_ID,
  projectRef,
  orgPlan,
  pitrEnabled: true,
  retentionDays,
  rpoMinutes: CVS_PITR_RPO_MINUTES,
  rtoHours: CVS_PITR_RTO_HOURS,
  verifiedAt: args.verifiedAt,
  verifiedBy: operator,
  runbook: 'docs/runbooks/cvs-supabase-pro-pitr-upgrade.md',
  auditCommand: 'npm run audit:cvs-database-backups',
  recordCommand: 'npm run record:cvs-pitr-enabled',
  supersedes: 'backupRpoAcceptance Path A (H-4 logical dumps)',
  notes: `Pro + PITR verified ${args.verifiedAt}. Payroll-grade RPO ~${CVS_PITR_RPO_MINUTES} min / RTO ~${CVS_PITR_RTO_HOURS} hr.`,
};

if (bundle.backupRpoAcceptance) {
  bundle.backupRpoAcceptance = {
    ...bundle.backupRpoAcceptance,
    status: 'SUPERSEDED',
    supersededBy: 'H-14',
    notes: `Superseded by Pro + PITR on ${args.verifiedAt}. Path A acceptance no longer required.`,
  };
}

bundle.deployGate = {
  ...bundle.deployGate,
  backupRpoAccepted: true,
  pitrEnabled: true,
  notes: `H-14 Pro + PITR verified ${args.verifiedAt}. Backup RPO ~${CVS_PITR_RPO_MINUTES} min.`,
};

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);

let runbook = readFileSync(RUNBOOK_PATH, 'utf8');
const postureBlock = `## Current posture (${args.verifiedAt})

- Supabase org plan: **${orgPlan}** with **PITR enabled** (${retentionDays}-day retention).
- Recovery tier: **~${CVS_PITR_RPO_MINUTES} min RPO / ~${CVS_PITR_RTO_HOURS} hr RTO** (H-14 complete).
- Secondary mitigation: nightly logical dumps → \`cvs-database-backups\` (retain until AKSD confirms otherwise).
`;

if (runbook.includes('## Current posture (')) {
  runbook = runbook.replace(/## Current posture \([\d-]+\)[\s\S]*?(?=\n---\n)/, `${postureBlock.trim()}\n`);
} else {
  runbook = runbook.replace(
    '## Recovery objectives',
    `## Recovery objectives\n\n${postureBlock}`,
  );
}

const signoffRow = `| Pro + PITR funded and verified | ${operator} | ${args.verifiedAt} |`;
if (runbook.includes('| Pro + PITR funded and verified | | |')) {
  runbook = runbook.replace('| Pro + PITR funded and verified | | |', signoffRow);
}

writeFileSync(RUNBOOK_PATH, runbook);

console.log(`\n✓ Updated ${BUNDLE_PATH}`);
console.log('  pitrUpgrade.status: COMPLETE');
console.log('  deployGate.backupRpoAccepted: true');
console.log('  deployGate.pitrEnabled: true');
