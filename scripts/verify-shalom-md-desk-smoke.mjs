#!/usr/bin/env node
/**
 * U-25 — MD Shalom desk cross-check (caretaker EPF assign + OTA iCal + front isolation).
 *
 * Run: npm run verify:shalom-md-desk-smoke
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BACK_OFFICE_URL ?? 'http://127.0.0.1:3002';
const CVS_COMPANY_ID = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

const failures = [];
const warnings = [];

function loadEnv() {
  for (const file of ['apps/back-office/.env.local', '.env']) {
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

/** Must match getShalomFrontCalendarData property-id merge in shalom-front/actions.ts */
function mergeCaretakerPropertyIds(directProps, assignments) {
  const propertyIds = new Set();
  for (const row of directProps ?? []) propertyIds.add(String(row.id));
  for (const row of assignments ?? []) propertyIds.add(String(row.property_id));
  return propertyIds;
}

for (const rel of [
  'apps/back-office/app/executive/shalom/page.tsx',
  'apps/back-office/app/executive/shalom-actions.ts',
  'apps/back-office/app/executive/shalom/shalom-ical-import.ts',
  'apps/back-office/app/executive/shalom/shalom-ical-export.ts',
  'apps/back-office/app/executive/shalom/shalom-ical-url.ts',
  'apps/back-office/app/shalom-front/actions.ts',
]) {
  if (!existsSync(join(ROOT, rel))) failures.push(`Missing file: ${rel}`);
}

const mdPage = readFileSync(join(ROOT, 'apps/back-office/app/executive/shalom/page.tsx'), 'utf8');
for (const needle of [
  'CaretakerAssignPanel',
  'assignShalomCaretakerAction',
  'placeholder="EPF number"',
  'syncShalomPropertyFromOtas',
  'fetchShalomCaretakerLoginDates',
  'ShalomLoginDayDot',
  'DamagePresetsPanel',
  'CollectInquiryPhonePanel',
  'updateShalomStayOpsSettingsAction',
  'Load starter templates',
]) {
  if (!mdPage.includes(needle)) failures.push(`executive/shalom/page missing ${needle}`);
}

const mdActions = readFileSync(join(ROOT, 'apps/back-office/app/executive/shalom-actions.ts'), 'utf8');
for (const needle of [
  'assignShalomCaretakerAction',
  'syncShalomPropertyFromOtas',
  'fetchShalomCaretakerOptions',
  'shalom_caretaker_property_assignments',
  'caretaker_epf',
  'isAllowedOtaIcalUrl',
  'parseIcalEvents',
]) {
  if (!mdActions.includes(needle)) failures.push(`shalom-actions missing ${needle}`);
}

if (!mdActions.includes(".delete()") || !mdActions.includes('shalom_caretaker_property_assignments')) {
  failures.push('assignShalomCaretakerAction must clear assignment rows before upsert');
}

const frontActions = readFileSync(join(ROOT, 'apps/back-office/app/shalom-front/actions.ts'), 'utf8');
if (!frontActions.includes('.eq(\'caretaker_epf\', epf)')) {
  failures.push('getShalomFrontCalendarData missing direct caretaker_epf filter');
}
if (!frontActions.includes('shalom_caretaker_property_assignments')) {
  failures.push('getShalomFrontCalendarData missing assignment table lookup');
}
if (!frontActions.includes(".in('property_id', ids)")) {
  failures.push('getShalomFrontCalendarData bookings must filter by assigned property ids');
}

const merged = mergeCaretakerPropertyIds(
  [{ id: 'prop-a' }, { id: 'prop-b' }],
  [{ property_id: 'prop-c' }],
);
if (!merged.has('prop-a') || !merged.has('prop-b') || !merged.has('prop-c') || merged.size !== 3) {
  failures.push('caretaker property merge logic failed');
}
const empty = mergeCaretakerPropertyIds([], []);
if (empty.size !== 0) failures.push('empty caretaker should see zero properties');

const icalImport = await import(
  join(ROOT, 'apps/back-office/app/executive/shalom/shalom-ical-import.ts')
);
const icalExport = await import(
  join(ROOT, 'apps/back-office/app/executive/shalom/shalom-ical-export.ts')
);

