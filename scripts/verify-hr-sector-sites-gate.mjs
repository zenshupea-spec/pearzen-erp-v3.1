#!/usr/bin/env node
/**
 * HR sector + sites workstream gate — SM induction, sector from MNR, sites mapping.
 *
 * Run: npm run verify:hr-sector-sites-gate
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  inductionForm: join(ROOT, 'apps/back-office/app/hr/InductionForm.tsx'),
  onboardingActions: join(ROOT, 'apps/back-office/app/hr/onboarding-actions.ts'),
  siteDirectoryActions: join(
    ROOT,
    'apps/back-office/app/actions/site-directory-actions.ts',
  ),
  rankPayMatrix: join(ROOT, 'packages/rank-pay-matrix/index.ts'),
  hrRankSelectTest: join(ROOT, 'packages/rank-pay-matrix/hr-rank-select.test.ts'),
};

function read(path) {
  return readFileSync(path, 'utf8');
}

const failures = [];

function mustInclude(label, source, needle, { forbid = [] } = {}) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing "${needle}"`);
  }
  for (const bad of forbid) {
    if (source.includes(bad)) {
      failures.push(`${label}: must not include "${bad}"`);
    }
  }
}

function mustNotMatch(label, source, pattern, message) {
  if (pattern.test(source)) {
    failures.push(`${label}: ${message}`);
  }
}

const inductionForm = read(FILES.inductionForm);
mustInclude('InductionForm', inductionForm, 'const CORPORATE_GROUPS = [');
mustNotMatch(
  'InductionForm',
  inductionForm,
  /value:\s*['"]SECTOR_MANAGER['"]/,
  'CORPORATE_GROUPS must not include SECTOR_MANAGER',
);
mustInclude('InductionForm', inductionForm, "value: 'HEAD_OFFICE'");

const rankPayMatrix = read(FILES.rankPayMatrix);
mustInclude(
  'rank-pay-matrix',
  rankPayMatrix,
  'export function ranksForHeadOfficeHrAssignmentSelect',
);
mustInclude(
  'rank-pay-matrix',
  rankPayMatrix,
  'return ranksForHeadOfficeHrAssignmentSelect(matrix, opts)',
);

const hrRankSelectTest = read(FILES.hrRankSelectTest);
mustInclude(
  'hr-rank-select.test',
  hrRankSelectTest,
  'includes SM via ranksForHeadOfficeHrAssignmentSelect',
);
mustInclude('hr-rank-select.test', hrRankSelectTest, "expect(selected).toContain('SM')");

const siteDirectoryActions = read(FILES.siteDirectoryActions);
mustInclude(
  'site-directory-actions',
  siteDirectoryActions,
  'function resolveClientSiteSector',
);
mustInclude(
  'site-directory-actions mapDbRowToMasterSite',
  siteDirectoryActions,
  'resolveClientSiteSector(smEpf, smByEpf)',
);
mustNotMatch(
  'site-directory-actions mapDbRowToMasterSite',
  siteDirectoryActions,
  /sector:\s*['"]Unassigned['"]/,
  'mapDbRowToMasterSite must not hardcode client sector as Unassigned',
);

const onboardingActions = read(FILES.onboardingActions);
mustInclude('onboarding-actions', onboardingActions, "const isSmRank = rank === 'SM'");
mustInclude('onboarding-actions', onboardingActions, 'if (isSmRank && rosterEmpNumber)');
mustInclude('onboarding-actions', onboardingActions, 'provisionSMPortalAccess');
mustNotMatch(
  'onboarding-actions SM portal trigger',
  onboardingActions,
  /if\s*\(\s*corporateGroup\s*===\s*['"]SECTOR_MANAGER['"][\s\S]{0,120}provisionSMPortalAccess/,
  'SM portal must trigger on rank SM, not corporateGroup SECTOR_MANAGER',
);

if (failures.length > 0) {
  console.error('HR sector + sites gate FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log(
  '✓ HR sector + sites gate verified (SM HO induction, sector mapping, rank matrix)',
);
