import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

import { DEFAULT_RANK_PAY_MATRIX } from '../../../packages/rank-pay-matrix';
import {
  EXAMPLE_UNIFIED_GUARD_ROW,
  EXAMPLE_UNIFIED_ROSTER_ROWS,
  LEGACY_EMPLOYEES_SHEET_NAME,
  LEGACY_SITES_SHEET_NAME,
  UNIFIED_ROSTER_BANK_COLUMNS,
  UNIFIED_ROSTER_COLUMNS,
  UNIFIED_ROSTER_DEBT_COLUMNS,
  UNIFIED_ROSTER_EMPLOYMENT_COLUMNS,
  UNIFIED_ROSTER_IDENTITY_COLUMNS,
  UNIFIED_ROSTER_SITE_COLUMNS,
  UNIFIED_ROSTER_SHEET_NAME,
  UNIFIED_ROSTER_VETTING_COLUMNS,
  buildBulkDataWorkbook,
  buildMigrationExportLookupsSource,
  buildMigrationTemplateSheetInputs,
  buildMigrationTemplateSitesSheetInput,
  buildMigrationTemplateWorkforceSheetInputs,
  columnsForMigrationWorkforceSheet,
  exampleRowsForMigrationWorkforceSheet,
  EXAMPLE_MIGRATION_GUARD_ROW,
  EXAMPLE_MIGRATION_INACTIVE_ROW,
  EXAMPLE_MIGRATION_RESIGNED_ROW,
  EXAMPLE_MIGRATION_SITE_ROWS,
  EXAMPLE_MIGRATION_SM_ROWS,
  EXAMPLE_MIGRATION_TEMP_GUARD_ROW,
  flattenRateMatrixToSiteExportColumns,
  mapSiteProfileForMigrationExport,
  mergeExportRowsToUnifiedRoster,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_LOOKUPS,
  MIGRATION_SHEET_META,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_TEMP_GUARDS,
  MIGRATION_SITES_COLUMNS,
  MIGRATION_SITE_RATE_RANKS,
  MIGRATION_TEMPLATE_ALL_SHEETS,
  MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
  MIGRATION_TEMPLATE_SHEETS,
  MIGRATION_TEMPLATE_WORKFORCE_SHEETS,
  MIGRATION_WORKBOOK_SHEET_ORDER,
  MIGRATION_WORKFORCE_SHEET_NAMES,
  migrationSiteRateMatrixColumns,
  templateColumnsForMigrationWorkforceSheet,
} from './bulk-data-workbook';
import {
  MIGRATION_EXCEL_DATA_START_ROW,
  MIGRATION_EXCEL_HEADER_ROW_COUNT,
  MIGRATION_LOOKUP_SM_EPFS_RANGE,
  MIGRATION_LOOKUP_SITE_CODES_RANGE,
  MIGRATION_SHEET_TITLE_SUFFIX,
} from './migration-workbook-exceljs';
import {
  applyMigrationEmployeeDefaults,
  bulkImportValidationWarnings,
  buildMigrationExportSheetInputs,
  buildRateMatrixFromMigrationSiteRow,
  collectMigrationSiteImportRows,
  collectSmLinksFromParsedWorkbook,
  collectSmLinksFromRosterRows,
  collectSmEpfsFromMigrationSmSheet,
  deriveSitesFromRosterRows,
  usesMigrationSitesSheet,
  detectMigrationColumnHeaderRow0,
  employeeBalanceDebtPatch,
  employeeBalanceDebtPatchForUpsert,
  employeeDbPayloadForUpsert,
  employeeDbPayloadFromUnified,
  ensureRanksFromRosterRows,
  mapEmployeeImportRow,
  mapSiteSheetRow,
  mapUnifiedEmployeeExportRow,
  joinMigrationRowToSiteByCode,
  joinMigrationWorkforceRowsToSites,
  buildMigrationSiteCodeIndex,
  buildMigrationSiteExportContext,
  classifyMigrationExportWorkforceSheet,
  splitEmployeesForMigrationExport,
  mapMigrationWorkforceExportRow,
  mapUnifiedRosterRow,
  normalizeBulkImportStoredGroup,
  normalizeBulkImportStoredRank,
  normalizeMigrationWorkforceRow,
  parseBulkDataWorkbook,
  shouldSkipBulkMigrationImportRow,
  isBulkMigrationExcludedExecutiveRank,
  isMultiSheetMigrationWorkbook,
  rosterRowHasDebtLedgerSeeds,
  toLegacyImportShape,
  isMigrationWorkforceSheetName,
  validateBulkImport,
} from './bulk-data-import';
import { persistedOffboardingBalanceLines } from './offboarding-balance-sync';

async function loadExcelJsWorkbook(base64: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(base64, 'base64'));
  return workbook;
}

function columnIndex1(columns: readonly string[], key: string): number {
  const index = columns.indexOf(key);
  return index >= 0 ? index + 1 : -1;
}

function workbookBuffer(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('bulk import sector manager stored shape', () => {
  it('maps legacy SECTOR_MANAGER workbook group to HEAD_OFFICE + SM on persist', () => {
    expect(normalizeBulkImportStoredGroup('SECTOR_MANAGER', 'VO')).toBe('HEAD_OFFICE');
    expect(normalizeBulkImportStoredRank('SECTOR_MANAGER', 'VO')).toBe('SM');

    const mapped = mapUnifiedRosterRow({
      emp_number: '446',
      epf_no: '446',
      full_name: 'ROY',
      group: 'SECTOR_MANAGER',
      rank: 'VO',
      status: 'ACTIVE',
      _migrationSheet: MIGRATION_SHEET_SM,
    });
    const db = employeeDbPayloadFromUnified(mapped.employee, 'company-cvs');
    expect(db.group).toBe('HEAD_OFFICE');
    expect(db.rank).toBe('SM');
  });

  it('keeps HEAD_OFFICE non-SM rows unchanged', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'HO-1',
      full_name: 'HQ STAFF',
      group: 'HEAD_OFFICE',
      rank: 'GAD',
      status: 'ACTIVE',
    });
    const db = employeeDbPayloadFromUnified(mapped.employee, 'company-cvs');
    expect(db.group).toBe('HEAD_OFFICE');
    expect(db.rank).toBe('GAD');
  });
});

describe('migration multi-sheet column spec (step 3)', () => {
  it('defines nine workbook tabs in order with Sites as sheet 5', () => {
    expect(MIGRATION_WORKBOOK_SHEET_ORDER).toEqual([
      'HEAD_OFFICE',
      'CAFE',
      'GUARD',
      'SM',
      'Sites',
      'Resigned',
      'Inactive',
      'Temp_Guards',
      'Lookups',
    ]);
    expect(MIGRATION_WORKBOOK_SHEET_ORDER[4]).toBe('Sites');
  });

  it('guard sheet includes placement columns; SM sheet does not', () => {
    const guardCols = columnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD);
    expect(guardCols).toContain('site_code');
    expect(guardCols).toContain('assigned_sm_epf');
    expect(columnsForMigrationWorkforceSheet('SM')).not.toContain('site_code');
  });

  it('resigned sheet includes resignation columns', () => {
    const cols = columnsForMigrationWorkforceSheet(MIGRATION_SHEET_RESIGNED);
    expect(cols).toContain('date_resigned');
    expect(cols).toContain('resignation_type');
    expect(MIGRATION_SHEET_META.Resigned.defaultStatus).toBe('Resigned');
  });

  it('sites sheet has rate matrix columns for CSO through LSO', () => {
    expect(MIGRATION_SITE_RATE_RANKS).toEqual(['CSO', 'OIC', 'SSO', 'JSO', 'LSO']);
    for (const rank of MIGRATION_SITE_RATE_RANKS) {
      expect(MIGRATION_SITES_COLUMNS).toContain(`${rank}_qty`);
      expect(MIGRATION_SITES_COLUMNS).toContain(`${rank}_invoice_rate_lkr`);
      expect(MIGRATION_SITES_COLUMNS).toContain(`${rank}_pay_rate_lkr`);
    }
    expect(migrationSiteRateMatrixColumns()).toHaveLength(15);
  });

  it('workforce sheet columns have no duplicates per tab', () => {
    for (const sheet of MIGRATION_WORKFORCE_SHEET_NAMES) {
      const cols = columnsForMigrationWorkforceSheet(sheet);
      expect(new Set(cols).size).toBe(cols.length);
    }
  });

  it('isMigrationWorkforceSheetName recognises workforce tabs only', () => {
    expect(isMigrationWorkforceSheetName('GUARD')).toBe(true);
    expect(isMigrationWorkforceSheetName('Sites')).toBe(false);
    expect(isMigrationWorkforceSheetName('Roster')).toBe(false);
  });
});

describe('migration workbook exceljs write path (step 4–5)', () => {
  it('styled export uses 3 header rows before data on GUARD export sheet', async () => {
    const { base64 } = await buildBulkDataWorkbook({
      mode: 'export',
      employees: [{ emp_number: 'G-1', full_name: 'TEST', group: 'GUARD', rank: 'JSO', status: 'ACTIVE' }],
      sites: [],
    });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const ws = wb.Sheets.GUARD;
    expect(ws).toBeTruthy();
    expect(detectMigrationColumnHeaderRow0(ws!)).toBe(MIGRATION_EXCEL_HEADER_ROW_COUNT - 1);
    expect(String(ws!.A1?.v ?? '')).toContain(MIGRATION_SHEET_TITLE_SUFFIX);
    expect(String(ws!.A3?.v ?? '')).toBe('employee_id');
  });
});

describe('migration template workforce sheets (step 6)', () => {
  it('template emits all eight structured tabs through Temp_Guards', async () => {
    const { base64, filename } = await buildBulkDataWorkbook({
      mode: 'template',
      employees: [],
      sites: [],
    });
    expect(filename).toMatch(/^pearzen-migration-template-/);
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    expect(Object.keys(wb.Sheets)).toEqual([...MIGRATION_TEMPLATE_ALL_SHEETS]);
  });

  it('each template sheet has corporate_group pre-filled from sheet meta', () => {
    const sheets = buildMigrationTemplateWorkforceSheetInputs();
    expect(sheets).toHaveLength(4);
    for (const sheet of sheets) {
      expect(sheet.columns).toContain('corporate_group');
      expect(sheet.rows[0]?.corporate_group).toBe(
        MIGRATION_SHEET_META[sheet.sheetName as keyof typeof MIGRATION_SHEET_META].fixedGroup,
      );
    }
  });

  it('GUARD example includes site_code and assigned_sm_epf', () => {
    const guardSheet = buildMigrationTemplateWorkforceSheetInputs().find(
      (sheet) => sheet.sheetName === MIGRATION_SHEET_GUARD,
    );
    expect(guardSheet?.rows).toHaveLength(1);
    expect(guardSheet?.rows[0]?.site_code).toBe('LKH001');
    expect(guardSheet?.rows[0]?.assigned_sm_epf).toBe('13650');
    expect(EXAMPLE_MIGRATION_GUARD_ROW.site_code).toBe('LKH001');
  });

  it('SM sheet has two example rows for dropdown source', () => {
    const smSheet = buildMigrationTemplateWorkforceSheetInputs().find(
      (sheet) => sheet.sheetName === MIGRATION_SHEET_SM,
    );
    expect(smSheet?.rows).toHaveLength(2);
    expect(EXAMPLE_MIGRATION_SM_ROWS).toHaveLength(2);
    expect(smSheet?.rows.map((row) => row.epf_no)).toEqual(['13650', '13496']);
  });

  it('styled GUARD tab uses row 3 column keys including site_code', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const ws = wb.Sheets[MIGRATION_SHEET_GUARD];
    expect(detectMigrationColumnHeaderRow0(ws!)).toBe(MIGRATION_EXCEL_HEADER_ROW_COUNT - 1);
    const headerValues = Object.keys(ws!)
      .filter((key) => /^[A-Z]+3$/.test(key))
      .map((key) => String(ws![key]?.v ?? ''));
    expect(headerValues).toContain('site_code');
    expect(headerValues).toContain('assigned_sm_epf');
  });
});

