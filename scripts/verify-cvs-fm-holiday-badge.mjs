#!/usr/bin/env node
/**
 * H-12 — verify FM holiday calendar badge reads from DB helper (not hardcoded).
 *
 * Run: npm run verify:cvs-fm-holiday-badge
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const paths = {
  lib: join(ROOT, 'apps/back-office/lib/fm-holiday-calendar.ts'),
  actions: join(ROOT, 'apps/back-office/app/fm/holiday-calendar-actions.ts'),
  hook: join(ROOT, 'apps/back-office/app/fm/use-fm-holiday-calendar-incomplete.ts'),
  migration: join(
    ROOT,
    'packages/supabase/migrations/20260624140000_md_settings_holiday_calendar.sql',
  ),
};

const fmPages = [
  'apps/back-office/app/fm/page.tsx',
  'apps/back-office/app/fm/sites/page.tsx',
  'apps/back-office/app/fm/roster/page.tsx',
  'apps/back-office/app/fm/sm-handler/page.tsx',
  'apps/back-office/app/fm/discrepancy-queue/page.tsx',
];

const failures = [];

for (const [label, path] of Object.entries(paths)) {
  if (!existsSync(path)) failures.push(`Missing ${label}: ${path}`);
}

const lib = readFileSync(paths.lib, 'utf8');
if (!lib.includes('isHolidayCalendarIncomplete')) {
  failures.push('fm-holiday-calendar missing isHolidayCalendarIncomplete');
}

for (const rel of fmPages) {
  const source = readFileSync(join(ROOT, rel), 'utf8');
  if (source.includes('holidayCalendarIncomplete = true')) {
    failures.push(`${rel} still hardcodes holidayCalendarIncomplete = true`);
  }
  if (!source.includes('useFmHolidayCalendarIncomplete')) {
    failures.push(`${rel} does not use useFmHolidayCalendarIncomplete`);
  }
}

const settings = readFileSync(join(ROOT, 'apps/back-office/app/fm/settings/page.tsx'), 'utf8');
if (!settings.includes('isHolidayCalendarIncomplete')) {
  failures.push('fm/settings missing shared completeness helper');
}
if (!settings.includes('saveFmHolidayCalendar')) {
  failures.push('fm/settings does not persist holiday calendar to DB');
}

if (failures.length > 0) {
  console.error('CVS H-12 FM holiday badge check FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}

console.log('✓ CVS H-12 FM holiday calendar badge verified');
