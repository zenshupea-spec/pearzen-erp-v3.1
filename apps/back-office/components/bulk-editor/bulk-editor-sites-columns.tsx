'use client';

import type { ReactNode } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';

import {
  siteCodeCellClass,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
} from '../../lib/bulk-editor-sites-grid';
import { normalizeSiteCode } from '../../lib/bulk-editor-cross-sheet';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type SitesColumnContext = {
  smEpfOptions: readonly string[];
  duplicateSiteCodeRowIds: ReadonlySet<string>;
  renderSectorEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
  renderSmEpfEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
};

export function customizeSitesColumn(
  columnKey: string,
  base: Column<BulkEditorRow>,
  ctx: SitesColumnContext,
): Column<BulkEditorRow> {
  if (columnKey === 'site_code') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 120, 120),
      renderCell({ row }) {
        const code = normalizeSiteCode(row.site_code);
        if (!code) {
          return <span className="text-[11px] italic text-slate-400">Required</span>;
        }
        return <span className="font-bold tracking-wide text-slate-800">{code}</span>;
      },
      cellClass: (row) => siteCodeCellClass(row, ctx.duplicateSiteCodeRowIds),
    };
  }

  if (columnKey === 'assigned_sm_epf') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 140, 140),
      renderCell({ row }) {
        const epf = String(row.assigned_sm_epf ?? '').trim();
        if (!epf) {
          return <span className="text-[11px] text-slate-400">—</span>;
        }
        return <span className="font-semibold text-slate-800">{epf}</span>;
      },
      renderEditCell: ctx.renderSmEpfEditCell,
    };
  }

  if (columnKey === WEB_EDITOR_SECTOR_NAME_COLUMN) {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 140, 150),
      renderCell({ row }) {
        const value = String(row[WEB_EDITOR_SECTOR_NAME_COLUMN] ?? '').trim();
        if (!value) {
          return <span className="text-[11px] text-slate-400">Optional</span>;
        }
        return <span className="font-semibold text-slate-800">{value}</span>;
      },
      renderEditCell: ctx.renderSectorEditCell,
    };
  }

  return base;
}