describe('migration template Sites sheet (step 7)', () => {
  it('Sites tab includes client sites plus bench pool codes', () => {
    const sitesSheet = buildMigrationTemplateSitesSheetInput();
    expect(sitesSheet.sheetName).toBe(MIGRATION_SHEET_SITES);
    expect(sitesSheet.columns).toEqual([...MIGRATION_SITES_COLUMNS]);
    expect(sitesSheet.rows).toHaveLength(5);
    expect(sitesSheet.rows[0]?.site_code).toBe('LKH001');
    expect(sitesSheet.rows[2]?.site_code).toBe('r01');
    expect(sitesSheet.rows[3]?.site_code).toBe('t');
    expect(sitesSheet.rows[4]?.site_code).toBe('TEMPORY');
    expect(sitesSheet.rows[0]?.assigned_sm_epf).toBe('13650');
    expect(sitesSheet.rows[0]?.CSO_qty).toBe(2);
    expect(sitesSheet.rows[0]?.JSO_pay_rate_lkr).toBe(42000);
    expect(EXAMPLE_MIGRATION_GUARD_ROW.site_code).toBe('LKH001');
  });

  it('example site rows define every Sites column', () => {
    for (const row of EXAMPLE_MIGRATION_SITE_ROWS) {
      for (const col of MIGRATION_SITES_COLUMNS) {
        expect(col in row).toBe(true);
      }
    }
  });

  it('styled Sites tab uses row 3 column keys including site_code', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    const ws = wb.Sheets[MIGRATION_SHEET_SITES];
    expect(detectMigrationColumnHeaderRow0(ws!)).toBe(MIGRATION_EXCEL_HEADER_ROW_COUNT - 1);
    const headerValues = Object.keys(ws!)
      .filter((key) => /^[A-Z]+3$/.test(key))
      .map((key) => String(ws![key]?.v ?? ''));
    expect(headerValues).toContain('site_code');
    expect(headerValues).toContain('CSO_invoice_rate_lkr');
  });

  it('buildRateMatrixFromMigrationSiteRow maps S6 columns to rate_matrix JSON', () => {
    const matrix = buildRateMatrixFromMigrationSiteRow(EXAMPLE_MIGRATION_SITE_ROWS[0]!);
    expect(matrix.CSO).toEqual({ qty: 2, invoiceRate: 85000, payRate: 65000 });
    expect(matrix.JSO).toEqual({ qty: 2, invoiceRate: 72000, payRate: 42000 });
    expect(matrix.OIC).toBeUndefined();
    for (const rank of MIGRATION_SITE_RATE_RANKS) {
      expect(`${rank}_qty` in EXAMPLE_MIGRATION_SITE_ROWS[0]!).toBe(true);
    }
  });

  it('mapSiteSheetRow maps Sites row to site_profiles payload', () => {
    const mapped = mapSiteSheetRow(EXAMPLE_MIGRATION_SITE_ROWS[1]!);
    expect(mapped.siteCode).toBe('BRK002');
    expect(mapped.siteName).toContain('NUGEGODA');
    expect(mapped.payload.site_type).toBe('BANK');
    expect(mapped.payload.assigned_sm_epf).toBe('13496');
    expect(mapped.payload.per_visit_charge_lkr).toBe(2500);
    expect(mapped.payload.rate_matrix.CSO?.qty).toBe(1);
    expect(mapped.payload.rate_matrix.JSO?.payRate).toBe(40000);
  });

  it('buildMigrationTemplateSheetInputs orders workforce, Sites, then offboarding tabs', () => {
    const sheets = buildMigrationTemplateSheetInputs();
    expect(sheets.map((sheet) => sheet.sheetName)).toEqual([...MIGRATION_TEMPLATE_SHEETS]);
  });
});

describe('migration template Lookups and dropdowns (step 9)', () => {
  it('template workbook includes a hidden Lookups sheet', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    expect(Object.keys(wb.Sheets)).toEqual([...MIGRATION_TEMPLATE_ALL_SHEETS]);
    expect(wb.Sheets[MIGRATION_SHEET_LOOKUPS]).toBeTruthy();
  });

  it('Lookups sheet row 1 labels site_code and sm_epf_no columns', async () => {
    const workbook = await loadExcelJsWorkbook(
      (
        await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] })
      ).base64,
    );
    const lookups = workbook.getWorksheet(MIGRATION_SHEET_LOOKUPS);
    expect(lookups?.state).toBe('veryHidden');
    expect(String(lookups?.getCell(1, 1).value ?? '')).toBe('site_code');
    expect(String(lookups?.getCell(1, 2).value ?? '')).toBe('sm_epf_no');
  });

  it('Lookups column A uses INDEX/COUNTA formulae referencing Sites site_code', async () => {
    const workbook = await loadExcelJsWorkbook(
      (
        await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] })
      ).base64,
    );
    const lookups = workbook.getWorksheet(MIGRATION_SHEET_LOOKUPS);
    const formula = (lookups?.getCell(2, 1).value as { formula?: string })?.formula ?? '';
    expect(formula).toContain('COUNTA');
    expect(formula).toContain(`${MIGRATION_SHEET_SITES}!`);
    expect(formula).toContain('INDEX');
  });

  it('GUARD site_code and assigned_sm_epf cells use Lookups dropdown lists', async () => {
    const guardColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD);
    const siteCodeCol = columnIndex1(guardColumns, 'site_code');
    const smEpfCol = columnIndex1(guardColumns, 'assigned_sm_epf');
    const workbook = await loadExcelJsWorkbook(
      (
        await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] })
      ).base64,
    );
    const guard = workbook.getWorksheet(MIGRATION_SHEET_GUARD);
    const siteValidation = guard?.getCell(MIGRATION_EXCEL_DATA_START_ROW, siteCodeCol).dataValidation;
    const smValidation = guard?.getCell(MIGRATION_EXCEL_DATA_START_ROW, smEpfCol).dataValidation;
    expect(siteValidation?.type).toBe('list');
    expect(smValidation?.type).toBe('list');
    expect(siteValidation?.formulae?.[0]).toBe(MIGRATION_LOOKUP_SITE_CODES_RANGE);
    expect(smValidation?.formulae?.[0]).toBe(MIGRATION_LOOKUP_SM_EPFS_RANGE);
  });

  it('Temp_Guards site_code column uses the same Sites lookup list', async () => {
    const tempColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_TEMP_GUARDS);
    const siteCodeCol = columnIndex1(tempColumns, 'site_code');
    const workbook = await loadExcelJsWorkbook(
      (
        await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] })
      ).base64,
    );
    const tempSheet = workbook.getWorksheet(MIGRATION_SHEET_TEMP_GUARDS);
    const validation = tempSheet?.getCell(MIGRATION_EXCEL_DATA_START_ROW, siteCodeCol).dataValidation;
    expect(validation?.formulae?.[0]).toBe(MIGRATION_LOOKUP_SITE_CODES_RANGE);
  });

  it('export mode writes multi-sheet workbook with Lookups and GUARD dropdowns', async () => {
    const employees = [
      {
        group: 'SECTOR_MANAGER',
        epf_no: '13650',
        emp_number: 'SM-A',
        full_name: 'SM One',
        status: 'ACTIVE',
      },
      {
        group: 'GUARD',
        epf_no: '12345',
        emp_number: 'G-1',
        full_name: 'Guard One',
        status: 'ACTIVE',
        site_code: 'LKH001',
        assigned_sm_epf: '13650',
      },
      {
        group: 'GUARD',
        epf_no: '12888',
        emp_number: 'G-099',
        full_name: 'Former Guard',
        status: 'Resigned',
        date_resigned: '2025-11-30',
      },
    ];
    const sites = [
      {
        site_code: 'LKH001',
        site_name: 'Lake Hotel',
        site_type: 'HOTEL',
        site_status: 'ACTIVE',
        rate_matrix: { JSO: { qty: 1, invoiceRate: 72000, payRate: 42000 } },
      },
    ];
    const lookups = buildMigrationExportLookupsSource(employees, sites);
    expect(lookups.siteCodes).toContain('LKH001');
    expect(lookups.siteCodes).toContain('t');
    expect(lookups.smEpfs).toEqual(['13650']);

    const split = splitEmployeesForMigrationExport(employees, sites);
    expect(split.GUARD).toHaveLength(1);
    expect(split.SM).toHaveLength(1);
    expect(split.Resigned).toHaveLength(1);

    const { base64 } = await buildBulkDataWorkbook({ mode: 'export', employees, sites });
    const workbook = await loadExcelJsWorkbook(base64);
    expect(workbook.getWorksheet(MIGRATION_SHEET_LOOKUPS)).toBeTruthy();
    expect(String(workbook.getWorksheet(MIGRATION_SHEET_LOOKUPS)?.getCell(2, 2).value ?? '')).toBe(
      '13650',
    );
    expect(workbook.getWorksheet(MIGRATION_SHEET_GUARD)).toBeTruthy();
    expect(workbook.getWorksheet('Roster')).toBeFalsy();

    const guardColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD);
    const smCol = columnIndex1(guardColumns, 'assigned_sm_epf');
    const guard = workbook.getWorksheet(MIGRATION_SHEET_GUARD);
    const validation = guard?.getCell(MIGRATION_EXCEL_DATA_START_ROW, smCol).dataValidation;
    expect(validation?.formulae?.[0]).toBe(MIGRATION_LOOKUP_SM_EPFS_RANGE);

    const sitesSheet = workbook.getWorksheet(MIGRATION_SHEET_SITES);
    expect(sitesSheet).toBeTruthy();
    expect(String(sitesSheet?.getCell(MIGRATION_EXCEL_DATA_START_ROW, 1).value ?? '')).toBe('LKH001');
  });
});

