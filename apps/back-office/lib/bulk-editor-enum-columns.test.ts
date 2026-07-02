import { describe, expect, it } from 'vitest';

import {
  isBulkEditorEnumColumn,
  isBulkEditorSingleClickSelectColumn,
  normalizeBulkEditorEnumCellValue,
  resolveBulkEditorEnumOptions,
} from './bulk-editor-enum-columns';
import type { BulkEditorRow } from './bulk-roster-web-editor-spec';

describe('bulk-editor-enum-columns', () => {
  it('recognizes gender as an enum column', () => {
    expect(isBulkEditorEnumColumn('gender')).toBe(true);
    expect(isBulkEditorEnumColumn('full_name')).toBe(false);
  });

  it('normalizes boolean-like enum cells', () => {
    expect(normalizeBulkEditorEnumCellValue('epf_yn', 'yes')).toBe('TRUE');
    expect(normalizeBulkEditorEnumCellValue('epf_yn', 'no')).toBe('FALSE');
  });

  it('merges preset and row values for combobox options', () => {
    const rows: BulkEditorRow[] = [
      { _rowId: '1', gender: 'MALE' },
      { _rowId: '2', gender: 'OTHER' },
    ];
    expect(resolveBulkEditorEnumOptions('gender', rows)).toEqual(['MALE', 'FEMALE', 'OTHER']);
  });

  it('includes ranks and live dropdown columns for single-click select', () => {
    expect(isBulkEditorSingleClickSelectColumn('gender', 'head_office')).toBe(true);
    expect(isBulkEditorSingleClickSelectColumn('salary_type', 'ranks')).toBe(true);
    expect(isBulkEditorSingleClickSelectColumn('site_code', 'guard')).toBe(true);
    expect(isBulkEditorSingleClickSelectColumn('full_name', 'head_office')).toBe(false);
  });
});
