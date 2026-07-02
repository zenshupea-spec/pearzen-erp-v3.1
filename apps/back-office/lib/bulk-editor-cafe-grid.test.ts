import { describe, expect, it } from 'vitest';

import {
  CAFE_FIXED_GROUP_VALUE,
  WEB_EDITOR_CAFE_GROUP_COLUMN,
  applyCafeRowTemplate,
  createCafeEditorRow,
  normalizeCafeEditorRows,
} from './bulk-editor-cafe-grid';

describe('bulk-editor-cafe-grid', () => {
  it('creates a café row with template defaults', () => {
    const row = createCafeEditorRow();
    expect(row[WEB_EDITOR_CAFE_GROUP_COLUMN]).toBe(CAFE_FIXED_GROUP_VALUE);
    expect(row.status).toBe('ACTIVE');
    expect(row.rank).toBe('BARISTA');
    expect(row.rank_operational_group).toBe('CAFE');
    expect(row.site_code).toBe('CAFE01');
  });

  it('preserves filled cells when applying template', () => {
    const row = applyCafeRowTemplate({
      _rowId: 'x',
      full_name: 'Tasha',
      rank: 'SUP',
    });
    expect(row.full_name).toBe('Tasha');
    expect(row.rank).toBe('SUP');
    expect(row[WEB_EDITOR_CAFE_GROUP_COLUMN]).toBe(CAFE_FIXED_GROUP_VALUE);
  });

  it('normalizes loaded rows to fixed CAFE group', () => {
    const rows = normalizeCafeEditorRows([
      { _rowId: '1', full_name: 'A', rank: 'BARISTA' },
    ]);
    expect(rows[0]?.[WEB_EDITOR_CAFE_GROUP_COLUMN]).toBe(CAFE_FIXED_GROUP_VALUE);
  });
});