describe('migration template offboarding sheets (step 8)', () => {
  it('Resigned example includes date_resigned and outstanding debt columns', () => {
    const resignedSheet = buildMigrationTemplateWorkforceSheetInputs(
      MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
    ).find((sheet) => sheet.sheetName === MIGRATION_SHEET_RESIGNED);
    expect(resignedSheet?.rows).toHaveLength(1);
    expect(resignedSheet?.rows[0]?.date_resigned).toBe('2025-11-30');
    expect(resignedSheet?.rows[0]?.resignation_type).toBe('VOLUNTARY');
    expect(resignedSheet?.rows[0]?.salary_advance_outstanding_lkr).toBe(15000);
    expect(resignedSheet?.rows[0]?.salary_loan_outstanding_lkr).toBe(25000);
    expect(resignedSheet?.columns).toContain('date_resigned');
  });

  it('Inactive example is a reserve-bench guard on site_code r01', () => {
    const inactiveSheet = buildMigrationTemplateWorkforceSheetInputs(
      MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
    ).find((sheet) => sheet.sheetName === MIGRATION_SHEET_INACTIVE);
    expect(inactiveSheet?.rows[0]?.site_code).toBe('r01');
    expect(inactiveSheet?.rows[0]?.assigned_sm_epf).toBe('');
    expect(EXAMPLE_MIGRATION_INACTIVE_ROW.site_code).toBe('r01');
  });

  it('Temp_Guards example uses pool site_code t with temp_parent_epf', () => {
    const tempSheet = buildMigrationTemplateWorkforceSheetInputs(
      MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
    ).find((sheet) => sheet.sheetName === MIGRATION_SHEET_TEMP_GUARDS);
    expect(tempSheet?.rows[0]?.site_code).toBe('t');
    expect(tempSheet?.rows[0]?.temp_parent_epf).toBe('12345');
    expect(tempSheet?.columns).toContain('temp_parent_epf');
    expect(EXAMPLE_MIGRATION_GUARD_ROW.epf_no).toBe('12345');
  });

  it('offboarding sheets pre-fill status from sheet meta', () => {
    for (const sheetName of MIGRATION_TEMPLATE_OFFBOARDING_SHEETS) {
      const sheet = buildMigrationTemplateWorkforceSheetInputs(
        MIGRATION_TEMPLATE_OFFBOARDING_SHEETS,
      ).find((input) => input.sheetName === sheetName);
      expect(sheet?.rows[0]?.status).toBe(MIGRATION_SHEET_META[sheetName].defaultStatus);
      expect(sheet?.rows[0]?.corporate_group).toBe(MIGRATION_SHEET_META[sheetName].fixedGroup);
    }
  });

  it('offboarding example rows define every column on their tab', () => {
    for (const sheetName of MIGRATION_TEMPLATE_OFFBOARDING_SHEETS) {
      const columns = templateColumnsForMigrationWorkforceSheet(sheetName);
      const example = exampleRowsForMigrationWorkforceSheet(sheetName)[0]!;
      for (const col of columns) {
        expect(col in example).toBe(true);
      }
    }
  });
});

describe('bulk-data-workbook unified spec', () => {
  it('uses sheet name Roster', () => {
    expect(UNIFIED_ROSTER_SHEET_NAME).toBe('Roster');
  });

  it('composes sections into one ordered column list without duplicates', () => {
    const sections = [
      ...UNIFIED_ROSTER_IDENTITY_COLUMNS,
      ...UNIFIED_ROSTER_EMPLOYMENT_COLUMNS,
      ...UNIFIED_ROSTER_BANK_COLUMNS,
      ...UNIFIED_ROSTER_VETTING_COLUMNS,
      ...UNIFIED_ROSTER_SITE_COLUMNS,
      ...UNIFIED_ROSTER_DEBT_COLUMNS,
    ];
    expect(sections).toEqual([...UNIFIED_ROSTER_COLUMNS]);
    expect(new Set(UNIFIED_ROSTER_COLUMNS).size).toBe(UNIFIED_ROSTER_COLUMNS.length);
  });

  it('example rows define every unified column', () => {
    for (const row of EXAMPLE_UNIFIED_ROSTER_ROWS) {
      for (const col of UNIFIED_ROSTER_COLUMNS) {
        expect(col in row).toBe(true);
      }
    }
  });

  it('template workforce sheet inputs cover all columns per tab', () => {
    for (const sheetName of MIGRATION_TEMPLATE_WORKFORCE_SHEETS) {
      const columns = templateColumnsForMigrationWorkforceSheet(sheetName);
      expect(new Set(columns).size).toBe(columns.length);
      expect(columns).toContain('corporate_group');
    }
  });

  it('export preserves debt columns on migration GUARD sheet', async () => {
    const { base64 } = await buildBulkDataWorkbook({
      mode: 'export',
      employees: [
        {
          emp_number: 'G-002',
          full_name: 'FERNANDO R.',
          site_name: 'Test Site Alpha',
          site_code: 'TST001',
          rank: 'JSO',
          group: 'GUARD',
          status: 'ACTIVE',
          uniform_outstanding_lkr: 1200,
          salary_advance_outstanding_lkr: 8000,
        },
      ],
      sites: [
        {
          site_code: 'TST001',
          site_name: 'Test Site Alpha',
          site_type: 'BANK',
          address: 'COLOMBO 01',
        },
      ],
    });

    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.rows[0]?.uniform_outstanding_lkr).toBe(1200);
    expect(parsed.rows[0]?.salary_advance_outstanding_lkr).toBe(8000);
    expect(parsed.rows[0]?.site_name).toBe('Test Site Alpha');
    expect(parsed.siteRows?.[0]?.site_type).toBe('BANK');
  });

  it('mergeExportRowsToUnifiedRoster maps legacy site field to site_name', () => {
    const [row] = mergeExportRowsToUnifiedRoster(
      [{ emp_number: 'X', full_name: 'TEST', site: 'Site A' }],
      [],
    );
    expect(row.site_name).toBe('Site A');
  });
});

describe('parseBulkDataWorkbook', () => {
  it('reads Roster sheet rows', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({ [UNIFIED_ROSTER_SHEET_NAME]: [EXAMPLE_UNIFIED_GUARD_ROW] }),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.site_name).toBe('Lanka Hospitals — Main Gate');
  });

  it('merges legacy Employees + Sites sheets into unified rows', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({
        [LEGACY_EMPLOYEES_SHEET_NAME]: [
          {
            emp_number: 'G-100',
            full_name: 'MERGED GUARD',
            site: 'Legacy Client Site',
            rank: 'JSO',
            group: 'GUARD',
            epf_no: '55555',
          },
        ],
        [LEGACY_SITES_SHEET_NAME]: [
          {
            site_name: 'Legacy Client Site',
            site_type: 'BANK',
            address: 'COLOMBO 02',
            assigned_sm_epf: 'SM-77',
            latitude: 6.92,
          },
        ],
      }),
    );
    expect(parsed.legacyFormat).toBe(true);
    expect(parsed.rows[0]?.site_type).toBe('BANK');
    expect(parsed.rows[0]?.assigned_sm_epf).toBe('SM-77');
    expect(bulkImportValidationWarnings(parsed)).toHaveLength(1);
  });

  it('migration GUARD example row validates when mapped to group (parser step 10)', () => {
    const guardRow = buildMigrationTemplateWorkforceSheetInputs().find(
      (sheet) => sheet.sheetName === MIGRATION_SHEET_GUARD,
    )!.rows[0]!;
    const meta = {
      sheetName: MIGRATION_SHEET_GUARD,
      group: MIGRATION_SHEET_META[MIGRATION_SHEET_GUARD].fixedGroup,
      defaultStatus: MIGRATION_SHEET_META[MIGRATION_SHEET_GUARD].defaultStatus,
    };
    const normalized = normalizeMigrationWorkforceRow(guardRow, meta);
    expect(normalized.group).toBe('GUARD');
    expect(
      validateBulkImport(
        { rows: [normalized], multiSheetFormat: true, siteRows: EXAMPLE_MIGRATION_SITE_ROWS },
        DEFAULT_RANK_PAY_MATRIX,
      ),
    ).toEqual([]);
  });
});

describe('parseBulkDataWorkbook multi-sheet migration (step 10)', () => {
  function rowsBySheet(parsed: ReturnType<typeof parseBulkDataWorkbook>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const meta of parsed.sheetMeta ?? []) {
      counts[meta.sheetName] = (counts[meta.sheetName] ?? 0) + 1;
    }
    return counts;
  }

  it('parses blank migration template into workforce rows, siteRows, and sheetMeta', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));

    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.legacyFormat).toBeUndefined();
    expect(parsed.rows).toHaveLength(8);
    expect(parsed.sheetMeta).toHaveLength(8);
    expect(parsed.siteRows).toHaveLength(5);

    expect(rowsBySheet(parsed)).toEqual({
      HEAD_OFFICE: 1,
      CAFE: 1,
      GUARD: 1,
      SM: 2,
      Resigned: 1,
      Inactive: 1,
      Temp_Guards: 1,
    });

    expect(parsed.siteRows?.[0]?.site_code).toBe('LKH001');
    expect(parsed.rows.find((row) => row.emp_number === 'G-001')?.group).toBe('GUARD');
    expect(parsed.rows.find((row) => row.emp_number === 'G-050')?.status).toBe('Inactive');
    expect(parsed.rows.find((row) => row.emp_number === 'G-T01')?.site_code).toBe('t');
  });

  it('aligns sheetMeta entries with each parsed workforce row', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));

    parsed.rows.forEach((row, index) => {
      const meta = parsed.sheetMeta?.[index];
      expect(meta).toBeTruthy();
      expect(row._migrationSheet).toBe(meta?.sheetName);
      const expectedGroup =
        meta?.sheetName === MIGRATION_SHEET_SM
          ? 'HEAD_OFFICE'
          : normalizeBulkImportStoredGroup(meta?.group, row.rank) ?? meta?.group;
      expect(row.group).toBe(expectedGroup);
    });
  });

  it('ignores the hidden Lookups sheet on import', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    expect(isMultiSheetMigrationWorkbook(wb)).toBe(true);
    expect(wb.SheetNames).toContain(MIGRATION_SHEET_LOOKUPS);

    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    expect(parsed.rows.every((row) => row.emp_number !== 'site_code')).toBe(true);
    expect(parsed.siteRows?.every((row) => cellStr(row.site_name) !== 'sm_epf_no')).toBe(true);
  });

  it('still parses single Roster sheet workbooks', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({ [UNIFIED_ROSTER_SHEET_NAME]: [EXAMPLE_UNIFIED_GUARD_ROW] }),
    );
    expect(parsed.multiSheetFormat).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.siteRows).toBeUndefined();
  });

  it('still merges legacy Employees + Sites sheets', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({
        [LEGACY_EMPLOYEES_SHEET_NAME]: [
          {
            emp_number: 'G-100',
            full_name: 'MERGED GUARD',
            site: 'Legacy Client Site',
            rank: 'JSO',
            group: 'GUARD',
            epf_no: '55555',
          },
        ],
        [LEGACY_SITES_SHEET_NAME]: [
          {
            site_name: 'Legacy Client Site',
            site_type: 'BANK',
            address: 'COLOMBO 02',
            assigned_sm_epf: 'SM-77',
            latitude: 6.92,
          },
        ],
      }),
    );
    expect(parsed.legacyFormat).toBe(true);
    expect(parsed.multiSheetFormat).toBeUndefined();
    expect(parsed.rows[0]?.site_type).toBe('BANK');
  });

  it('validates parsed guard and resigned rows from migration template', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const guardRows = parsed.rows.filter(
      (_, index) => parsed.sheetMeta?.[index]?.sheetName === MIGRATION_SHEET_GUARD,
    );
    const resignedRows = parsed.rows.filter(
      (_, index) => parsed.sheetMeta?.[index]?.sheetName === MIGRATION_SHEET_RESIGNED,
    );
    expect(validateBulkImport(parsed, DEFAULT_RANK_PAY_MATRIX).filter((e) => e.includes('site_code'))).toEqual(
      [],
    );
    expect(
      validateBulkImport({ rows: guardRows, multiSheetFormat: true, siteRows: parsed.siteRows }, DEFAULT_RANK_PAY_MATRIX),
    ).toEqual([]);
    expect(
      validateBulkImport({ rows: resignedRows, multiSheetFormat: true, siteRows: parsed.siteRows }, DEFAULT_RANK_PAY_MATRIX),
    ).toEqual([]);
    expect(bulkImportValidationWarnings(parsed)).toEqual([]);
  });
});

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

