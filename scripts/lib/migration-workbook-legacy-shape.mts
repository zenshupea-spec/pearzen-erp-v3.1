#!/usr/bin/env npx tsx
/**
 * Convert multi-sheet migration workbook → legacy import shape for C-2 script.
 * stdout: JSON { employees, sites, smGuardLinks, multiSheet: true }
 * exit 2 if workbook is legacy Employees/Sites format (caller handles natively)
 */

import { readFileSync } from 'node:fs';

import {
  collectMigrationSiteImportRows,
  collectSmLinksFromParsedWorkbook,
  joinMigrationWorkforceRowsToSites,
  parseBulkDataWorkbook,
  toLegacyImportShape,
} from '../../apps/back-office/lib/bulk-data-import.ts';

const path = process.argv[2];
if (!path) {
  console.error('Usage: migration-workbook-legacy-shape.mts <workbook.xlsx>');
  process.exit(1);
}

const buffer = readFileSync(path);
const parsed = joinMigrationWorkforceRowsToSites(parseBulkDataWorkbook(buffer));

if (!parsed.multiSheetFormat) {
  process.exit(2);
}

const { employees } = toLegacyImportShape(parsed);

const sites = collectMigrationSiteImportRows(parsed).map((site) => ({
  site_id: site.siteId ?? '',
  site_name: site.siteName,
  site_type: site.payload.site_type ?? '',
  address: site.payload.address ?? '',
  required_guards: site.payload.required_guards ?? '',
  assigned_sm_epf: site.payload.assigned_sm_epf ?? '',
  latitude: site.payload.latitude ?? '',
  longitude: site.payload.longitude ?? '',
  geofence_radius_m: site.payload.geofence_radius ?? '',
  verification_mode: site.payload.verification_mode ?? '',
  provides_food: site.payload.provides_food ?? '',
  food_allowance_lkr: site.payload.food_allowance_lkr ?? '',
  provides_accommodation: site.payload.provides_accommodation ?? '',
  nfc_tag_id: site.payload.nfc_tag_id ?? '',
}));

const smGuardLinks = collectSmLinksFromParsedWorkbook(parsed);

process.stdout.write(
  JSON.stringify({
    multiSheet: true,
    employees,
    sites,
    smGuardLinks,
    workforceRows: parsed.rows.length,
    siteRows: sites.length,
    smLinks: smGuardLinks.length,
  }),
);
