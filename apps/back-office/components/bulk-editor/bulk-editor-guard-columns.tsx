'use client';

import type { ReactNode } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';

import { normalizeSiteCode, resolveSiteName } from '../../lib/bulk-editor-cross-sheet';
import {
  GUARD_FIXED_GROUP_VALUE,
  GUARD_SM_AUTO_FLAG,
  WEB_EDITOR_GUARD_GROUP_COLUMN,
  WEB_EDITOR_GUARD_SITE_NAME_HINT_KEY,
  isGuardSmAutoAssigned,
} from '../../lib/bulk-editor-guard-grid';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type GuardColumnContext = {
  siteCodeOptions: readonly string[];
  siteRows: readonly BulkEditorRow[];
  renderSiteCodeEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
  renderSmEpfEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
};

export function guardCorporateGroupColumn(): Column<BulkEditorRow> {
  return {
    key: WEB_EDITOR_GUARD_GROUP_COLUMN,
    name: 'Group',
    width: 88,
    minWidth: 88,
    maxWidth: 88,
    frozen: true,
    resizable: false,
    editable: false,
    renderHeaderCell() {
      return (
        <div className="bulk-editor-col-header" style={{ borderBottom: '3px solid #0284C7' }}>
          <span className="bulk-editor-col-header-key">group</span>
        </div>
      );
    },
    renderCell() {
      return (
        <span className="bulk-editor-guard-group-badge" title="Fixed workforce group">
          {GUARD_FIXED_GROUP_VALUE}
        </span>
      );
    },
    cellClass: () => 'bulk-editor-readonly-cell',
  };
}

export function guardSiteNameHintColumn(ctx: GuardColumnContext): Column<BulkEditorRow> {
  return {
    key: WEB_EDITOR_GUARD_SITE_NAME_HINT_KEY,
    name: 'Site name',
    width: 180,
    minWidth: 120,
    maxWidth: 280,
    frozen: true,
    resizable: true,
    editable: false,
    renderHeaderCell() {
      return (
        <div className="bulk-editor-col-header" style={{ borderBottom: '3px solid #0EA5E9' }}>
          <span className="bulk-editor-col-header-key">site_name</span>
        </div>
      );
    },
    renderCell({ row }) {
      const name = resolveSiteName(row.site_code, ctx.siteRows);
      if (!name) {
        return <span className="text-[11px] italic text-slate-400">—</span>;
      }
      return (
        <span className="truncate text-[11px] font-medium text-slate-600" title={name}>
          {name}
        </span>
      );
    },
    cellClass: () => 'bulk-editor-readonly-cell',
  };
}

export function customizeGuardColumn(
  columnKey: string,
  base: Column<BulkEditorRow>,
  ctx: GuardColumnContext,
): Column<BulkEditorRow> {
  if (columnKey === 'site_code') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 120, 120),
      renderCell({ row }) {
        const code = normalizeSiteCode(row.site_code);
        if (!code) {
          return <span className="text-[11px] italic text-slate-400">Select site…</span>;
        }
        return <span className="font-bold tracking-wide text-slate-800">{code}</span>;
      },
      renderEditCell: ctx.renderSiteCodeEditCell,
    };
  }

  if (columnKey === 'assigned_sm_epf') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 140, 150),
      renderCell({ row }) {
        const epf = String(row.assigned_sm_epf ?? '').trim();
        if (!epf) {
          return <span className="text-[11px] text-slate-400">—</span>;
        }
        const auto = isGuardSmAutoAssigned(row);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-slate-800">{epf}</span>
            {auto ? (
              <span className="bulk-editor-sm-auto-badge" title="Auto-filled from site">
                Auto
              </span>
            ) : null}
          </span>
        );
      },
      renderEditCell: ctx.renderSmEpfEditCell,
    };
  }

  return base;
}

export { GUARD_SM_AUTO_FLAG };