describe('migration site_code join (step 11)', () => {
  const siteRows = [
    {
      site_code: 'LKH001',
      site_name: 'LAKE VIEW HOTEL — MAIN ENTRANCE',
      site_type: 'HOTEL',
      address: 'NO 45, GALLE ROAD, MOUNT LAVINIA',
      latitude: 6.8406,
      longitude: 79.8719,
      assigned_sm_epf: '13650',
    },
    {
      site_code: 'r01',
      site_name: 'RESERVE GUARD BENCH',
      site_type: 'OTHER',
      address: 'INTERNAL POOL',
    },
    {
      site_code: 't',
      site_name: 'TEMPORARY GUARD POOL',
      site_type: 'OTHER',
      address: 'INTERNAL POOL',
    },
  ];

  it('joinMigrationRowToSiteByCode resolves site_name and GPS from Sites tab', () => {
    const index = buildMigrationSiteCodeIndex(siteRows);
    const joined = joinMigrationRowToSiteByCode(
      { ...EXAMPLE_MIGRATION_GUARD_ROW, site_name: '', site: '' },
      index,
    );
    expect(joined.site_code).toBe('LKH001');
    expect(joined.site_name).toBe('LAKE VIEW HOTEL — MAIN ENTRANCE');
    expect(joined.site).toBe('LAKE VIEW HOTEL — MAIN ENTRANCE');
    expect(joined.site_type).toBe('HOTEL');
    expect(joined.site_latitude).toBe(6.8406);
    expect(joined.assigned_sm_epf).toBe('13650');
  });

  it('mapUnifiedRosterRow uses site_name for employees.site after join', () => {
    const index = buildMigrationSiteCodeIndex(siteRows);
    const joined = joinMigrationRowToSiteByCode(EXAMPLE_MIGRATION_GUARD_ROW, index);
    const mapped = mapUnifiedRosterRow(joined);
    expect(mapped.employee.payload.site).toBe('LAKE VIEW HOTEL — MAIN ENTRANCE');
    expect(mapped.employee.payload.site).not.toBe('LKH001');
  });

  it('parsed migration template joins guard and bench rows to Sites tab', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const guard = parsed.rows.find((row) => row.emp_number === 'G-001');
    const inactive = parsed.rows.find((row) => row.emp_number === 'G-050');
    const temp = parsed.rows.find((row) => row.emp_number === 'G-T01');

    expect(guard?.site_name).toContain('LAKE VIEW HOTEL');
    expect(guard?.site).toBe(guard?.site_name);
    expect(inactive?.site_name).toBe('RESERVE GUARD BENCH');
    expect(temp?.site_name).toBe('TEMPORARY GUARD POOL');
  });

  it('validateBulkImport rejects site_code missing from Sites sheet', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows,
        rows: [
          {
            emp_number: 'G-404',
            full_name: 'UNKNOWN SITE GUARD',
            group: 'GUARD',
            rank: 'JSO',
            site_code: 'NOPE999',
          },
        ],
        sheetMeta: [
          {
            sheetName: MIGRATION_SHEET_GUARD,
            group: 'GUARD',
            defaultStatus: 'ACTIVE',
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((error) => error.includes('NOPE999'))).toBe(true);
    expect(errors.some((error) => error.includes('Sites sheet'))).toBe(true);
  });

  it('validateBulkImport allows bench codes r01 and t when defined on Sites sheet', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows,
        rows: [
          {
            ...EXAMPLE_MIGRATION_INACTIVE_ROW,
            group: 'GUARD',
          },
          {
            ...EXAMPLE_MIGRATION_TEMP_GUARD_ROW,
            group: 'GUARD',
          },
        ],
        sheetMeta: [
          {
            sheetName: MIGRATION_SHEET_INACTIVE,
            group: 'GUARD',
            defaultStatus: 'Inactive',
          },
          {
            sheetName: MIGRATION_SHEET_TEMP_GUARDS,
            group: 'GUARD',
            defaultStatus: 'ACTIVE',
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.filter((error) => error.includes('site_code'))).toEqual([]);
  });
});

describe('validateBulkImport', () => {
  it('accepts a valid example guard row', () => {
    expect(validateBulkImport({ rows: [EXAMPLE_UNIFIED_GUARD_ROW] }, DEFAULT_RANK_PAY_MATRIX)).toEqual(
      [],
    );
  });

  it('rejects MD, OD, and FM singleton portal ranks', () => {
    for (const rank of ['MD', 'OD', 'FM'] as const) {
      const errors = validateBulkImport(
        {
          rows: [
            {
              emp_number: 'HO-1',
              full_name: 'TEST',
              group: 'HEAD_OFFICE',
              rank,
            },
          ],
        },
        DEFAULT_RANK_PAY_MATRIX,
      );
      expect(errors.some((e) => e.includes('singleton portal roles'))).toBe(true);
      expect(errors.some((e) => e.includes(rank))).toBe(true);
    }
  });

  it('requires rank_title and rank_basic_pay for unknown ranks', () => {
    const errors = validateBulkImport(
      {
        rows: [
          { emp_number: 'G-1', full_name: 'TEST', group: 'GUARD', rank: 'BRAND_NEW_RANK' },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((e) => e.includes('rank_title'))).toBe(true);
    expect(errors.some((e) => e.includes('rank_basic_pay'))).toBe(true);
  });

  it('rejects negative debt amounts', () => {
    const errors = validateBulkImport(
      {
        rows: [
          {
            emp_number: 'G-1',
            full_name: 'TEST',
            group: 'GUARD',
            rank: 'JSO',
            uniform_outstanding_lkr: -100,
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((e) => e.includes('uniform_outstanding_lkr'))).toBe(true);
  });
});

describe('validateBulkImport multi-sheet rules (step 13)', () => {
  const siteRows = EXAMPLE_MIGRATION_SITE_ROWS;

  it('requires nic and phone for new employees on multi-sheet uploads', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows,
        rows: [
          {
            emp_number: 'G-NEW',
            full_name: 'NEW GUARD',
            group: 'GUARD',
            rank: 'JSO',
            site_code: 'LKH001',
            assigned_sm_epf: '13650',
          },
        ],
        sheetMeta: [
          {
            sheetName: MIGRATION_SHEET_GUARD,
            group: 'GUARD',
            defaultStatus: 'ACTIVE',
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((e) => e.includes('nic is required'))).toBe(true);
    expect(errors.some((e) => e.includes('phone is required'))).toBe(true);
  });

  it('requires date_resigned on Resigned sheet rows', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows,
        rows: [
          {
            emp_number: 'G-OUT',
            epf_no: '88888',
            full_name: 'LEAVING GUARD',
            nic: '199912345678',
            phone: '+94771234567',
            group: 'GUARD',
            rank: 'JSO',
            date_resigned: '',
          },
        ],
        sheetMeta: [
          {
            sheetName: MIGRATION_SHEET_RESIGNED,
            group: 'GUARD',
            defaultStatus: 'Resigned',
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((e) => e.includes('date_resigned is required'))).toBe(true);
  });

  it('validates Sites tab uniqueness and non-negative rate columns', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        rows: [],
        sheetMeta: [],
        siteRows: [
          { site_code: 'DUP', site_name: 'Site Alpha', site_type: 'BANK', CSO_qty: -1 },
          { site_code: 'DUP', site_name: 'Site Beta', site_type: 'BANK' },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((e) => e.includes('duplicate site_code "DUP"'))).toBe(true);
    expect(errors.some((e) => e.includes('CSO_qty must be ≥ 0'))).toBe(true);
  });

  it('validates full migration template for site, SM, and guard placement rules', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const siteErrors = validateBulkImport(parsed, DEFAULT_RANK_PAY_MATRIX).filter(
      (error) =>
        error.includes('site_code') ||
        error.includes('assigned_sm_epf') ||
        error.includes('Sites row'),
    );
    expect(siteErrors).toEqual([]);
  });
});

describe('migration Sites sheet apply (step 14)', () => {
  it('usesMigrationSitesSheet is true for multi-sheet parsed workbooks', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    expect(usesMigrationSitesSheet(parsed)).toBe(true);
    expect(usesMigrationSitesSheet({ rows: [EXAMPLE_UNIFIED_GUARD_ROW] })).toBe(false);
  });

  it('collectMigrationSiteImportRows maps Sites tab with rate_matrix and client fields', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const sites = collectMigrationSiteImportRows(parsed);

    expect(sites).toHaveLength(5);
    const lakeHotel = sites.find((site) => site.siteCode === 'LKH001');
    expect(lakeHotel?.siteName).toContain('LAKE VIEW HOTEL');
    expect(lakeHotel?.payload.client_name).toBe('LAKE VIEW HOTELS PLC');
    expect(lakeHotel?.payload.contract_start).toBe('2024-01-01');
    expect(lakeHotel?.payload.per_visit_charge_lkr).toBe(0);
    expect(lakeHotel?.payload.rate_matrix.CSO).toEqual({
      qty: 2,
      invoiceRate: 85000,
      payRate: 65000,
    });

    const bankSite = sites.find((site) => site.siteCode === 'BRK002');
    expect(bankSite?.payload.per_visit_charge_lkr).toBe(2500);
  });

  it('legacy Roster uploads still derive sites from employee inline columns', () => {
    const rows = [
      {
        emp_number: 'G-1',
        full_name: 'A',
        site_name: 'Shared Site',
        site_type: 'HOTEL',
        group: 'GUARD',
        rank: 'JSO',
      },
    ];
    expect(collectMigrationSiteImportRows({ rows, multiSheetFormat: false })).toEqual([]);
    expect(deriveSitesFromRosterRows(rows)).toHaveLength(1);
    expect(usesMigrationSitesSheet({ rows, multiSheetFormat: true })).toBe(false);
    expect(usesMigrationSitesSheet({ rows, multiSheetFormat: true, siteRows: [] })).toBe(true);
  });
});

describe('deriveSitesFromRosterRows', () => {
  it('merges site columns with first non-blank wins', () => {
    const sites = deriveSitesFromRosterRows([
      {
        emp_number: 'G-1',
        full_name: 'A',
        site_name: 'Shared Site',
        site_type: 'HOTEL',
        group: 'GUARD',
        rank: 'JSO',
      },
      {
        emp_number: 'G-2',
        full_name: 'B',
        site_name: 'Shared Site',
        assigned_sm_epf: 'SM-100',
        site_latitude: 6.91,
        group: 'GUARD',
        rank: 'JSO',
      },
    ]);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.payload.site_type).toBe('HOTEL');
    expect(sites[0]?.payload.assigned_sm_epf).toBe('SM-100');
    expect(sites[0]?.payload.latitude).toBe(6.91);
  });
});

