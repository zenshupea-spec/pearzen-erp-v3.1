'use client';

import type { ReactNode } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';

import { OPERATIONAL_GROUP_LABELS } from '../../../../packages/rank-pay-matrix';
import {
  WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS,
  WEB_EDITOR_RANK_SALARY_TYPE_OPTIONS,
  isRankFieldEditable,
  isRankRowLocked,
  normalizeRankCode,
  rankCodeCellClass,
} from '../../lib/bulk-editor-ranks-grid';
import type { BulkEditorRow } from '../../lib/bulk-roster-web-editor-spec';

export type RanksColumnContext = {
  duplicateRankCodeRowIds: ReadonlySet<string>;
  renderSalaryTypeEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
  renderOperationalGroupEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
};

export function customizeRanksColumn(
  columnKey: string,
  base: Column<BulkEditorRow>,
  ctx: RanksColumnContext,
): Column<BulkEditorRow> {
  const editable = (row: BulkEditorRow) => isRankFieldEditable(row, columnKey);

  if (columnKey === 'rank_id') {
    return {
      ...base,
      width: 100,
      editable: false,
      renderCell({ row }) {
        const id = String(row.rank_id ?? '').trim();
        if (!id) {
          return <span className="text-[10px] italic text-slate-400">New</span>;
        }
        return (
          <span className="truncate font-mono text-[10px] text-slate-500" title={id}>
            {id}
          </span>
        );
      },
      cellClass: () => 'bulk-editor-readonly-cell',
    };
  }

  if (columnKey === 'rank_code') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 100, 110),
      editable,
      renderCell({ row }) {
        const code = normalizeRankCode(row.rank_code);
        if (!code) {
          return <span className="text-[11px] italic text-slate-400">Required</span>;
        }
        const locked = isRankRowLocked(row);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="font-bold tracking-wide text-slate-800">{code}</span>
            {locked ? (
              <span className="bulk-editor-rank-locked-badge" title="System rank — read only">
                Locked
              </span>
            ) : null}
          </span>
        );
      },
      cellClass: (row) => rankCodeCellClass(row, ctx.duplicateRankCodeRowIds),
    };
  }

  if (columnKey === 'rank_title') {
    return {
      ...base,
      width: Math.max(typeof base.width === 'number' ? base.width : 160, 180),
      editable,
      renderCell({ row }) {
        const title = String(row.rank_title ?? '').trim();
        if (!title) {
          return <span className="text-[11px] italic text-slate-400">Title required</span>;
        }
        return <span className="font-medium text-slate-800">{title}</span>;
      },
    };
  }

  if (columnKey === 'basic_pay_lkr') {
    return {
      ...base,
      width: 120,
      editable,
      renderCell({ row }) {
        const pay = String(row.basic_pay_lkr ?? '').trim();
        const formatted = pay ? Number(pay).toLocaleString() : '0';
        return (
          <span className="font-mono text-xs font-semibold tabular-nums text-slate-800">
            {formatted}
          </span>
        );
      },
    };
  }

  if (columnKey === 'salary_type') {
    return {
      ...base,
      width: 100,
      editable,
      renderCell({ row }) {
        const value = String(row.salary_type ?? '').trim().toUpperCase();
        if (!value) {
          return <span className="text-[11px] text-slate-400">—</span>;
        }
        return <span className="font-semibold text-slate-800">{value}</span>;
      },
      renderEditCell: ctx.renderSalaryTypeEditCell,
    };
  }

  if (columnKey === 'operational_group') {
    return {
      ...base,
      width: 150,
      editable,
      renderCell({ row }) {
        const value = String(row.operational_group ?? '').trim().toUpperCase();
        if (!value) {
          return <span className="text-[11px] text-slate-400">—</span>;
        }
        const label =
          value in OPERATIONAL_GROUP_LABELS
            ? OPERATIONAL_GROUP_LABELS[value as keyof typeof OPERATIONAL_GROUP_LABELS]
            : value;
        return <span className="font-semibold text-slate-800">{label}</span>;
      },
      renderEditCell: ctx.renderOperationalGroupEditCell,
    };
  }

  return { ...base, editable };
}

export { WEB_EDITOR_RANK_OPERATIONAL_GROUP_OPTIONS, WEB_EDITOR_RANK_SALARY_TYPE_OPTIONS };
