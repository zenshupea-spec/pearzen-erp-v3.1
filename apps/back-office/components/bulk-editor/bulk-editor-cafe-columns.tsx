'use client';

import type { Column } from 'react-data-grid';

import {
  CAFE_FIXED_GROUP_VALUE,
  WEB_EDITOR_CAFE_GROUP_COLUMN,
} from '../../lib/bulk-editor-cafe-grid';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export function cafeCorporateGroupColumn(): Column<BulkEditorRow> {
  return {
    key: WEB_EDITOR_CAFE_GROUP_COLUMN,
    name: 'Group',
    width: 88,
    minWidth: 88,
    maxWidth: 88,
    frozen: true,
    resizable: false,
    editable: false,
    renderHeaderCell() {
      return (
        <div className="bulk-editor-col-header" style={{ borderBottom: '3px solid #7C3AED' }}>
          <span className="bulk-editor-col-header-key">group</span>
        </div>
      );
    },
    renderCell() {
      return (
        <span className="bulk-editor-cafe-group-badge" title="Fixed workforce group">
          {CAFE_FIXED_GROUP_VALUE}
        </span>
      );
    },
    cellClass: () => 'bulk-editor-readonly-cell',
  };
}

export const WEB_EDITOR_CAFE_GRID_UI_COLUMNS = [WEB_EDITOR_CAFE_GROUP_COLUMN] as const;