describe('ensureRanksFromRosterRows', () => {
  it('appends one entry per unknown rank code', () => {
    const { createdRankCodes, matrix } = ensureRanksFromRosterRows(
      [
        {
          emp_number: 'G-1',
          full_name: 'GUARD A',
          group: 'GUARD',
          rank: 'NEW_RANK',
          rank_title: 'NEW RANK TITLE',
          rank_basic_pay: 41000,
        },
        {
          emp_number: 'G-2',
          full_name: 'GUARD B',
          group: 'GUARD',
          rank: 'NEW_RANK',
          rank_title: 'IGNORED',
          rank_basic_pay: 99999,
        },
      ],
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(createdRankCodes).toEqual(['NEW_RANK']);
    expect(matrix.find((entry) => entry.rankCode === 'NEW_RANK')?.basicPay).toBe(41000);
  });

  it('is idempotent on a second pass over the same rows', () => {
    const rows = [
      {
        emp_number: 'G-1',
        full_name: 'GUARD',
        group: 'GUARD',
        rank: 'NEW_RANK',
        rank_title: 'NEW RANK',
        rank_basic_pay: 40000,
      },
    ];
    const first = ensureRanksFromRosterRows(rows, DEFAULT_RANK_PAY_MATRIX);
    const second = ensureRanksFromRosterRows(rows, first.matrix);
    expect(second.createdRankCodes).toEqual([]);
    expect(second.matrix).toHaveLength(first.matrix.length);
  });
});

describe('mapUnifiedRosterRow and debt helpers', () => {
  it('maps allowances, site patch, debts, and SM link', () => {
    const mapped = mapUnifiedRosterRow(EXAMPLE_UNIFIED_GUARD_ROW);
    expect(mapped.employee.payload.site_allowance_lkr).toBe(5000);
    expect(mapped.sitePatch?.payload.site_type).toBe('HOTEL');
    expect(mapped.debts.uniform_outstanding_lkr).toBe(3500);
    expect(mapped.smLink).toEqual({ sm_epf: '13650', guard_epf: '12345' });
  });

  it('produces stable debt patches on repeated mapping (idempotent mapper)', () => {
    const row = { ...EXAMPLE_UNIFIED_GUARD_ROW, penalty_outstanding_lkr: 250 };
    const first = mapUnifiedRosterRow(row);
    const second = mapUnifiedRosterRow(row);
    expect(first.debts).toEqual(second.debts);
    expect(employeeBalanceDebtPatch(first.debts)).toEqual(employeeBalanceDebtPatch(second.debts));
    expect(rosterRowHasDebtLedgerSeeds(first.debts)).toBe(true);
  });

  it('mapEmployeeImportRow delegates to unified mapper', () => {
    expect(mapEmployeeImportRow(EXAMPLE_UNIFIED_GUARD_ROW)).toEqual(
      mapUnifiedRosterRow(EXAMPLE_UNIFIED_GUARD_ROW).employee,
    );
  });

  it('employeeDbPayloadFromUnified normalizes GUARD_FIELD and includes email', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'HO-1',
      full_name: 'STAFF',
      group: 'GUARD_FIELD',
      rank: 'JSO',
      email: 'staff@example.com',
      site_name: 'HQ',
    });
    const record = employeeDbPayloadFromUnified(mapped.employee, 'company-1');
    expect(record.group).toBe('GUARD');
    expect(record.email).toBe('staff@example.com');
    expect(record.site).toBe('HQ');
  });
});

describe('migration merge-on-update (step 1)', () => {
  const existingEmployee = {
    emp_number: 'G-500',
    full_name: 'EXISTING GUARD',
    nic: '199912345678',
    phone: '+94771234567',
    group: 'GUARD',
    rank: 'JSO',
    site: 'Client Site Alpha',
    base_salary: 45000,
    bank_code: '7056',
    bank_name: 'COMMERCIAL BANK',
    branch_code: '052',
    account_number: '8001112222',
    status: 'ACTIVE',
    epf_yn: true,
    site_allowance_lkr: 5000,
  };

  it('partial update includes only non-blank workbook cells', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'G-500',
      full_name: 'EXISTING GUARD RENAMED',
      group: 'GUARD',
      rank: 'JSO',
    });
    const patch = employeeDbPayloadForUpsert(mapped.employee, 'company-1', {
      mode: 'migration',
      rawRow: {
        emp_number: 'G-500',
        full_name: 'EXISTING GUARD RENAMED',
        group: 'GUARD',
        rank: 'JSO',
      },
      isUpdate: true,
    });

    expect(patch.full_name).toBe('EXISTING GUARD RENAMED');
    expect(patch.group).toBe('GUARD');
    expect(patch.rank).toBe('JSO');
    expect(patch).not.toHaveProperty('nic');
    expect(patch).not.toHaveProperty('phone');
    expect(patch).not.toHaveProperty('bank_code');
    expect(patch).not.toHaveProperty('site');
    expect(patch).not.toHaveProperty('base_salary');
    expect(patch).not.toHaveProperty('site_allowance_lkr');
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('company_id');
  });

  it('full_replace mode sends every mapped field including blanks-as-defaults', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'G-500',
      full_name: 'EXISTING GUARD',
      group: 'GUARD',
      rank: 'JSO',
    });
    const patch = employeeDbPayloadForUpsert(mapped.employee, 'company-1', {
      mode: 'full_replace',
      rawRow: { emp_number: 'G-500', full_name: 'EXISTING GUARD', group: 'GUARD', rank: 'JSO' },
      isUpdate: true,
    });

    expect(patch.company_id).toBe('company-1');
    expect(patch.status).toBe('ACTIVE');
    expect(patch.epf_yn).toBe(false);
    expect(patch.site_allowance_lkr).toBe(0);
    expect(patch.nic).toBeNull();
  });

  it('insert always uses full payload even in migration mode', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'G-NEW',
      full_name: 'NEW GUARD',
      group: 'GUARD',
      rank: 'JSO',
      nic: '199900011122',
      phone: '+94770000000',
    });
    const patch = employeeDbPayloadForUpsert(mapped.employee, 'company-1', {
      mode: 'migration',
      rawRow: {
        emp_number: 'G-NEW',
        full_name: 'NEW GUARD',
        group: 'GUARD',
        rank: 'JSO',
        nic: '199900011122',
        phone: '+94770000000',
      },
      isUpdate: false,
    });

    expect(patch.nic).toBe('199900011122');
    expect(patch.phone).toBe('+94770000000');
    expect(patch.company_id).toBe('company-1');
  });

  it('debt balance patch skips blank columns on migration update', () => {
    const debts = mapUnifiedRosterRow(EXAMPLE_UNIFIED_GUARD_ROW).debts;
    const patch = employeeBalanceDebtPatchForUpsert(
      { emp_number: 'G-500', full_name: 'TEST' },
      debts,
      { mode: 'migration', isUpdate: true },
    );
    expect(patch).toBeNull();
  });

  it('debt balance patch updates only provided debt columns', () => {
    const debts = mapUnifiedRosterRow({
      ...EXAMPLE_UNIFIED_GUARD_ROW,
      uniform_outstanding_lkr: 999,
      meals_advance_other_outstanding_lkr: '',
    }).debts;
    const patch = employeeBalanceDebtPatchForUpsert(
      { uniform_outstanding_lkr: 999, meals_advance_other_outstanding_lkr: '' },
      debts,
      { mode: 'migration', isUpdate: true },
    );
    expect(patch).toEqual({ uniform_balance: 999 });
  });

  it('simulated merge preserves untouched fields vs full replace', () => {
    const fullBefore = employeeDbPayloadFromUnified(
      mapUnifiedRosterRow({ ...existingEmployee, site_name: existingEmployee.site }).employee,
      'company-1',
    );

    const mergePatch = employeeDbPayloadForUpsert(
      mapUnifiedRosterRow({
        emp_number: 'G-500',
        full_name: 'EXISTING GUARD RENAMED',
        group: 'GUARD',
        rank: 'JSO',
      }).employee,
      'company-1',
      {
        mode: 'migration',
        rawRow: {
          emp_number: 'G-500',
          full_name: 'EXISTING GUARD RENAMED',
          group: 'GUARD',
          rank: 'JSO',
        },
        isUpdate: true,
      },
    );

    const afterMerge = { ...fullBefore, ...mergePatch };
    expect(afterMerge.full_name).toBe('EXISTING GUARD RENAMED');
    expect(afterMerge.nic).toBe('199912345678');
    expect(afterMerge.bank_code).toBe('7056');
    expect(afterMerge.base_salary).toBe(45000);
    expect(afterMerge.site_allowance_lkr).toBe(5000);

    const fullReplace = employeeDbPayloadForUpsert(
      mapUnifiedRosterRow({
        emp_number: 'G-500',
        full_name: 'EXISTING GUARD RENAMED',
        group: 'GUARD',
        rank: 'JSO',
      }).employee,
      'company-1',
      {
        mode: 'full_replace',
        rawRow: {
          emp_number: 'G-500',
          full_name: 'EXISTING GUARD RENAMED',
          group: 'GUARD',
          rank: 'JSO',
        },
        isUpdate: true,
      },
    );

    expect(fullReplace.nic).toBeNull();
    expect(fullReplace.base_salary).toBeNull();
  });
});

