/**
 * Cross-sheet derived lists for bulk editor dropdowns (steps 9–10).
 */

import { normalizeRankCode } from './bulk-editor-ranks-grid';
import { isHeadOfficeSectorNameActive, WEB_EDITOR_SECTOR_NAME_COLUMN } from './bulk-roster-web-editor-spec';
import { normalizeHrSectorName } from './hr-sectors';
import type { BulkEditorRow } from './bulk-roster-web-editor-spec';

export function buildSiteCodeIndex(
  siteRows: readonly BulkEditorRow[],
): Map<string, BulkEditorRow> {
  const map = new Map<string, BulkEditorRow>();
  for (const row of siteRows) {
    const code = normalizeSiteCode(row.site_code);
    if (code && !map.has(code)) map.set(code, row);
  }
  return map;
}

export function resolveSiteName(
  siteCode: unknown,
  siteRows: readonly BulkEditorRow[],
): string {
  const code = normalizeSiteCode(siteCode);
  if (!code) return '';
  return String(buildSiteCodeIndex(siteRows).get(code)?.site_name ?? '').trim();
}

export function findSmEpfForSector(
  headOfficeRows: readonly BulkEditorRow[],
  sectorName: string,
): string {
  const target = normalizeHrSectorName(sectorName);
  if (!target) return '';
  for (const row of headOfficeRows) {
    if (!isHeadOfficeSectorNameActive({ rank: String(row.rank ?? '') })) continue;
    const sector = normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]);
    if (sector !== target) continue;
    const epf = String(row.epf_no ?? '').trim().toUpperCase();
    if (epf) return epf;
  }
  return '';
}

/** Derive guard assigned_sm_epf from Sites row (direct SM or sector match). */
export function deriveGuardAssignedSm(
  siteCode: unknown,
  siteRows: readonly BulkEditorRow[],
  headOfficeRows: readonly BulkEditorRow[],
): string {
  const code = normalizeSiteCode(siteCode);
  if (!code) return '';
  const site = buildSiteCodeIndex(siteRows).get(code);
  if (!site) return '';
  const directSm = String(site.assigned_sm_epf ?? '').trim().toUpperCase();
  if (directSm) return directSm;
  const sector = normalizeHrSectorName(site[WEB_EDITOR_SECTOR_NAME_COLUMN]);
  if (!sector) return '';
  return findSmEpfForSector(headOfficeRows, sector);
}

export function collectSmEpfOptions(headOfficeRows: readonly BulkEditorRow[]): string[] {
  const epfs = new Set<string>();
  for (const row of headOfficeRows) {
    if (!isHeadOfficeSectorNameActive({ rank: String(row.rank ?? '') })) continue;
    const epf = String(row.epf_no ?? '').trim().toUpperCase();
    if (epf) epfs.add(epf);
  }
  return [...epfs].sort((a, b) => a.localeCompare(b));
}

export function buildSmEpfToSectorMap(
  headOfficeRows: readonly BulkEditorRow[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of headOfficeRows) {
    if (!isHeadOfficeSectorNameActive({ rank: String(row.rank ?? '') })) continue;
    const epf = String(row.epf_no ?? '').trim().toUpperCase();
    const sector = normalizeHrSectorName(row[WEB_EDITOR_SECTOR_NAME_COLUMN]);
    if (epf && sector) map.set(epf, sector);
  }
  return map;
}

/** Live site_code values for Guard tab dropdowns (step 10). */
export function collectSiteCodeOptions(siteRows: readonly BulkEditorRow[]): string[] {
  const codes = new Set<string>();
  for (const row of siteRows) {
    const code = String(row.site_code ?? '').trim().toUpperCase();
    if (code) codes.add(code);
  }
  return [...codes].sort((a, b) => a.localeCompare(b));
}

export function normalizeSiteCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function collectRankCodeOptions(
  rankRows: readonly BulkEditorRow[],
  localRows: readonly BulkEditorRow[] = [],
): string[] {
  const codes = new Set<string>();

  for (const row of rankRows) {
    const code = normalizeRankCode(row.rank_code);
    if (code) codes.add(code);
  }

  for (const row of localRows) {
    const code = String(row.rank ?? row.rank_code ?? '')
      .trim()
      .toUpperCase();
    if (code) codes.add(code);
  }

  return [...codes].sort((a, b) => a.localeCompare(b));
}

export function lookupRankMatrixRow(
  rankRows: readonly BulkEditorRow[],
  rankCode: string,
): BulkEditorRow | undefined {
  const target = String(rankCode ?? '').trim().toUpperCase();
  if (!target) return undefined;
  return rankRows.find((row) => normalizeRankCode(row.rank_code) === target);
}

/** Fill rank_title / pay / salary fields when a workforce row picks a Ranks tab code. */
export function applyWorkforceRankFieldsFromMatrix(
  row: BulkEditorRow,
  rankRows: readonly BulkEditorRow[],
): BulkEditorRow {
  const code = String(row.rank ?? '').trim().toUpperCase();
  if (!code) return row;

  const match = lookupRankMatrixRow(rankRows, code);
  if (!match) return { ...row, rank: code };

  return {
    ...row,
    rank: code,
    rank_title: String(match.rank_title ?? '').trim() || String(row.rank_title ?? ''),
    rank_basic_pay: String(match.basic_pay_lkr ?? '').trim() || String(row.rank_basic_pay ?? ''),
    rank_salary_type:
      String(match.salary_type ?? '').trim().toUpperCase() || String(row.rank_salary_type ?? ''),
    rank_operational_group:
      String(match.operational_group ?? '').trim().toUpperCase() ||
      String(row.rank_operational_group ?? ''),
  };
}
