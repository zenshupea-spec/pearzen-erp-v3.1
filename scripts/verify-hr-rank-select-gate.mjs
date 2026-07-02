#!/usr/bin/env node
/**
 * HR rank select gate — matrix-only dropdowns, singleton MD/OD/FM exclusion.
 *
 * Run: npm run verify:hr-rank-select-gate
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = {
  inductionForm: join(ROOT, 'apps/back-office/app/hr/InductionForm.tsx'),
  onboardingActions: join(ROOT, 'apps/back-office/app/hr/onboarding-actions.ts'),
  onboardingPage: join(ROOT, 'apps/back-office/app/hr/onboarding/page.tsx'),
  mnrPage: join(ROOT, 'apps/back-office/app/hr/mnr/page.jsx'),
  mnrActions: join(ROOT, 'apps/back-office/app/hr/mnr/actions.ts'),
  rankMatrixActions: join(
    ROOT,
    'apps/back-office/app/executive/settings/rank-matrix-actions.ts',
  ),
  rankPayMatrix: join(ROOT, 'packages/rank-pay-matrix/index.ts'),
  bulkImport: join(ROOT, 'apps/back-office/lib/bulk-data-import.ts'),
  singletonGuard: join(ROOT, 'apps/back-office/lib/singleton-portal-rank-guard.ts'),
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

const inductionForm = read(FILES.inductionForm);
mustInclude('InductionForm', inductionForm, 'ranksForHrAssignmentSelect', {
  forbid: ['mergeRankOptionsForCorporateGroup'],
});
mustInclude('InductionForm', inductionForm, 'isRankValidForHrAssignment');
mustInclude('InductionForm', inductionForm, 'occupiedSingletonRanks');

const onboardingActions = read(FILES.onboardingActions);
mustInclude('onboarding-actions', onboardingActions, 'isRankValidForHrAssignment', {
  forbid: ['isRankValidForCorporateGroup'],
});
mustInclude(
  'onboarding-actions',
  onboardingActions,
  'assertSingletonPortalRankAvailable',
);

const onboardingPage = read(FILES.onboardingPage);
mustInclude(
  'onboarding/page',
  onboardingPage,
  'getOccupiedSingletonPortalRanks',
);
mustInclude(
  'onboarding/page',
  onboardingPage,
  'occupiedSingletonRanks={occupiedSingletonRanks}',
);

const mnrPage = read(FILES.mnrPage);
mustInclude('mnr/page RankSelectField', mnrPage, 'ranksForHrAssignmentSelect', {
  forbid: ['mergeRankOptionsForCorporateGroup'],
});
mustInclude(
  'mnr/page',
  mnrPage,
  'getOccupiedSingletonPortalRanksForSession',
);

const mnrActions = read(FILES.mnrActions);
mustInclude('mnr/actions', mnrActions, 'isRankValidForHrAssignment', {
  forbid: ['mergeRankOptionsForCorporateGroup'],
});
mustInclude(
  'mnr/actions',
  mnrActions,
  'assertSingletonPortalRankAvailable',
);

const rankMatrixActions = read(FILES.rankMatrixActions);
const onboardingRevalidateCount = (
  rankMatrixActions.match(/revalidatePath\('\/hr\/onboarding'\)/g) ?? []
).length;
if (onboardingRevalidateCount < 2) {
  failures.push(
    `rank-matrix-actions: expected revalidatePath('/hr/onboarding') at least twice (got ${onboardingRevalidateCount})`,
  );
}

const rankPayMatrix = read(FILES.rankPayMatrix);
mustInclude(
  'rank-pay-matrix',
  rankPayMatrix,
  "SINGLETON_HR_ASSIGNABLE_PORTAL_RANKS = ['MD', 'OD', 'FM']",
);
mustInclude('rank-pay-matrix', rankPayMatrix, 'ranksForHrAssignmentSelect');
mustInclude('rank-pay-matrix', rankPayMatrix, 'isRankValidForHrAssignment');

const bulkImport = read(FILES.bulkImport);
mustInclude('bulk-data-import', bulkImport, 'isRankValidForHrAssignment', {
  forbid: ['isRankValidForCorporateGroup'],
});
mustInclude(
  'bulk-data-import',
  bulkImport,
  'bulkImportSingletonPortalRankError',
);

const singletonGuard = read(FILES.singletonGuard);
mustInclude(
  'singleton-portal-rank-guard',
  singletonGuard,
  'getOccupiedSingletonPortalRanks',
);
mustInclude(
  'singleton-portal-rank-guard',
  singletonGuard,
  'assertSingletonPortalRankAvailable',
);

if (failures.length > 0) {
  console.error('HR rank select gate FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ HR rank select gate verified (matrix-only + MD/OD/FM singleton)');
