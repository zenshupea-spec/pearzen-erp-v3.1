'use client';

import type { ReactNode } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';

import {
  headOfficeSectorNameCellClass,
  isHeadOfficeSectorEditable,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
} from '../../lib/bulk-editor-head-office-grid';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type HeadOfficeSectorColumnContext = {
  touchedSectorRowIds: ReadonlySet<string>;
  renderSectorEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
};

export function customizeHeadOfficeColumn(
  columnKey: string,
  base: Column<BulkEditorRow>,
  ctx: HeadOfficeSectorColumnContext,
): Column<BulkEditorRow> {
  if (columnKey !== WEB_EDITOR_SECTOR_NAME_COLUMN) {
    return base;
  }

  const baseWidth = typeof base.width === 'number' ? base.width : 140;

  return {
    ...base,
    name: 'sector_name (SM only)',
    width: Math.max(baseWidth, 160),
    editable: (row) => isHeadOfficeSectorEditable(row),
    renderCell({ row }) {
      if (!isHeadOfficeSectorEditable(row)) {
        return <span className="text-[11px] font-medium text-slate-400">—</span>;
      }
      const value = String(row[WEB_EDITOR_SECTOR_NAME_COLUMN] ?? '').trim();
      if (!value) {
        return (
          <span className="text-[11px] font-semibold italic text-amber-700/80">Required for SM</span>
        );
      }
      return <span className="font-semibold text-slate-800">{value}</span>;
    },
    renderEditCell: ctx.renderSectorEditCell,
    cellClass: (row) => headOfficeSectorNameCellClass(row, ctx.touchedSectorRowIds),
  };
}
