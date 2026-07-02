/**
 * Migration workbook **write** path — ExcelJS.
 *
 * Upload **read** path stays on SheetJS (`xlsx`) in bulk-data-import.ts because
 * parseBulkDataWorkbook() already handles legacy + unified sheets reliably.
 *
 * SheetJS community `xlsx` cannot apply cell fills, fonts, freeze panes, or Excel
 * data-validation dropdowns. ExcelJS is required for operator-friendly templates
 * (colour-coded column groups, frozen headers, site/SM dropdowns — steps 5–9).
 */
import ExcelJS from 'exceljs';

import {
  MIGRATION_COLUMN_GROUP_COLORS,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_LOOKUPS,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_TEMP_GUARDS,
  type MigrationColumnGroupId,
  templateColumnsForMigrationWorkforceSheet,
} from './bulk-data-workbook';

import type { MigrationExportLookupsSource } from './bulk-data-workbook';

/** Row 1 = sheet title, row 2 = group bands, row 3 = column keys; data from row 4. */
export const MIGRATION_EXCEL_HEADER_ROW_COUNT = 3;

export const MIGRATION_EXCEL_DATA_START_ROW = MIGRATION_EXCEL_HEADER_ROW_COUNT + 1;

export const MIGRATION_SHEET_TITLE_SUFFIX = 'Pearzen migration';

/** Rows on Lookups sheet populated with INDEX/OFFSET-style formulae. */
export const MIGRATION_LOOKUP_FORMULA_ROWS = 500;

/** Data rows on GUARD / Temp_Guards receiving dropdown validation. */
export const MIGRATION_VALIDATION_DATA_ROWS = 500;

export const MIGRATION_LOOKUP_SITE_CODES_RANGE = `Lookups!$A$2:$A$${MIGRATION_LOOKUP_FORMULA_ROWS + 1}`;
export const MIGRATION_LOOKUP_SM_EPFS_RANGE = `Lookups!$B$2:$B$${MIGRATION_LOOKUP_FORMULA_ROWS + 1}`;

export type MigrationWorkbookWriteOptions = {
  mode: 'template' | 'export';
  /** Static lists for export-mode Lookups when Sites/SM tabs are not written. */
  exportLookups?: MigrationExportLookupsSource;
};

export type ExcelJsDataSheetInput = {
  sheetName: string;
  /** Row 1 banner text (defaults to `${sheetName} — Pearzen migration`). */
  sheetTitle?: string;
  columns: readonly string[];
  rows: Record<string, unknown>[];
  columnGroupForKey?: (columnKey: string) => MigrationColumnGroupId | undefined;
  /** Use 3-row styled header (default true). Set false for legacy 1-row tests. */
  styledHeader?: boolean;
};

type GroupBand = {
  groupId: MigrationColumnGroupId | 'default';
  label: string;
  startCol: number;
  endCol: number;
};

function formatCellValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return value;
  return String(value);
}

function paletteForGroup(groupId: MigrationColumnGroupId | 'default') {
  if (groupId === 'default') {
    return { fill: '334155', font: 'FFFFFF', label: 'Other' };
  }
  return MIGRATION_COLUMN_GROUP_COLORS[groupId];
}