const sampleIcs = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260610
DTEND;VALUE=DATE:20260613
SUMMARY:Reserved
UID:compact@airbnb.com
END:VEVENT
END:VCALENDAR`;

const parsed = icalImport.parseIcalEvents(sampleIcs);
if (parsed.length !== 1 || parsed[0].checkIn !== '2026-06-10') {
  failures.push('parseIcalEvents sample feed failed');
}
if (icalImport.resolveOtaImport('Airbnb (Not available)', 'AIRBNB').isBlock !== true) {
  failures.push('resolveOtaImport Airbnb block failed');
}
if (icalImport.isAllowedOtaIcalUrl('https://example.com/calendar.ics') !== false) {
  failures.push('isAllowedOtaIcalUrl should reject arbitrary hosts');
}
if (icalImport.isAllowedOtaIcalUrl('https://www.airbnb.com/calendar/ical/123.ics?t=abc') !== true) {
  failures.push('isAllowedOtaIcalUrl should accept Airbnb export');
}

const exportBody = icalExport.buildShalomIcalFeed('Test Villa', [], [
  {
    uid: 'ab81c8af-9df9-4a9b-b7f7-0efc99fc1b34@pearzen-shalom',
    check_in: '2026-07-21',
    check_out: '2026-07-22',
  },
]);
if (!exportBody.includes('STATUS:CANCELLED')) {
  failures.push('buildShalomIcalFeed missing CANCELLED export');
}

async function checkHttp(path, expectStatus, expectRedirectIncludes) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    if (res.status !== expectStatus) {
      failures.push(`${path} expected HTTP ${expectStatus}, got ${res.status}`);
      return;
    }
    if (expectRedirectIncludes) {
      const location = decodeURIComponent(res.headers.get('location') ?? '');
      if (!location.includes(expectRedirectIncludes)) {
        failures.push(`${path} redirect expected ${expectRedirectIncludes}, got ${location}`);
      }
    }
  } catch (err) {
    failures.push(`${path} HTTP check failed (${BASE}): ${err.message}`);
  }
}

await checkHttp('/executive/shalom', 307, '/executive/shalom');

loadEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (supabaseUrl && serviceKey) {
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: props, error: propsError } = await supabase
    .from('shalom_properties')
    .select('id, name, caretaker_epf')
    .eq('company_id', CVS_COMPANY_ID);

  if (propsError) {
    if (/shalom_/i.test(propsError.message ?? '')) {
      warnings.push('Shalom tables not on linked Supabase — skip assignment audit');
    } else {
      warnings.push(`Supabase shalom_properties: ${propsError.message}`);
    }
  } else {
    const withCaretaker = (props ?? []).filter((row) => row.caretaker_epf);
    const { data: propsWithSettings, error: settingsError } = await supabase
      .from('shalom_properties')
      .select('id, name, settings')
      .eq('company_id', CVS_COMPANY_ID);

    if (!settingsError && (propsWithSettings ?? []).length > 0) {
      const withDamagePresets = (propsWithSettings ?? []).filter((row) => {
        const settings =
          row.settings && typeof row.settings === 'object'
            ? row.settings
            : {};
        const presets = settings.damagePresets;
        return Array.isArray(presets) && presets.length > 0;
      });
      if (withDamagePresets.length === 0) {
        warnings.push(
          'No shalom_properties have saved damagePresets — MD must configure stay-ops before caretaker go-live (see u-32-operator-handover-package.md §3)',
        );
      }
    }

    if (withCaretaker.length > 0) {
      const { data: assignments, error: assignError } = await supabase
        .from('shalom_caretaker_property_assignments')
        .select('property_id, epf_number')
        .eq('company_id', CVS_COMPANY_ID);

      if (assignError) {
        warnings.push(`Supabase assignments: ${assignError.message}`);
      } else {
        const assignSet = new Set(
          (assignments ?? []).map((row) => `${row.property_id}:${row.epf_number}`),
        );
        for (const row of withCaretaker) {
          const key = `${row.id}:${String(row.caretaker_epf).trim()}`;
          if (!assignSet.has(key)) {
            failures.push(
              `Property "${row.name}" caretaker_epf ${row.caretaker_epf} missing assignment row`,
            );
          }
        }
      }
    }
  }
} else {
  warnings.push('No Supabase env — skipped caretaker_epf ↔ assignment sync audit');
}

if (failures.length > 0) {
  console.error('Shalom MD desk smoke FAILED:\n');
  for (const msg of failures) console.error(`  • ${msg}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const msg of warnings) console.error(`  • ${msg}`);
  }
  process.exit(1);
}

console.log('✓ Shalom MD desk smoke passed (caretaker assign wiring, iCal logic, front isolation)');
if (warnings.length) {
  console.log('Warnings:');
  for (const msg of warnings) console.warn(`  • ${msg}`);
}
console.log('  Operator: MD assign + stay-ops presets + OTA sync on /executive/shalom; caretaker sees assigned props only');
