#!/usr/bin/env node
/**
 * Record AKSD backup RPO/RTO acceptance (H-4 Path A — logical dumps).
 *
 * Usage:
 *   npm run record:cvs-backup-rpo-acceptance -- --signed-at 2026-06-25
 *   npm run record:cvs-backup-rpo-acceptance -- --signed-at 2026-06-25 --signature-ref "email subject"
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '../audit-evidence/cvs/signoff-bundle.json');
const RUNBOOK_PATH = join(__dirname, '../docs/runbooks/cvs-database-recovery.md');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--signed-at') out.signedAt = argv[++i];
    else if (arg === '--signature-ref') out.signatureRef = argv[++i];
    else if (arg === '--signatory') out.signatoryName = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Record AKSD backup RPO acceptance (logical-dump path)

Required:
  --signed-at      YYYY-MM-DD  Acceptance date

Optional:
  --signature-ref  Email subject / PDF filename
  --signatory      Default: AKSD Perera
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.signedAt) {
  usage();
  process.exit(args.help ? 0 : 1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(args.signedAt)) {
  console.error('Date must be YYYY-MM-DD');
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.backupRpoAcceptance = {
  status: 'ACCEPTED',
  path: 'logical_dump',
  rpoHours: 24,
  rtoHours: 4,
  supabaseOrgPlan: 'free',
  pitrEnabled: false,
  signatoryName: args.signatoryName ?? 'AKSD Perera',
  signatoryTitle: 'Managing Director',
  signedAt: args.signedAt,
  signatureRef: args.signatureRef ?? null,
  form: 'audit-evidence/cvs/aksd-backup-rpo-acceptance-form.md',
  runbook: 'docs/runbooks/cvs-database-recovery.md',
  notes: `AKSD accepted 24h RPO / 4h RTO logical-dump recovery on ${args.signedAt}. PAID payroll allowed after H-3 dump verified.`,
};

bundle.deployGate = {
  ...bundle.deployGate,
  backupRpoAccepted: true,
  notes:
    'AKSD backup RPO accepted (logical dumps). Ensure H-3 first dump green before PAID payroll.',
};

const files = bundle.files ?? [];
for (const path of [
  'audit-evidence/cvs/aksd-backup-rpo-acceptance-form.md',
  'docs/runbooks/cvs-backup-github-setup.md',
]) {
  if (!files.some((f) => f.path === path)) {
    files.push({
      path,
      description:
        path.includes('acceptance-form')
          ? 'AKSD backup RPO/RTO acceptance form (H-4)'
          : 'GitHub backup workflow setup',
      auditItem: 'R-INFRA-01 / H-4',
    });
  }
}
bundle.files = files;

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);

let runbook = readFileSync(RUNBOOK_PATH, 'utf8');
const signatory = args.signatoryName ?? 'AKSD Perera';
const sigRef = args.signatureRef ? ` (${args.signatureRef})` : '';
const row = `| Logical-dump RPO/RTO accepted (Free tier) | ${signatory}${sigRef} | ${args.signedAt} |`;

if (runbook.includes('| Logical-dump RPO/RTO accepted (Free tier) | | |')) {
  runbook = runbook.replace(
    '| Logical-dump RPO/RTO accepted (Free tier) | | |',
    row,
  );
  writeFileSync(RUNBOOK_PATH, runbook);
}

console.log(`✓ Updated ${BUNDLE_PATH}`);
console.log(`  backupRpoAcceptance.status: ACCEPTED`);
console.log(`  deployGate.backupRpoAccepted: true`);