function applyTitleRowStyle(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, name: 'Calibri', size: 14, color: { argb: 'FFFFFFFF' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function applyGroupBandStyle(cell: ExcelJS.Cell, groupId: MigrationColumnGroupId | 'default'): void {
  const palette = paletteForGroup(groupId);
  cell.value = palette.label;
  cell.font = { bold: true, name: 'Calibri', size: 11, color: { argb: `FF${palette.font}` } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${palette.fill}` },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function applyColumnKeyStyle(cell: ExcelJS.Cell, groupId: MigrationColumnGroupId | 'default'): void {
  const palette = paletteForGroup(groupId);
  cell.font = {
    bold: true,
    name: 'Courier New',
    size: 10,
    color: { argb: `FF${palette.font}` },
  };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${palette.fill}` },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
}

function buildGroupBands(
  columns: readonly string[],
  columnGroupForKey?: (columnKey: string) => MigrationColumnGroupId | undefined,
): GroupBand[] {
  const bands: GroupBand[] = [];

  columns.forEach((columnKey, index) => {
    const col = index + 1;
    const groupId = columnGroupForKey?.(columnKey) ?? 'default';
    const label = paletteForGroup(groupId).label;
    const last = bands[bands.length - 1];

    if (last && last.groupId === groupId) {
      last.endCol = col;
      return;
    }

    bands.push({ groupId, label, startCol: col, endCol: col });
  });

  return bands;
}

function writeStyledHeaderBlock(
  worksheet: ExcelJS.Worksheet,
  input: ExcelJsDataSheetInput,
  columns: readonly string[],
): void {
  const title = input.sheetTitle ?? `${input.sheetName} — ${MIGRATION_SHEET_TITLE_SUFFIX}`;
  const lastCol = columns.length;

  worksheet.mergeCells(1, 1, 1, lastCol);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  applyTitleRowStyle(titleCell);
  worksheet.getRow(1).height = 28;

  const bands = buildGroupBands(columns, input.columnGroupForKey);
  for (const band of bands) {
    if (band.startCol === band.endCol) {
      applyGroupBandStyle(worksheet.getCell(2, band.startCol), band.groupId);
      worksheet.getCell(2, band.startCol).value = band.label;
    } else {
      worksheet.mergeCells(2, band.startCol, 2, band.endCol);
      applyGroupBandStyle(worksheet.getCell(2, band.startCol), band.groupId);
    }
  }
  worksheet.getRow(2).height = 24;

  const keyRow = worksheet.getRow(MIGRATION_EXCEL_HEADER_ROW_COUNT);
  columns.forEach((columnKey, index) => {
    const cell = keyRow.getCell(index + 1);
    cell.value = columnKey;
    applyColumnKeyStyle(cell, input.columnGroupForKey?.(columnKey) ?? 'default');
  });
  keyRow.height = 22;
}

function writeLegacySingleHeaderRow(
  worksheet: ExcelJS.Worksheet,
  input: ExcelJsDataSheetInput,
  columns: readonly string[],
): void {
  const headerRow = worksheet.getRow(1);
  columns.forEach((columnKey, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = columnKey;
    applyColumnKeyStyle(cell, input.columnGroupForKey?.(columnKey) ?? 'default');
  });
  headerRow.height = 22;
}

export function appendExcelJsDataSheet(
  workbook: ExcelJS.Workbook,
  input: ExcelJsDataSheetInput,
): ExcelJS.Worksheet {
  const worksheet = workbook.addWorksheet(input.sheetName);
  const columns = [...input.columns];
  const styledHeader = input.styledHeader !== false;
  const headerRows = styledHeader ? MIGRATION_EXCEL_HEADER_ROW_COUNT : 1;
  const dataStartRow = headerRows + 1;

  if (styledHeader) {
    writeStyledHeaderBlock(worksheet, input, columns);
  } else {
    writeLegacySingleHeaderRow(worksheet, input, columns);
  }

  input.rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(dataStartRow + rowIndex);
    columns.forEach((columnKey, colIndex) => {
      excelRow.getCell(colIndex + 1).value = formatCellValue(row[columnKey]);
    });
  });

  columns.forEach((columnKey, index) => {
    worksheet.getColumn(index + 1).width = Math.min(42, Math.max(12, columnKey.length + 2));
  });

  worksheet.views = [
    {
      state: 'frozen',
      ySplit: headerRows,
      xSplit: 0,
      topLeftCell: `A${dataStartRow}`,
      activeCell: `A${dataStartRow}`,
    },
  ];

  return worksheet;
}

function excelColumnLetter(col1Based: number): string {
  let n = col1Based;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function columnIndex1(columns: readonly string[], key: string): number {
  const index = columns.indexOf(key);
  return index >= 0 ? index + 1 : -1;
}

function applyListColumnValidation(
  worksheet: ExcelJS.Worksheet,
  col1Based: number,
  fromRow: number,
  toRow: number,
  listRange: string,
): void {
  if (col1Based < 1) return;

  for (let row = fromRow; row <= toRow; row += 1) {
    worksheet.getCell(row, col1Based).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [listRange],
      showErrorMessage: true,
      errorTitle: 'Invalid value',
      error: 'Choose a value from the dropdown list.',
    };
  }
}

function writeTemplateLookupsFormulas(lookupsSheet: ExcelJS.Worksheet): void {
  const sitesCol = excelColumnLetter(1);
  const smEpfCol = excelColumnLetter(
    columnIndex1(templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_SM), 'epf_no'),
  );
  const dataStart = MIGRATION_EXCEL_DATA_START_ROW;

  lookupsSheet.getCell(1, 1).value = 'site_code';
  lookupsSheet.getCell(1, 2).value = 'sm_epf_no';
  lookupsSheet.getRow(1).font = { bold: true, name: 'Calibri', size: 11 };

  for (let offset = 0; offset < MIGRATION_LOOKUP_FORMULA_ROWS; offset += 1) {
    const row = offset + 2;
    lookupsSheet.getCell(row, 1).value = {
      formula: `IF(${offset}<COUNTA(${MIGRATION_SHEET_SITES}!$${sitesCol}$${dataStart}:$${sitesCol}$1048576),INDEX(${MIGRATION_SHEET_SITES}!$${sitesCol}:$${sitesCol},${offset}+${dataStart}),"")`,
    };
    lookupsSheet.getCell(row, 2).value = {
      formula: `IF(${offset}<COUNTA(${MIGRATION_SHEET_SM}!$${smEpfCol}$${dataStart}:$${smEpfCol}$1048576),INDEX(${MIGRATION_SHEET_SM}!$${smEpfCol}:$${smEpfCol},${offset}+${dataStart}),"")`,
    };
  }

  lookupsSheet.getColumn(1).width = 18;
  lookupsSheet.getColumn(2).width = 16;
}

