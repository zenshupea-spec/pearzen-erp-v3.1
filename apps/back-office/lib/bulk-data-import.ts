import * as XLSX from 'xlsx';

import {
  isRankInMatrix,
  isRankValidForCorporateGroup,
  type RankPayEntry,
} from '../../../packages/rank-pay-matrix';
import { isExecutiveRank } from './executive-rank-guard';

import {
  EMPLOYEE_BULK_COLUMNS,
  SITE_BULK_COLUMNS,
  SM_GUARD_LINK_COLUMNS,
} from './bulk-data-workbook';

const SITE_TYPES = new Set([
  'OFFICE',
  'BANK',
  'PHARMACY',
  'STORAGE',
  'HOTEL',
  'RESIDENTIAL',
  'OTHER',
]);

const VERIFICATION_MODES = new Set(['A', 'B', 'C']);

export type ParsedBulkWorkbook = {
  employees: Record<string, unknown>[];
  sites: Record<string, unknown>[];
  smGuardLinks: Record<string, unknown>[];
};

export type BulkImportSummary = {
  employeesInserted: number;
  employeesUpdated: number;
  sitesInserted: number;
  sitesUpdated: number;
  smLinksUpserted: number;
};

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

function isBlankRow(row: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => {
    const v = row[key];
    return v === '' || v === null || v === undefined;
  });
}

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function parseBool(value: unknown): boolean {
  const s = cellStr(value).toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function parseOptionalNumber(value: unknown): number | null {
  const s = cellStr(value);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseBulkDataWorkbook(buffer: Buffer): ParsedBulkWorkbook {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const employees = sheetToRows(wb, 'Employees').filter(
    (row) => !isBlankRow(row, EMPLOYEE_BULK_COLUMNS),
  );
  const sites = sheetToRows(wb, 'Sites').filter((row) => !isBlankRow(row, SITE_BULK_COLUMNS));
  const smGuardLinks = sheetToRows(wb, 'SM_Guard_Links').filter(
    (row) => !isBlankRow(row, SM_GUARD_LINK_COLUMNS),
  );

  return { employees, sites, smGuardLinks };
}

export function validateBulkImport(
  parsed: ParsedBulkWorkbook,
  rankMatrix: RankPayEntry[],
): string[] {
  const errors: string[] = [];

  if (
    !parsed.employees.length &&
    !parsed.sites.length &&
    !parsed.smGuardLinks.length
  ) {
    errors.push(
      'Workbook has no data rows on Employees, Sites, or SM_Guard_Links. Add at least one row to import.',
    );
    return errors;
  }

  const empNumbers = new Set<string>();

  parsed.employees.forEach((row, index) => {
    const line = index + 2;
    const empNumber = cellStr(row.emp_number).toUpperCase();
    const fullName = cellStr(row.full_name);
    const employeeId = cellStr(row.employee_id);

    if (!empNumber && !employeeId) {
      errors.push(`Employees row ${line}: emp_number or employee_id is required.`);
    }
    if (!fullName) {
      errors.push(`Employees row ${line}: full_name is required.`);
    }
    if (empNumber) {
      if (empNumbers.has(empNumber)) {
        errors.push(`Employees row ${line}: duplicate emp_number "${empNumber}".`);
      }
      empNumbers.add(empNumber);
    }

    const group = cellStr(row.group);
    const rank = cellStr(row.rank).toUpperCase();
    if (rank) {
      if (group) {
        if (!isRankValidForCorporateGroup(rankMatrix, group, rank)) {
          errors.push(
            `Employees row ${line}: rank "${rank}" is not valid for group "${group}".`,
          );
        }
      } else if (!isRankInMatrix(rankMatrix, rank)) {
        errors.push(
          `Employees row ${line}: rank "${rank}" is not in the Rank Pay Matrix.`,
        );
      }
    }

    const salaryType = cellStr(row.salary_type).toUpperCase();
    if (salaryType && salaryType !== 'BANK' && salaryType !== 'CASH') {
      errors.push(`Employees row ${line}: salary_type must be BANK or CASH.`);
    }
  });

  const siteNames = new Set<string>();

  parsed.sites.forEach((row, index) => {
    const line = index + 2;
    const siteName = cellStr(row.site_name);
    const siteId = cellStr(row.site_id);

    if (!siteName && !siteId) {
      errors.push(`Sites row ${line}: site_name or site_id is required.`);
    }
    if (siteName) {
      if (siteNames.has(siteName.toLowerCase())) {
        errors.push(`Sites row ${line}: duplicate site_name "${siteName}".`);
      }
      siteNames.add(siteName.toLowerCase());
    }

    const siteType = cellStr(row.site_type).toUpperCase();
    if (siteType && !SITE_TYPES.has(siteType)) {
      errors.push(
        `Sites row ${line}: site_type "${siteType}" is invalid. See Lookups sheet.`,
      );
    }

    const mode = cellStr(row.verification_mode).toUpperCase();
    if (mode && !VERIFICATION_MODES.has(mode)) {
      errors.push(`Sites row ${line}: verification_mode must be A, B, or C.`);
    }

    const lat = parseOptionalNumber(row.latitude);
    const lng = parseOptionalNumber(row.longitude);
    if (lat != null && (lat < -90 || lat > 90)) {
      errors.push(`Sites row ${line}: latitude must be between -90 and 90.`);
    }
    if (lng != null && (lng < -180 || lng > 180)) {
      errors.push(`Sites row ${line}: longitude must be between -180 and 180.`);
    }
  });

  parsed.smGuardLinks.forEach((row, index) => {
    const line = index + 2;
    const smEpf = cellStr(row.sm_epf).toUpperCase();
    const guardEpf = cellStr(row.guard_epf).toUpperCase();

    if (!smEpf || !guardEpf) {
      errors.push(`SM_Guard_Links row ${line}: sm_epf and guard_epf are both required.`);
    }
  });

  return errors;
}

export function mapEmployeeImportRow(row: Record<string, unknown>) {
  const empNumber = cellStr(row.emp_number).toUpperCase();
  const rank = cellStr(row.rank).toUpperCase() || null;
  const group = cellStr(row.group).toUpperCase() || null;
  const baseSalary = parseOptionalNumber(row.base_salary);

  return {
    employeeId: cellStr(row.employee_id) || null,
    empNumber: empNumber || null,
    payload: {
      emp_number: empNumber || undefined,
      full_name: cellStr(row.full_name).toUpperCase(),
      passport_no: cellStr(row.passport_no).toUpperCase() || null,
      epf_no: cellStr(row.epf_no) || null,
      dob: cellStr(row.dob) || null,
      gender: cellStr(row.gender).toUpperCase() || null,
      nationality: cellStr(row.nationality).toUpperCase() || null,
      religion: cellStr(row.religion).toUpperCase() || null,
      home_address: cellStr(row.home_address).toUpperCase() || null,
      role: cellStr(row.role).toUpperCase() || null,
      group,
      rank,
      site: cellStr(row.site) || null,
      date_joined: cellStr(row.date_joined) || null,
      status: cellStr(row.status) || 'ACTIVE',
      base_salary: baseSalary,
      salary_type: cellStr(row.salary_type).toUpperCase() || null,
      epf_yn: parseBool(row.epf_yn),
      bank_code: cellStr(row.bank_code) || null,
      bank_name: cellStr(row.bank_name).toUpperCase() || null,
      branch_code: cellStr(row.branch_code) || null,
      account_number: cellStr(row.account_number) || null,
      mod_expiry: cellStr(row.mod_expiry) || null,
      police_expiry: cellStr(row.police_expiry) || null,
      maternity_leave: parseBool(row.maternity_leave),
      nicPlain: cellStr(row.nic).toUpperCase(),
      phonePlain: cellStr(row.phone),
    },
  };
}

export function mapSiteImportRow(row: Record<string, unknown>) {
  const lat = parseOptionalNumber(row.latitude);
  const lng = parseOptionalNumber(row.longitude);
  const radius = parseOptionalNumber(row.geofence_radius_m);

  return {
    siteId: cellStr(row.site_id) || null,
    siteName: cellStr(row.site_name),
    payload: {
      site_name: cellStr(row.site_name),
      site_type: (cellStr(row.site_type).toUpperCase() || 'OTHER') as
        | 'OFFICE'
        | 'BANK'
        | 'PHARMACY'
        | 'STORAGE'
        | 'HOTEL'
        | 'RESIDENTIAL'
        | 'OTHER',
      address: cellStr(row.address).toUpperCase() || null,
      required_guards: parseOptionalNumber(row.required_guards) ?? 1,
      assigned_sm_epf: cellStr(row.assigned_sm_epf).toUpperCase() || null,
      latitude: lat,
      longitude: lng,
      geofence_radius: radius,
      verification_mode: cellStr(row.verification_mode).toUpperCase() || 'B',
      provides_food: parseBool(row.provides_food),
      food_allowance_lkr: parseOptionalNumber(row.food_allowance_lkr) ?? 0,
      provides_accommodation: parseBool(row.provides_accommodation),
      nfc_tag_id: cellStr(row.nfc_tag_id) || null,
      needs_om_gps_capture: lat == null || lng == null,
    },
  };
}

export function mapSmLinkImportRow(row: Record<string, unknown>) {
  return {
    sm_epf: cellStr(row.sm_epf).toUpperCase(),
    guard_epf: cellStr(row.guard_epf).toUpperCase(),
  };
}