describe('migration employee apply defaults (step 15)', () => {
  it('applyMigrationEmployeeDefaults forces sheet group and defaultStatus', () => {
    const wbMeta = MIGRATION_SHEET_META[MIGRATION_SHEET_RESIGNED];
    const meta = {
      sheetName: wbMeta.sheetName,
      group: wbMeta.fixedGroup,
      defaultStatus: wbMeta.defaultStatus,
    };
    const row = applyMigrationEmployeeDefaults(
      { emp_number: 'G-900', full_name: 'FORMER GUARD', group: '', status: '' },
      meta,
    );
    expect(row.group).toBe('GUARD');
    expect(row.status).toBe('Resigned');
  });

  it('mapUnifiedRosterRow carries resignation fields into payload', () => {
    const mapped = mapUnifiedRosterRow({
      ...EXAMPLE_MIGRATION_RESIGNED_ROW,
      date_resigned: '2025-11-30',
      resignation_type: 'VOLUNTARY',
      resignation_notes: 'Relocated overseas',
    });
    expect(mapped.employee.payload.date_resigned).toBe('2025-11-30');
    expect(mapped.employee.payload.resignation_type).toBe('VOLUNTARY');
    expect(mapped.employee.payload.resignation_notes).toBe('Relocated overseas');
  });

  it('employeeDbPayloadFromUnified includes resignation and temp_parent_id', () => {
    const mapped = mapUnifiedRosterRow(EXAMPLE_MIGRATION_RESIGNED_ROW);
    const record = employeeDbPayloadFromUnified(mapped.employee, 'company-1', {
      tempParentId: 'parent-uuid',
    });
    expect(record.date_resigned).toBe(EXAMPLE_MIGRATION_RESIGNED_ROW.date_resigned);
    expect(record.resignation_type).toBeTruthy();
    expect(record.temp_parent_id).toBe('parent-uuid');
  });

  it('merge-on-update patches resignation fields when provided on Resigned sheet row', () => {
    const mapped = mapUnifiedRosterRow({
      emp_number: 'G-500',
      full_name: 'EXISTING GUARD',
      group: 'GUARD',
      rank: 'JSO',
      date_resigned: '2025-12-01',
      resignation_type: 'RETIREMENT',
      resignation_notes: 'Completed service',
    });
    const patch = employeeDbPayloadForUpsert(mapped.employee, 'company-1', {
      mode: 'migration',
      rawRow: {
        emp_number: 'G-500',
        date_resigned: '2025-12-01',
        resignation_type: 'RETIREMENT',
        resignation_notes: 'Completed service',
      },
      isUpdate: true,
    });
    expect(patch.date_resigned).toBe('2025-12-01');
    expect(patch.resignation_type).toBe('RETIREMENT');
    expect(patch.resignation_notes).toBe('Completed service');
  });

  it('merge-on-update patches temp_parent_id when temp_parent_epf is provided', () => {
    const mapped = mapUnifiedRosterRow(EXAMPLE_MIGRATION_TEMP_GUARD_ROW);
    const patch = employeeDbPayloadForUpsert(mapped.employee, 'company-1', {
      mode: 'migration',
      rawRow: EXAMPLE_MIGRATION_TEMP_GUARD_ROW,
      isUpdate: true,
      tempParentId: 'guard-parent-id',
    });
    expect(patch.temp_parent_id).toBe('guard-parent-id');
  });
});

describe('migration live export split (step 16)', () => {
  it('flattenRateMatrixToSiteExportColumns maps rate_matrix JSON to S6 columns', () => {
    const flat = flattenRateMatrixToSiteExportColumns({
      CSO: { qty: 2, invoiceRate: 85000, payRate: 65000 },
      JSO: { qty: 1, invoiceRate: 72000, payRate: 42000 },
    });
    expect(flat.CSO_qty).toBe(2);
    expect(flat.CSO_invoice_rate_lkr).toBe(85000);
    expect(flat.JSO_pay_rate_lkr).toBe(42000);
  });

  it('classifyMigrationExportWorkforceSheet routes resigned, inactive, and temp pool guards', () => {
    const ctx = buildMigrationSiteExportContext([
      { site_code: 't', site_name: 'TEMP POOL' },
      { site_code: 'LKH001', site_name: 'Lake Hotel' },
    ]);
    expect(
      classifyMigrationExportWorkforceSheet(
        { group: 'GUARD', status: 'Resigned', site_code: 'LKH001' },
        ctx,
      ),
    ).toBe(MIGRATION_SHEET_RESIGNED);
    expect(
      classifyMigrationExportWorkforceSheet(
        { group: 'GUARD', status: 'Inactive', site_code: 'r01' },
        ctx,
      ),
    ).toBe(MIGRATION_SHEET_INACTIVE);
    expect(
      classifyMigrationExportWorkforceSheet(
        { group: 'GUARD', status: 'ACTIVE', site_code: 't' },
        ctx,
      ),
    ).toBe(MIGRATION_SHEET_TEMP_GUARDS);
    expect(
      classifyMigrationExportWorkforceSheet(
        { group: 'HEAD_OFFICE', status: 'ACTIVE' },
        ctx,
      ),
    ).toBe(MIGRATION_SHEET_HEAD_OFFICE);
  });

  it('buildMigrationExportSheetInputs includes Sites rows with flattened rates', () => {
    const sheets = buildMigrationExportSheetInputs(
      [{ group: 'GUARD', status: 'ACTIVE', site_code: 'LKH001', emp_number: 'G-1' }],
      [
        {
          site_code: 'LKH001',
          site_name: 'Lake Hotel',
          site_type: 'HOTEL',
          rate_matrix: { JSO: { qty: 1, invoiceRate: 70000, payRate: 40000 } },
        },
      ],
    );
    const sitesSheet = sheets.find((sheet) => sheet.sheetName === MIGRATION_SHEET_SITES);
    expect(sitesSheet?.rows[0]?.JSO_qty).toBe(1);
    expect(sitesSheet?.rows[0]?.JSO_pay_rate_lkr).toBe(40000);
  });

  it('splitEmployeesForMigrationExport omits MD, OD, and FM singleton portal rows', () => {
    const split = splitEmployeesForMigrationExport(
      [
        { group: 'HEAD_OFFICE', status: 'ACTIVE', rank: 'MD', emp_number: '10000' },
        { group: 'HEAD_OFFICE', status: 'ACTIVE', rank: 'OD', emp_number: '13400' },
        { group: 'HEAD_OFFICE', status: 'ACTIVE', rank: 'FM', emp_number: '20001' },
        { group: 'GUARD', status: 'ACTIVE', rank: 'JSO', emp_number: '30001', site_code: 'LKH001' },
      ],
      [{ site_code: 'LKH001', site_name: 'Lake Hotel' }],
    );

    expect(split[MIGRATION_SHEET_HEAD_OFFICE]).toHaveLength(0);
    expect(split[MIGRATION_SHEET_GUARD]).toHaveLength(1);
    expect(isBulkMigrationExcludedExecutiveRank('MD')).toBe(true);
    expect(isBulkMigrationExcludedExecutiveRank('FM')).toBe(true);
    expect(
      shouldSkipBulkMigrationImportRow(
        { rank: 'OD', emp_number: '13400' },
        { ids: new Set(['exec-id']), empNumbers: new Set(['13400']) },
      ),
    ).toBe(true);
  });
});

/** Step 18 — explicit migration integration checklist (see MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt). */
describe('migration integration unit tests (step 18)', () => {
  function rowsBySheet(parsed: ReturnType<typeof parseBulkDataWorkbook>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const meta of parsed.sheetMeta ?? []) {
      counts[meta.sheetName] = (counts[meta.sheetName] ?? 0) + 1;
    }
    return counts;
  }

  it('18.1 — merge-on-update preserves untouched fields when workbook cells are blank', () => {
    const fullBefore = employeeDbPayloadFromUnified(
      mapUnifiedRosterRow({
        emp_number: 'G-500',
        full_name: 'EXISTING GUARD',
        group: 'GUARD',
        rank: 'JSO',
        nic: '199912345678',
        phone: '+94771234567',
        site_name: 'Client Site Alpha',
        base_salary: 45000,
        bank_code: '7056',
        status: 'ACTIVE',
      }).employee,
      'company-1',
    );

    const mergePatch = employeeDbPayloadForUpsert(
      mapUnifiedRosterRow({
        emp_number: 'G-500',
        full_name: 'EXISTING GUARD RENAMED',
        group: 'GUARD',
        rank: 'JSO',
      }).employee,
      'company-1',
      {
        mode: 'migration',
        rawRow: {
          emp_number: 'G-500',
          full_name: 'EXISTING GUARD RENAMED',
          group: 'GUARD',
          rank: 'JSO',
        },
        isUpdate: true,
      },
    );

    const afterMerge = { ...fullBefore, ...mergePatch };
    expect(afterMerge.full_name).toBe('EXISTING GUARD RENAMED');
    expect(afterMerge.nic).toBe('199912345678');
    expect(afterMerge.bank_code).toBe('7056');
    expect(afterMerge.base_salary).toBe(45000);
    expect(afterMerge.site).toBe('Client Site Alpha');
  });

  it('18.2 — parse multi-sheet workbook returns row counts per workforce sheet', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));

    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.rows).toHaveLength(8);
    expect(parsed.siteRows).toHaveLength(5);
    expect(rowsBySheet(parsed)).toEqual({
      HEAD_OFFICE: 1,
      CAFE: 1,
      GUARD: 1,
      SM: 2,
      Resigned: 1,
      Inactive: 1,
      Temp_Guards: 1,
    });
  });

  it('18.3 — site_code join sets employees.site to Sites tab site_name', () => {
    const siteRows = [
      {
        site_code: 'LKH001',
        site_name: 'LAKE VIEW HOTEL — MAIN ENTRANCE',
        site_type: 'HOTEL',
      },
    ];
    const index = buildMigrationSiteCodeIndex(siteRows);
    const joined = joinMigrationRowToSiteByCode(EXAMPLE_MIGRATION_GUARD_ROW, index);
    const mapped = mapUnifiedRosterRow(joined);

    expect(mapped.employee.payload.site).toBe('LAKE VIEW HOTEL — MAIN ENTRANCE');
    expect(mapped.employee.payload.site).not.toBe('LKH001');
  });

  it('18.4 — buildRateMatrixFromMigrationSiteRow builds rate_matrix from Sites S6 columns', () => {
    const matrix = buildRateMatrixFromMigrationSiteRow({
      CSO_qty: 2,
      CSO_invoice_rate_lkr: 85000,
      CSO_pay_rate_lkr: 65000,
      JSO_qty: 1,
      JSO_invoice_rate_lkr: 72000,
      JSO_pay_rate_lkr: 42000,
    });
    expect(matrix.CSO).toEqual({ qty: 2, invoiceRate: 85000, payRate: 65000 });
    expect(matrix.JSO).toEqual({ qty: 1, invoiceRate: 72000, payRate: 42000 });

    const imported = mapSiteSheetRow(EXAMPLE_MIGRATION_SITE_ROWS[0]!);
    expect(imported.payload.rate_matrix.CSO?.qty).toBe(2);
    expect(imported.payload.rate_matrix.JSO?.payRate).toBe(42000);
  });

  it('18.5 — legacy single Roster sheet still parses for import', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({ [UNIFIED_ROSTER_SHEET_NAME]: [EXAMPLE_UNIFIED_GUARD_ROW] }),
    );

    expect(parsed.multiSheetFormat).toBeUndefined();
    expect(parsed.legacyFormat).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.emp_number).toBe(EXAMPLE_UNIFIED_GUARD_ROW.emp_number);
    expect(validateBulkImport(parsed, DEFAULT_RANK_PAY_MATRIX)).toEqual([]);
  });

  it('18.6 — validateBulkImport rejects guard site_code missing from Sites sheet', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows: [{ site_code: 'LKH001', site_name: 'Known Site', site_type: 'HOTEL' }],
        rows: [
          {
            emp_number: 'G-404',
            full_name: 'UNKNOWN SITE GUARD',
            nic: '199912345678',
            phone: '+94771234567',
            group: 'GUARD',
            rank: 'JSO',
            site_code: 'NOPE999',
          },
        ],
        sheetMeta: [{ sheetName: MIGRATION_SHEET_GUARD, group: 'GUARD', defaultStatus: 'ACTIVE' }],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );

    expect(errors.some((error) => error.includes('NOPE999'))).toBe(true);
    expect(errors.some((error) => error.includes('Sites sheet'))).toBe(true);
  });
});

