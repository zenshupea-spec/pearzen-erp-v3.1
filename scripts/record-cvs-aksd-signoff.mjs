#!/usr/bin/env node
/**
 * Record AKSD written sign-off in audit-evidence/cvs/signoff-bundle.json.
 *
 * Usage:
 *   npm run record:cvs-aksd-signoff -- --session-date 2026-06-25 --signed-at 2026-06-25
 *   npm run record:cvs-aksd-signoff -- --session-date 2026-06-25 --signed-at 2026-06-25 --signature-ref "email from aksd@..."
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = join(__dirname, '../audit-evidence/cvs/signoff-bundle.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--session-date') out.sessionDate = argv[++i];
    else if (arg === '--signed-at') out.signedAt = argv[++i];
    else if (arg === '--signature-ref') out.signatureRef = argv[++i];
    else if (arg === '--signatory') out.signatoryName = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Record AKSD sign-off in signoff-bundle.json

Required:
  --session-date   YYYY-MM-DD  Review session held
  --signed-at      YYYY-MM-DD  Written sign-off date

Optional:
  --signature-ref  Email subject / PDF filename
  --signatory      Default: AKSD Perera
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.sessionDate || !args.signedAt) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
if (!isoDate.test(args.sessionDate) || !isoDate.test(args.signedAt)) {
  console.error('Dates must be YYYY-MM-DD');
  process.exit(1);
}

const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

bundle.bundleVersion = '2.2';
bundle.preparedOn = args.signedAt;

bundle.aksdReviewSession = {
  ...bundle.aksdReviewSession,
  status: 'HELD',
  sessionDate: args.sessionDate,
  sessionBrief: 'audit-evidence/cvs/aksd-review-session-brief.md',
  signoffForm: 'audit-evidence/cvs/aksd-signoff-form.md',
  agendaDocumented: true,
};

bundle.aksdSignOff = {
  ...bundle.aksdSignOff,
  status: 'SIGNED',
  reviewedRegressionSuite: true,
  reviewedSecuritySection: true,
  acceptedFailVerdictsForRemediation: true,
  signatoryName: args.signatoryName ?? 'AKSD Perera',
  signatoryTitle: 'Managing Director',
  signedAt: args.signedAt,
  signatureRef: args.signatureRef ?? null,
  notes: `Written sign-off recorded ${args.signedAt}. Session ${args.sessionDate}. Post-remediation 10/10 regression, 7/7 threat checks.`,
};

bundle.handoverStepsCompleted = Math.max(bundle.handoverStepsCompleted ?? 0, 1);

bundle.deployGate = {
  ...bundle.deployGate,
  aksdSignOff: true,
  notes:
    'AKSD sign-off recorded. Proceed with CVS_HANDOVER_STEPS H-2 onward. Payroll PAID still requires H-5–H-7 + backup posture H-3/H-4.',
};

bundle.nextSteps = [
  'CVS_HANDOVER_STEPS.md H-2: Vercel preview isolation',
  'H-3: Enable nightly CVS database backup workflow',
  'H-4: AKSD RPO acceptance or H-14 Pro+PITR',
  'H-5: OM clear attendance verification queue',
];

const files = bundle.files ?? [];
for (const path of [
  'audit-evidence/cvs/aksd-review-session-brief.md',
  'audit-evidence/cvs/aksd-signoff-form.md',
  'CVS_HANDOVER_STEPS.md',
]) {
  if (!files.some((f) => f.path === path)) {
    files.push({
      path,
      description:
        path.includes('brief')
          ? 'AKSD 90-min review session agenda (post-remediation)'
          : path.includes('signoff-form')
            ? 'Fillable AKSD written sign-off form'
            : '14-step production handover tracker',
      auditItem: '§3.12.4 / H-1',
    });
  }
}
bundle.files = files;

writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(`✓ Updated ${BUNDLE_PATH}`);
console.log(`  aksdSignOff.status: SIGNED`);
console.log(`  aksdReviewSession.status: HELD (${args.sessionDate})`);
