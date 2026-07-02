import { describe, expect, it } from 'vitest';

import {
  createEditorRowForTab,
  createEmptyEditorRow,
  isTabDirtyComparedToBaseline,
  tabRowsSignature,
  updateTabRows,
} from './bulk-roster-web-editor-state';
import { WEB_EDITOR_CAFE_GROUP_COLUMN } from './bulk-editor-cafe-grid';
import type { BulkEditorSnapshot } from './bulk-roster-web-editor-spec';
import { WEB_EDITOR_HEAD_OFFICE_COLUMNS } from './bulk-roster-web-editor-spec';

const emptySnapshot = (): BulkEditorSnapshot => ({
  headOffice: [],
  cafe: [],
  sites: [],
  guards: [],
  ranks: [],
  sectorNames: [],
  savedAt: new Date().toISOString(),
});

describe('bulk-roster-web-editor-state', () => {
  it('detects dirty tab when a cell changes', () => {
    const baseline = emptySnapshot();
    const row = createEmptyEditorRow(WEB_EDITOR_HEAD_OFFICE_COLUMNS);
    row.full_name = 'Jane';
    const snapshot = updateTabRows(baseline, 'head_office', [row]);

    expect(isTabDirtyComparedToBaseline(snapshot, baseline, 'head_office')).toBe(true);
    expect(isTabDirtyComparedToBaseline(snapshot, baseline, 'cafe')).toBe(false);
  });

  it('ignores whitespace-only changes in signature', () => {
    const row = createEmptyEditorRow(['full_name']);
    row.full_name = 'Jane';
    const spaced = { ...row, full_name: ' Jane ' };
    expect(tabRowsSignature([row], ['full_name'])).toBe(
      tabRowsSignature([spaced], ['full_name']),
    );
  });

  it('createEmptyEditorRow fills column keys', () => {
    const row = createEmptyEditorRow(['emp_number', 'full_name']);
    expect(row._rowId.startsWith('new:')).toBe(true);
    expect(row.emp_number).toBe('');
    expect(row.full_name).toBe('');
  });

  it('createEditorRowForTab uses café template on cafe tab', () => {
    const row = createEditorRowForTab('cafe');
    expect(row[WEB_EDITOR_CAFE_GROUP_COLUMN]).toBe('CAFE');
    expect(row.rank).toBe('BARISTA');
  });
});
