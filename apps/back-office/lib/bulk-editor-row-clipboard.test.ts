import { describe, expect, it } from 'vitest';

import { appendBulkEditorRowsFromClipboard, serializeBulkEditorRowsToTsv } from './bulk-editor-row-clipboard';
import { createEmptyEditorRow } from './bulk-roster-web-editor-state';
import { WEB_EDITOR_SITES_COLUMNS } from './bulk-roster-web-editor-spec';

describe('bulk-editor-row-clipboard', () => {
  it('serializes rows to TSV', () => {
    const tsv = serializeBulkEditorRowsToTsv(
      [{ _rowId: '1', site_code: 'LKH001', site_name: 'Lake House' }],
      WEB_EDITOR_SITES_COLUMNS,
    );
    expect(tsv.startsWith('LKH001\tLake House')).toBe(true);
  });

  it('appends pasted rows at the bottom when nothing is selected', () => {
    const result = appendBulkEditorRowsFromClipboard({
      tabId: 'sites',
      columnKeys: WEB_EDITOR_SITES_COLUMNS,
      rows: [{ _rowId: '1', site_code: 'A', site_name: 'Alpha' }],
      clipboardText: 'B\tBeta\tHOTEL\tACTIVE',
      createRow: () => createEmptyEditorRow(WEB_EDITOR_SITES_COLUMNS),
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]?.site_code).toBe('B');
    expect(result.rows[1]?.site_name).toBe('Beta');
  });
});