function writeExportLookupsValues(
  lookupsSheet: ExcelJS.Worksheet,
  exportLookups: MigrationExportLookupsSource,
): void {
  lookupsSheet.getCell(1, 1).value = 'site_code';
  lookupsSheet.getCell(1, 2).value = 'sm_epf_no';
  lookupsSheet.getRow(1).font = { bold: true, name: 'Calibri', size: 11 };

  exportLookups.siteCodes.forEach((code, index) => {
    lookupsSheet.getCell(index + 2, 1).value = code;
  });
  exportLookups.smEpfs.forEach((epf, index) => {
    lookupsSheet.getCell(index + 2, 2).value = epf;
  });

  lookupsSheet.getColumn(1).width = 18;
  lookupsSheet.getColumn(2).width = 16;
}

function appendMigrationLookupsSheet(
  workbook: ExcelJS.Workbook,
  options: MigrationWorkbookWriteOptions,
): void {
  const lookupsSheet = workbook.addWorksheet(MIGRATION_SHEET_LOOKUPS);

  if (options.mode === 'template') {
    writeTemplateLookupsFormulas(lookupsSheet);
  } else if (options.exportLookups) {
    writeExportLookupsValues(lookupsSheet, options.exportLookups);
  } else {
    lookupsSheet.getCell(1, 1).value = 'site_code';
    lookupsSheet.getCell(1, 2).value = 'sm_epf_no';
  }

  lookupsSheet.state = 'veryHidden';
}

function applyMigrationTemplateValidations(workbook: ExcelJS.Workbook): void {
  const guardColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_GUARD);
  const tempColumns = templateColumnsForMigrationWorkforceSheet(MIGRATION_SHEET_TEMP_GUARDS);
  const siteCodeCol = columnIndex1(guardColumns, 'site_code');
  const smEpfCol = columnIndex1(guardColumns, 'assigned_sm_epf');
  const tempSiteCodeCol = columnIndex1(tempColumns, 'site_code');
  const validationEndRow = MIGRATION_EXCEL_DATA_START_ROW + MIGRATION_VALIDATION_DATA_ROWS - 1;

  const guardSheet = workbook.getWorksheet(MIGRATION_SHEET_GUARD);
  if (guardSheet) {
    applyListColumnValidation(
      guardSheet,
      siteCodeCol,
      MIGRATION_EXCEL_DATA_START_ROW,
      validationEndRow,
      MIGRATION_LOOKUP_SITE_CODES_RANGE,
    );
    applyListColumnValidation(
      guardSheet,
      smEpfCol,
      MIGRATION_EXCEL_DATA_START_ROW,
      validationEndRow,
      MIGRATION_LOOKUP_SM_EPFS_RANGE,
    );
  }

  const tempSheet = workbook.getWorksheet(MIGRATION_SHEET_TEMP_GUARDS);
  if (tempSheet) {
    applyListColumnValidation(
      tempSheet,
      tempSiteCodeCol,
      MIGRATION_EXCEL_DATA_START_ROW,
      validationEndRow,
      MIGRATION_LOOKUP_SITE_CODES_RANGE,
    );
  }
}

function applyMigrationExportValidations(
  workbook: ExcelJS.Workbook,
  exportLookups?: MigrationExportLookupsSource,
): void {
  if (!exportLookups) return;
  applyMigrationTemplateValidations(workbook);
}

function finalizeMigrationWorkbook(
  workbook: ExcelJS.Workbook,
  options: MigrationWorkbookWriteOptions,
): void {
  const shouldWriteLookups =
    options.mode === 'template' ||
    (options.exportLookups &&
      (options.exportLookups.siteCodes.length > 0 || options.exportLookups.smEpfs.length > 0));

  if (!shouldWriteLookups) return;

  appendMigrationLookupsSheet(workbook, options);

  if (options.mode === 'template') {
    applyMigrationTemplateValidations(workbook);
    return;
  }

  applyMigrationExportValidations(workbook, options.exportLookups);
}

/** Writes one or more styled migration sheets to base64 `.xlsx`. */
export async function buildMigrationTemplateWorkbook(
  sheets: ExcelJsDataSheetInput[],
  options: MigrationWorkbookWriteOptions = { mode: 'template' },
): Promise<string> {
  return writeExcelJsWorkbookToBase64(sheets, options);
}

export async function writeExcelJsWorkbookToBase64(
  sheets: ExcelJsDataSheetInput[],
  options: MigrationWorkbookWriteOptions = { mode: 'template' },
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pearzen ERP';
  workbook.created = new Date();

  for (const sheet of sheets) {
    appendExcelJsDataSheet(workbook, sheet);
  }

  finalizeMigrationWorkbook(workbook, options);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}