describe('migration SM link collection (step 12)', () => {
  it('collectSmLinksFromParsedWorkbook reads Guard tab only from migration template', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const links = collectSmLinksFromParsedWorkbook(parsed);

    expect(links).toEqual([{ sm_epf: '13650', guard_epf: '12345' }]);
    expect(parsed.rows.find((row) => row.emp_number === 'G-T01')).toBeTruthy();
    expect(links.some((link) => link.guard_epf === '99001')).toBe(false);
  });

  it('skips Temp_Guards and reserve guards when assigned_sm_epf is blank', () => {
    const links = collectSmLinksFromParsedWorkbook({
      multiSheetFormat: true,
      rows: [
        { ...EXAMPLE_MIGRATION_TEMP_GUARD_ROW, group: 'GUARD' },
        { ...EXAMPLE_MIGRATION_INACTIVE_ROW, group: 'GUARD' },
      ],
      sheetMeta: [
        {
          sheetName: MIGRATION_SHEET_TEMP_GUARDS,
          group: 'GUARD',
          defaultStatus: 'ACTIVE',
        },
        {
          sheetName: MIGRATION_SHEET_INACTIVE,
          group: 'GUARD',
          defaultStatus: 'Inactive',
        },
      ],
    });
    expect(links).toEqual([]);
  });

  it('collectSmEpfsFromMigrationSmSheet indexes SM tab EPF numbers', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    const smEpfs = collectSmEpfsFromMigrationSmSheet(parsed.rows, parsed.sheetMeta);
    expect(smEpfs).toEqual(new Set(['13650', '13496']));
  });

  it('validateBulkImport rejects assigned_sm_epf not listed on SM sheet', () => {
    const errors = validateBulkImport(
      {
        multiSheetFormat: true,
        siteRows: [],
        rows: [
          {
            emp_number: 'G-9',
            epf_no: '55555',
            full_name: 'BAD SM GUARD',
            group: 'GUARD',
            rank: 'JSO',
            site_code: 'LKH001',
            assigned_sm_epf: '99999',
          },
        ],
        sheetMeta: [
          {
            sheetName: MIGRATION_SHEET_GUARD,
            group: 'GUARD',
            defaultStatus: 'ACTIVE',
          },
        ],
      },
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(errors.some((error) => error.includes('99999'))).toBe(true);
    expect(errors.some((error) => error.includes('SM sheet'))).toBe(true);
  });

  it('legacy Roster path still uses collectSmLinksFromRosterRows fallback', () => {
    const links = collectSmLinksFromParsedWorkbook({
      rows: [
        {
          emp_number: 'G-1',
          epf_no: '77777',
          full_name: 'ROSTER GUARD',
          group: 'GUARD',
          rank: 'JSO',
          assigned_sm_epf: '13650',
        },
      ],
    });
    expect(links).toEqual([{ sm_epf: '13650', guard_epf: '77777' }]);
  });
});

describe('collectSmLinksFromRosterRows', () => {
  it('falls back to merged site assigned_sm_epf when row omits it', () => {
    const links = collectSmLinksFromRosterRows([
      {
        emp_number: 'G-1',
        full_name: 'A',
        group: 'GUARD',
        rank: 'JSO',
        epf_no: '99999',
        site_name: 'Shared Site',
      },
      {
        emp_number: 'G-2',
        full_name: 'B',
        group: 'GUARD',
        rank: 'JSO',
        epf_no: '88888',
        site_name: 'Shared Site',
        assigned_sm_epf: 'SM-200',
      },
    ]);
    expect(links).toEqual([
      { sm_epf: 'SM-200', guard_epf: '99999' },
      { sm_epf: 'SM-200', guard_epf: '88888' },
    ]);
  });
});

describe('mapUnifiedEmployeeExportRow', () => {
  it('joins inline site columns and ledger debts for export', () => {
    const row = mapUnifiedEmployeeExportRow(
      {
        id: 'emp-1',
        emp_number: 'G-10',
        full_name: 'EXPORT',
        site: 'Site Alpha',
        uniform_balance: 2500,
        accom_balance: 900,
      },
      { site_name: 'Site Alpha', site_type: 'BANK', address: 'COLOMBO 01' },
      {
        salary_advance_outstanding_lkr: 15000,
        penalty_outstanding_lkr: 500,
        salary_loan_outstanding_lkr: 0,
        unit_damages_outstanding_lkr: 0,
        other_deduction_outstanding_lkr: 0,
      },
    );
    expect(row.uniform_outstanding_lkr).toBe(2500);
    expect(row.salary_advance_outstanding_lkr).toBe(15000);
    expect(row.site_address).toBe('COLOMBO 01');
  });
});

describe('toLegacyImportShape', () => {
  it('maps site_name back to site for legacy bridge', () => {
    const legacy = toLegacyImportShape({
      rows: [{ emp_number: 'G-1', full_name: 'TEST', site_name: 'Site A' }],
    });
    expect(legacy.employees[0]?.site).toBe('Site A');
  });
});

/** Step 17 — staging verification checklist (automated pre-checks). */
describe('bulk roster staging verification (step 17)', () => {
  const SHARED_SITE = 'Staging Verify — Colombo Gate';

  function threeGuardsSameSite(): Record<string, unknown>[] {
    return [
      {
        emp_number: 'STG-G-1',
        epf_no: '99001',
        full_name: 'STAGING GUARD ONE',
        group: 'GUARD',
        rank: 'STG_RANK_X',
        rank_title: 'STAGING TEST RANK',
        rank_basic_pay: 40500,
        rank_salary_type: 'BANK',
        rank_operational_group: 'GUARD_FIELD',
        site_name: SHARED_SITE,
        site_type: 'BANK',
        site_address: 'NO 1, TEST ROAD, COLOMBO',
        required_guards: 3,
        assigned_sm_epf: '13650',
        verification_mode: 'B',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
        uniform_outstanding_lkr: 1500,
        meals_advance_other_outstanding_lkr: 800,
      },
      {
        emp_number: 'STG-G-2',
        epf_no: '99002',
        full_name: 'STAGING GUARD TWO',
        group: 'GUARD',
        rank: 'JSO',
        site_name: SHARED_SITE,
        site_type: 'BANK',
        assigned_sm_epf: '13650',
        verification_mode: 'B',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
        uniform_outstanding_lkr: 2000,
      },
      {
        emp_number: 'STG-G-3',
        epf_no: '99003',
        full_name: 'STAGING GUARD THREE',
        group: 'GUARD',
        rank: 'JSO',
        site_name: SHARED_SITE,
        site_type: 'BANK',
        assigned_sm_epf: '13650',
        verification_mode: 'B',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
        uniform_outstanding_lkr: 2500,
      },
    ];
  }

  it('17.1 — blank template path: 3 guards same site_name parse and validate', () => {
    const rows = threeGuardsSameSite();
    const { createdRankCodes, matrix } = ensureRanksFromRosterRows(rows, DEFAULT_RANK_PAY_MATRIX);
    expect(createdRankCodes).toContain('STG_RANK_X');
    expect(validateBulkImport({ rows }, matrix)).toEqual([]);

    const buffer = workbookBuffer({ [UNIFIED_ROSTER_SHEET_NAME]: rows });
    const parsed = parseBulkDataWorkbook(buffer);
    expect(parsed.rows).toHaveLength(3);
    expect(new Set(parsed.rows.map((r) => r.site_name))).toEqual(new Set([SHARED_SITE]));
  });

  it('17.2 — one derived site; employees.site set; GUARD group for OM roster', () => {
    const rows = threeGuardsSameSite();
    const sites = deriveSitesFromRosterRows(rows);
    expect(sites).toHaveLength(1);
    expect(sites[0]?.payload.site_name).toBe(SHARED_SITE);
    expect(sites[0]?.payload.site_type).toBe('BANK');
    expect(sites[0]?.payload.assigned_sm_epf).toBe('13650');

    for (const row of rows) {
      const mapped = mapUnifiedRosterRow(row);
      const record = employeeDbPayloadFromUnified(mapped.employee, 'company-staging');
      expect(record.site).toBe(SHARED_SITE);
      expect(record.group).toBe('GUARD');
    }

    const links = collectSmLinksFromRosterRows(rows);
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.sm_epf === '13650')).toBe(true);
  });

  it('17.3 — unknown rank auto-created in matrix on first import pass', () => {
    const { createdRankCodes, matrix } = ensureRanksFromRosterRows(
      threeGuardsSameSite(),
      DEFAULT_RANK_PAY_MATRIX,
    );
    expect(createdRankCodes).toEqual(['STG_RANK_X']);
    const entry = matrix.find((r) => r.rankCode === 'STG_RANK_X');
    expect(entry?.basicPay).toBe(40500);
    expect(entry?.operationalGroup).toBe('GUARD_FIELD');
  });

  it('17.4 — uniform_outstanding_lkr visible in clearance / FM offboarding balances', () => {
    const row = threeGuardsSameSite()[0]!;
    const mapped = mapUnifiedRosterRow(row);
    const balances = employeeBalanceDebtPatch(mapped.debts);
    expect(balances.uniform_balance).toBe(1500);
    expect(balances.accom_balance).toBe(800);

    const clearanceLines = persistedOffboardingBalanceLines(
      balances.uniform_balance,
      balances.accom_balance,
    );
    const uniformLine = clearanceLines.find((line) => line.type === 'uniform');
    expect(uniformLine?.amountLkr).toBe(1500);
    expect(uniformLine?.label).toMatch(/uniform/i);
  });

  it('17.5 — export round-trip preserves core fields without data loss', async () => {
    const rows = threeGuardsSameSite();
    const { matrix } = ensureRanksFromRosterRows(rows, DEFAULT_RANK_PAY_MATRIX);
    expect(validateBulkImport({ rows }, matrix)).toEqual([]);

    const siteExportRow = mapSiteProfileForMigrationExport({
      site_code: 'STG001',
      site_name: SHARED_SITE,
      site_type: 'BANK',
      address: 'NO 1, TEST ROAD, COLOMBO',
      assigned_sm_epf: '13650',
      required_guards: 3,
      verification_mode: 'B',
    });

    const exportedEmployees = [
      mapMigrationWorkforceExportRow(
        {
          emp_number: 'SM-STG',
          epf_no: '13650',
          full_name: 'STAGING SM',
          group: 'SECTOR_MANAGER',
          rank: 'VO',
          rank_title: 'VIGILANCE OFFICER',
          rank_basic_pay: 50000,
          rank_salary_type: 'BANK',
          rank_operational_group: 'SECTOR_MANAGER',
          status: 'ACTIVE',
          nic: '199012345678',
          phone: '+94771234567',
        },
        null,
      ),
      ...rows.map((row) => {
        const mapped = mapUnifiedRosterRow(row);
        const balances = employeeBalanceDebtPatch(mapped.debts);
        return mapMigrationWorkforceExportRow(
          {
            ...employeeDbPayloadFromUnified(mapped.employee, 'company-staging'),
            id: `id-${row.emp_number}`,
            site: SHARED_SITE,
            uniform_balance: balances.uniform_balance,
            accom_balance: balances.accom_balance,
          },
          siteExportRow,
          {
            salary_advance_outstanding_lkr: mapped.debts.salary_advance_outstanding_lkr,
            penalty_outstanding_lkr: mapped.debts.penalty_outstanding_lkr,
            salary_loan_outstanding_lkr: mapped.debts.salary_loan_outstanding_lkr,
            unit_damages_outstanding_lkr: mapped.debts.unit_damages_outstanding_lkr,
            other_deduction_outstanding_lkr: mapped.debts.other_deduction_outstanding_lkr,
          },
        );
      }),
    ];

    const { base64 } = await buildBulkDataWorkbook({
      mode: 'export',
      employees: exportedEmployees,
      sites: [siteExportRow],
    });
    const reparsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    expect(reparsed.rows.filter((row) => row.group === 'GUARD' || row.group === 'GUARD_FIELD')).toHaveLength(3);
    expect(reparsed.multiSheetFormat).toBe(true);

    for (const original of rows) {
      const roundTripped = reparsed.rows.find((r) => r.emp_number === original.emp_number);
      expect(roundTripped).toBeTruthy();
      expect(roundTripped?.full_name).toBe(original.full_name);
      expect(roundTripped?.site_name).toBe(SHARED_SITE);
      expect(roundTripped?.rank).toBe(original.rank);
      expect(roundTripped?.group).toBe('GUARD');
      expect(roundTripped?.uniform_outstanding_lkr).toBe(original.uniform_outstanding_lkr);
      expect(roundTripped?.site_type).toBe('BANK');
      expect(roundTripped?.assigned_sm_epf).toBe('13650');
    }

    expect(validateBulkImport(reparsed, matrix)).toEqual([]);
  });
});

