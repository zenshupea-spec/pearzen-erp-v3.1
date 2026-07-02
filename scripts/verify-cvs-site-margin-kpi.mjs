#!/usr/bin/env node
/**
 * H-13 — verify site margin KPI loads shift/visit counts from monthly rollup.
 *
 * Run: npm run verify:cvs-site-margin-kpi
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  lib: join(ROOT, 'apps/back-office/lib/site-margin-activity.ts'),
  actions: join(ROOT, 'apps/back-office/app/actions/site-directory-actions.ts'),
  fmSites: join(ROOT, 'apps/back-office/app/fm/sites/page.tsx'),
  runbook: join(ROOT, 'docs/runbooks/cvs-site-margin-kpi.md'),
};

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

const lib = readFileSync(paths.lib, 'utf8');
if (!lib.includes('fetchSiteMarginActivityBySiteId')) {
  failures.push('site-margin-activity missing fetchSiteMarginActivityBySiteId');
}
if (!lib.includes('fetchMonthlySiteShiftRollup')) {
  failures.push('site-margin-activity must reuse fetchMonthlySiteShiftRollup');
}
if (!lib.includes('sm_visit_logs')) {
  failures.push('site-margin-activity must count sm_visit_logs visits');
}

const actions = readFileSync(paths.actions, 'utf8');
if (!actions.includes('marginActivity?.shiftsCompleted')) {
  failures.push('mapDbRowToMasterSite must use marginActivity.shiftsCompleted');
}
if (!actions.includes('marginActivity?.visitsLogged')) {
  failures.push('mapDbRowToMasterSite must use marginActivity.visitsLogged');
}
if (!actions.includes('fetchSiteMarginActivityBySiteId')) {
  failures.push('fetchMasterSiteDirectory must call fetchSiteMarginActivityBySiteId');
}
if (!actions.includes('payrollMonth?: string')) {
  failures.push('fetchMasterSiteDirectory missing payrollMonth option');
}

const fmSites = readFileSync(paths.fmSites, 'utf8');
if (!fmSites.includes('FmPayrollMonthSelector')) {
  failures.push('/fm/sites missing FmPayrollMonthSelector');
}
if (!fmSites.includes('fetchMasterSiteDirectory({ payrollMonth })')) {
  failures.push('/fm/sites must pass payrollMonth to fetchMasterSiteDirectory');
}

const pkg = readFileSync(join(ROOT, 'package.json'), 'utf8');
if (!pkg.includes('verify:cvs-site-margin-kpi')) {
  failures.push('package.json missing verify:cvs-site-margin-kpi script');
}

if (failures.length > 0) {
  console.error('CVS H-13 site margin KPI check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-13 site margin KPI verified');