/** Step 20 — multi-sheet migration staging verification (automated pre-checks). */
describe('migration multi-sheet staging verification (step 20)', () => {
  const SITE_ALPHA = 'Staging Verify — Alpha Bank Gate';
  const SITE_BETA = 'Staging Verify — Beta Hotel Lobby';

  function rowsBySheet(parsed: ReturnType<typeof parseBulkDataWorkbook>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const meta of parsed.sheetMeta ?? []) {
      counts[meta.sheetName] = (counts[meta.sheetName] ?? 0) + 1;
    }
    return counts;
  }

  function miniMigrationStagingRows() {
    const siteRows = [
      {
        site_code: 'STGA',
        site_name: SITE_ALPHA,
        site_type: 'BANK',
        site_status: 'ACTIVE',
        address: 'NO 1 ALPHA ROAD',
        assigned_sm_epf: '88001',
        required_guards: 2,
        verification_mode: 'B',
        geofence_radius_m: 75,
      },
      {
        site_code: 'STGB',
        site_name: SITE_BETA,
        site_type: 'HOTEL',
        site_status: 'ACTIVE',
        address: 'NO 2 BETA ROAD',
        assigned_sm_epf: '88002',
        required_guards: 1,
        verification_mode: 'B',
        geofence_radius_m: 100,
      },
    ];

    const smRows = [
      {
        emp_number: 'STG-SM-1',
        epf_no: '88001',
        full_name: 'STAGING SM ALPHA',
        nic: '198012345601',
        phone: '+94771111001',
        group: 'SECTOR_MANAGER',
        rank: 'VO',
        rank_title: 'VIGILANCE OFFICER',
        rank_basic_pay: 50000,
        rank_salary_type: 'BANK',
        rank_operational_group: 'SECTOR_MANAGER',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 52000,
      },
      {
        emp_number: 'STG-SM-2',
        epf_no: '88002',
        full_name: 'STAGING SM BETA',
        nic: '198012345602',
        phone: '+94771111002',
        group: 'SECTOR_MANAGER',
        rank: 'VO',
        rank_title: 'VIGILANCE OFFICER',
        rank_basic_pay: 50000,
        rank_salary_type: 'BANK',
        rank_operational_group: 'SECTOR_MANAGER',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 52000,
      },
    ];

    const guardRows = [
      {
        emp_number: 'STG-G-1',
        epf_no: '88101',
        full_name: 'STAGING GUARD ALPHA ONE',
        nic: '199912345601',
        phone: '+94772222001',
        group: 'GUARD',
        rank: 'JSO',
        site_code: 'STGA',
        assigned_sm_epf: '88001',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
        bank_code: '7056',
        bank_name: 'COMMERCIAL BANK',
        branch_code: '052',
        account_number: '8001110001',
      },
      {
        emp_number: 'STG-G-2',
        epf_no: '88102',
        full_name: 'STAGING GUARD ALPHA TWO',
        nic: '199912345602',
        phone: '+94772222002',
        group: 'GUARD',
        rank: 'JSO',
        site_code: 'STGA',
        assigned_sm_epf: '88001',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
      },
      {
        emp_number: 'STG-G-3',
        epf_no: '88103',
        full_name: 'STAGING GUARD BETA',
        nic: '199912345603',
        phone: '+94772222003',
        group: 'GUARD',
        rank: 'JSO',
        site_code: 'STGB',
        assigned_sm_epf: '88002',
        status: 'ACTIVE',
        salary_type: 'BANK',
        base_salary: 42000,
        uniform_outstanding_lkr: 1200,
      },
    ];

    return { siteRows, employees: [...smRows, ...guardRows] };
  }

  it('20.1 — blank template has nine sheets with styled GUARD dropdown validations', async () => {
    const { base64 } = await buildBulkDataWorkbook({ mode: 'template', employees: [], sites: [] });
    const wb = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
    expect(wb.SheetNames).toEqual([...MIGRATION_TEMPLATE_ALL_SHEETS]);

    const excelWb = await loadExcelJsWorkbook(base64);
    expect(excelWb.getWorksheet(MIGRATION_SHEET_LOOKUPS)).toBeTruthy();
    const guardColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD);
    const siteCodeCol = columnIndex1(guardColumns, 'site_code');
    const guard = excelWb.getWorksheet(MIGRATION_SHEET_GUARD);
    const validation = guard?.getCell(MIGRATION_EXCEL_DATA_START_ROW, siteCodeCol).dataValidation;
    expect(validation?.type).toBe('list');
    expect(validation?.formulae?.[0]).toBe(MIGRATION_LOOKUP_SITE_CODES_RANGE);
  });

  it('20.2 — two sites, two SMs, three guards validate and join to site_name for MNR', () => {
    const { siteRows, employees } = miniMigrationStagingRows();
    const smRows = employees.filter((row) => row.group === 'SECTOR_MANAGER');
    const guardRows = employees.filter((row) => row.group === 'GUARD');
    const parsed = joinMigrationWorkforceRowsToSites({
      multiSheetFormat: true,
      rows: [...smRows, ...guardRows],
      siteRows,
      sheetMeta: [
        ...smRows.map(() => ({
          sheetName: MIGRATION_SHEET_SM,
          group: 'SECTOR_MANAGER',
          defaultStatus: 'ACTIVE',
        })),
        ...guardRows.map(() => ({
          sheetName: MIGRATION_SHEET_GUARD,
          group: 'GUARD',
          defaultStatus: 'ACTIVE',
        })),
      ],
    });

    expect(validateBulkImport(parsed, DEFAULT_RANK_PAY_MATRIX)).toEqual([]);
    expect(collectMigrationSiteImportRows(parsed)).toHaveLength(2);

    const guardOne = mapUnifiedRosterRow(
      parsed.rows.find((row) => row.emp_number === 'STG-G-1')!,
    );
    expect(guardOne.employee.payload.site).toBe(SITE_ALPHA);
    expect(guardOne.employee.payload.bank_code).toBe('7056');
    expect(guardOne.debts.uniform_outstanding_lkr).toBe(0);

    const guardThree = mapUnifiedRosterRow(
      parsed.rows.find((row) => row.emp_number === 'STG-G-3')!,
    );
    expect(guardThree.employee.payload.site).toBe(SITE_BETA);
    expect(guardThree.debts.uniform_outstanding_lkr).toBe(1200);

    const smOne = mapUnifiedRosterRow(
      parsed.rows.find((row) => row.emp_number === 'STG-SM-1')!,
    );
    const smDb = employeeDbPayloadFromUnified(smOne.employee, 'company-staging');
    expect(smDb.group).toBe('HEAD_OFFICE');
    expect(smDb.rank).toBe('SM');
  });

  it('20.3 — partial re-import with blank optional cells preserves untouched DB fields', () => {
    const beforeRow = {
      emp_number: 'STG-G-1',
      full_name: 'STAGING GUARD ALPHA ONE',
      group: 'GUARD',
      rank: 'JSO',
      nic: '199912345601',
      phone: '+94772222001',
      site_name: SITE_ALPHA,
      base_salary: 42000,
      bank_code: '7056',
      status: 'ACTIVE',
    };
    const mappedBefore = mapUnifiedRosterRow(beforeRow);
    const fullBefore = employeeDbPayloadFromUnified(mappedBefore.employee, 'company-staging');

    const mergePatch = employeeDbPayloadForUpsert(
      mapUnifiedRosterRow({
        ...beforeRow,
        full_name: 'STAGING GUARD RENAMED ONLY',
      }).employee,
      'company-staging',
      {
        mode: 'migration',
        rawRow: {
          emp_number: 'STG-G-1',
          full_name: 'STAGING GUARD RENAMED ONLY',
        },
        isUpdate: true,
      },
    );

    const afterMerge = { ...fullBefore, ...mergePatch };
    expect(afterMerge.full_name).toBe('STAGING GUARD RENAMED ONLY');
    expect(afterMerge.nic).toBe('199912345601');
    expect(afterMerge.base_salary).toBe(42000);
    expect(afterMerge.bank_code).toBe('7056');
    expect(afterMerge.site).toBe(SITE_ALPHA);
    expect(mergePatch).not.toHaveProperty('phone');
  });

  it('20.4 — export live split matches workforce sheet counts on re-parse', async () => {
    const { siteRows, employees } = miniMigrationStagingRows();
    const { base64 } = await buildBulkDataWorkbook({
      mode: 'export',
      employees,
      sites: siteRows,
    });

    const parsed = parseBulkDataWorkbook(Buffer.from(base64, 'base64'));
    expect(parsed.multiSheetFormat).toBe(true);
    expect(parsed.siteRows).toHaveLength(2);
    expect(rowsBySheet(parsed)).toEqual({
      SM: 2,
      GUARD: 3,
    });

    const split = splitEmployeesForMigrationExport(employees, siteRows);
    expect(split[MIGRATION_SHEET_SM]).toHaveLength(2);
    expect(split[MIGRATION_SHEET_GUARD]).toHaveLength(3);
  });

  it('20.5 — legacy single Roster upload still parses and validates', () => {
    const parsed = parseBulkDataWorkbook(
      workbookBuffer({
        [UNIFIED_ROSTER_SHEET_NAME]: [
          {
            ...EXAMPLE_UNIFIED_GUARD_ROW,
            emp_number: 'LEG-G-1',
            site_name: 'Legacy Client Site',
          },
        ],
      }),
    );

    expect(parsed.multiSheetFormat).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(validateBulkImport(parsed, DEFAULT_RANK_PAY_MATRIX)).toEqual([]);
    expect(mapUnifiedRosterRow(parsed.rows[0]!).employee.payload.site).toBe('Legacy Client Site');
  });
});
