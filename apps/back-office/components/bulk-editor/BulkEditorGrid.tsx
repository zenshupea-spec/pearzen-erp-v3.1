'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type ReactNode } from 'react';
import {
  DataGrid,
  SelectColumn,
  renderTextEditor,
  type CellMouseArgs,
  type CellMouseEvent,
  type Column,
  type ColumnOrColumnGroup,
  type DataGridHandle,
  type RenderEditCellProps,
  type RenderHeaderCellProps,
  type RowsChangeData,
} from 'react-data-grid';

import 'react-data-grid/lib/styles.css';
import './bulk-editor-grid.css';

import {
  applyHeadOfficeRowsChange,
} from '../../lib/bulk-editor-head-office-grid';
import { applyCafeRowsChange } from '../../lib/bulk-editor-cafe-grid';
import {
  applySitesRowsChange,
  findDuplicateSiteCodeRowIds,
} from '../../lib/bulk-editor-sites-grid';
import { applyGuardRowsChange } from '../../lib/bulk-editor-guard-grid';
import {
  applyRanksRowsChange,
  findDuplicateRankCodeRowIds,
} from '../../lib/bulk-editor-ranks-grid';
import { cafeCorporateGroupColumn } from './bulk-editor-cafe-columns';
import {
  customizeGuardColumn,
  guardCorporateGroupColumn,
  guardSiteNameHintColumn,
  type GuardColumnContext,
} from './bulk-editor-guard-columns';
import { BulkEditorSelectEditor } from './BulkEditorSelectEditor';
import { BulkEditorComboboxEditor } from './BulkEditorComboboxEditor';
import {
  customizeHeadOfficeColumn,
  type HeadOfficeSectorColumnContext,
} from './bulk-editor-head-office-columns';
import {
  customizeSitesColumn,
  type SitesColumnContext,
} from './bulk-editor-sites-columns';
import {
  customizeRanksColumn,
  type RanksColumnContext,
} from './bulk-editor-ranks-columns';
import {
  WEB_EDITOR_COLUMN_GROUP_STYLES,
  WEB_EDITOR_SECTOR_NAME_COLUMN,
  columnGroupForWebEditorColumn,
  type BulkEditorRow,
  type BulkEditorTabId,
  type WebEditorColumnGroupStyle,
} from '../../lib/bulk-roster-web-editor-spec';
import type { MigrationColumnGroupId } from '../../lib/bulk-data-workbook';
import {
  applyBulkEditorPaste,
  BULK_EDITOR_ROW_NUM_KEY,
  formatBulkEditorPasteMessage,
  isBulkEditorNonPasteableColumnKey,
} from '../../lib/bulk-editor-paste';
import {
  formatBulkEditorAppendPasteMessage,
  formatBulkEditorCopyMessage,
  resolveBulkEditorPasteStartRowIdx,
  serializeBulkEditorRowsToTsv,
} from '../../lib/bulk-editor-row-clipboard';
import { createEditorRowForTab } from '../../lib/bulk-roster-web-editor-state';
import { BulkEditorSectorCombobox } from './BulkEditorSectorCombobox';
import {
  allowsBulkEditorDropdownCombobox,
  isBulkEditorDropdownColumn,
  resolveBulkEditorDropdownOptions,
  type BulkEditorDropdownContext,
} from '../../lib/bulk-editor-dropdown-columns';

export type WorkforceDropdownColumnContext = {
  renderDropdownEditCell: (props: RenderEditCellProps<BulkEditorRow>) => ReactNode;
};

export type BulkEditorGridProps = {
  tabId: BulkEditorTabId;
  columnKeys: readonly string[];
  rows: BulkEditorRow[];
  onRowsChange: (rows: BulkEditorRow[]) => void;
  readOnlyColumns?: readonly string[];
  groupColors?: Record<MigrationColumnGroupId, WebEditorColumnGroupStyle>;
  selectedRowIds?: ReadonlySet<string>;
  onSelectedRowIdsChange?: (ids: ReadonlySet<string>) => void;
  /** Head Office / Sites — sector combobox options. */
  sectorNames?: readonly string[];
  /** Sites — SM EPF dropdown (from Head Office SM rows). */
  smEpfOptions?: readonly string[];
  /** Sites / Guards — apply SM→sector or site→SM linkage. */
  headOfficeRows?: BulkEditorRow[];
  /** Guards — live site_code dropdown options. */
  siteCodeOptions?: readonly string[];
  /** Guards — resolve site_name hint from Sites tab. */
  siteRows?: BulkEditorRow[];
  /** Ranks tab rows — rank dropdown source for workforce sheets. */
  rankRows?: BulkEditorRow[];
  /** Paste summary toast (step 12). */
  onPasteComplete?: (message: string) => void;
  /** Copy summary toast. */
  onCopyComplete?: (message: string) => void;
  /** Jump-to-cell after validation error click (step 13). */
  focusRequest?: BulkEditorFocusRequest | null;
};

export type BulkEditorFocusRequest = {
  rowIdx: number;
  columnKey: string;
  token: number;
};

const ROW_NUM_KEY = BULK_EDITOR_ROW_NUM_KEY;

function flattenColumnKeys(
  columns: readonly ColumnOrColumnGroup<BulkEditorRow>[],
): string[] {
  const keys: string[] = [];
  for (const col of columns) {
    if ('children' in col && col.children) {
      for (const child of col.children) {
        keys.push(String(child.key));
      }
      continue;
    }
    if ('key' in col && col.key != null) {
      keys.push(String(col.key));
    }
  }
  return keys;
}

function groupHeaderStyle(groupId: MigrationColumnGroupId | undefined): CSSProperties {
  const palette = groupId ? WEB_EDITOR_COLUMN_GROUP_STYLES[groupId] : undefined;
  if (!palette) {
    return { backgroundColor: '#64748B', color: '#FFFFFF' };
  }
  return {
    backgroundColor: `#${palette.fill}`,
    color: `#${palette.font}`,
  };
}

function columnHeaderStyle(groupId: MigrationColumnGroupId | undefined): CSSProperties {
  const palette = groupId ? WEB_EDITOR_COLUMN_GROUP_STYLES[groupId] : undefined;
  if (!palette) {
    return { borderBottom: '3px solid #64748B' };
  }
  return { borderBottom: `3px solid #${palette.fill}` };
}

function BulkEditorColumnHeader({
  column,
  tabId,
}: {
  column: { key: string };
  tabId: BulkEditorTabId;
}) {
  const groupId = columnGroupForWebEditorColumn(tabId, column.key);
  const palette = groupId ? WEB_EDITOR_COLUMN_GROUP_STYLES[groupId] : undefined;
  const label =
    (tabId === 'head_office' || tabId === 'sites') &&
    column.key === WEB_EDITOR_SECTOR_NAME_COLUMN
      ? 'sector_name'
      : column.key;

  return (
    <div className="bulk-editor-col-header" style={columnHeaderStyle(groupId)}>
      {palette ? (
        <span className="sr-only">{palette.label}</span>
      ) : null}
      <span className="bulk-editor-col-header-key">{label}</span>
    </div>
  );
}

function makeLeafColumn(
  tabId: BulkEditorTabId,
  columnKey: string,
  readOnly: boolean,
  headOfficeCtx?: HeadOfficeSectorColumnContext,
  sitesCtx?: SitesColumnContext,
  guardCtx?: GuardColumnContext,
  ranksCtx?: RanksColumnContext,
  dropdownCtx?: WorkforceDropdownColumnContext,
): Column<BulkEditorRow> {
  const groupId = columnGroupForWebEditorColumn(tabId, columnKey);
  let column: Column<BulkEditorRow> = {
    key: columnKey,
    name: columnKey,
    width: Math.min(220, Math.max(108, columnKey.length * 9 + 48)),
    resizable: true,
    editable: !readOnly,
    renderHeaderCell(props: RenderHeaderCellProps<BulkEditorRow>) {
      return <BulkEditorColumnHeader column={props.column} tabId={tabId} />;
    },
    renderEditCell: readOnly ? undefined : renderTextEditor,
    cellClass: readOnly ? () => 'bulk-editor-readonly-cell' : undefined,
    headerCellClass: groupId ? `bulk-editor-hdr-col-${groupId}` : undefined,
  };

  if (tabId === 'head_office' && headOfficeCtx) {
    column = customizeHeadOfficeColumn(columnKey, column, headOfficeCtx);
  } else if (tabId === 'sites' && sitesCtx) {
    column = customizeSitesColumn(columnKey, column, sitesCtx);
  } else if (tabId === 'guard' && guardCtx) {
    column = customizeGuardColumn(columnKey, column, guardCtx);
  } else if (tabId === 'ranks' && ranksCtx) {
    column = customizeRanksColumn(columnKey, column, ranksCtx);
  }

  if (
    dropdownCtx &&
    isBulkEditorDropdownColumn(columnKey, tabId) &&
    !readOnly &&
    column.renderEditCell === renderTextEditor
  ) {
    column = {
      ...column,
      renderEditCell: dropdownCtx.renderDropdownEditCell,
    };
  }

  return column;
}

function buildGroupedColumns(
  tabId: BulkEditorTabId,
  columnKeys: readonly string[],
  readOnlySet: Set<string>,
  groupColors: Record<MigrationColumnGroupId, WebEditorColumnGroupStyle>,
  selectionEnabled: boolean,
  headOfficeCtx?: HeadOfficeSectorColumnContext,
  sitesCtx?: SitesColumnContext,
  guardCtx?: GuardColumnContext,
  ranksCtx?: RanksColumnContext,
  workforceDropdownCtx?: WorkforceDropdownColumnContext,
): readonly ColumnOrColumnGroup<BulkEditorRow>[] {
  const columns: ColumnOrColumnGroup<BulkEditorRow>[] = [];

  if (selectionEnabled) {
    columns.push(SelectColumn);
  }

  columns.push({
    key: ROW_NUM_KEY,
    name: '#',
    width: 44,
    minWidth: 44,
    maxWidth: 44,
    frozen: true,
    resizable: false,
    editable: false,
    renderCell({ rowIdx }) {
      return <span className="bulk-editor-row-num">{rowIdx + 1}</span>;
    },
  });

  if (tabId === 'cafe') {
    columns.push(cafeCorporateGroupColumn());
  }

  if (tabId === 'guard' && guardCtx) {
    columns.push(guardCorporateGroupColumn());
    columns.push(guardSiteNameHintColumn(guardCtx));
  }

  let index = 0;
  while (index < columnKeys.length) {
    const startKey = columnKeys[index];
    const groupId = columnGroupForWebEditorColumn(tabId, startKey);
    const keysInGroup: string[] = [startKey];
    index += 1;

    while (index < columnKeys.length) {
      const nextKey = columnKeys[index];
      if (columnGroupForWebEditorColumn(tabId, nextKey) !== groupId) break;
      keysInGroup.push(nextKey);
      index += 1;
    }

    const leafColumns = keysInGroup.map((key) =>
      makeLeafColumn(
        tabId,
        key,
        readOnlySet.has(key),
        headOfficeCtx,
        sitesCtx,
        guardCtx,
        ranksCtx,
        workforceDropdownCtx,
      ),
    );

    if (keysInGroup.length === 1 && !groupId) {
      columns.push(leafColumns[0]!);
      continue;
    }

    const label = groupId ? groupColors[groupId]?.label ?? 'Columns' : 'Columns';
    columns.push({
      name: (
        <span className="bulk-editor-group-header" style={groupHeaderStyle(groupId)}>
          {label}
        </span>
      ),
      headerCellClass: groupId ? `bulk-editor-hdr-group-${groupId}` : undefined,
      children: leafColumns,
    });
  }

  return columns;
}

export default function BulkEditorGrid({
  tabId,
  columnKeys,
  rows,
  onRowsChange,
  readOnlyColumns = [],
  groupColors = WEB_EDITOR_COLUMN_GROUP_STYLES,
  selectedRowIds,
  onSelectedRowIdsChange,
  sectorNames = [],
  smEpfOptions = [],
  headOfficeRows = [],
  siteCodeOptions = [],
  siteRows = [],
  rankRows = [],
  onPasteComplete,
  focusRequest = null,
  onCopyComplete,
}: BulkEditorGridProps) {
  const gridRef = useRef<DataGridHandle>(null);
  const readOnlySet = useMemo(() => new Set(readOnlyColumns), [readOnlyColumns]);
  const selectionEnabled = onSelectedRowIdsChange != null;
  const selectedCellRef = useRef<{ rowIdx: number; columnKey: string } | null>(null);
  const enumEditModeRef = useRef<'select' | 'combobox'>('select');
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [touchedSectorRowIds, setTouchedSectorRowIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const markSectorTouched = useCallback((rowId: string) => {
    setTouchedSectorRowIds((prev) => {
      if (prev.has(rowId)) return prev;
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
  }, []);

  const dropdownContext = useMemo(
    (): BulkEditorDropdownContext => ({
      tabId,
      rows,
      rankRows,
      siteRows,
      headOfficeRows,
      smEpfOptions,
      siteCodeOptions,
      sectorNames,
    }),
    [
      headOfficeRows,
      rankRows,
      rows,
      sectorNames,
      siteCodeOptions,
      siteRows,
      smEpfOptions,
      tabId,
    ],
  );

  const renderDropdownEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const columnKey = String(props.column.key);
      const options = resolveBulkEditorDropdownOptions(columnKey, dropdownContext);
      if (
        enumEditModeRef.current === 'combobox' &&
        allowsBulkEditorDropdownCombobox(columnKey, tabId)
      ) {
        return <BulkEditorComboboxEditor {...props} options={options} />;
      }
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          allowEmpty
          placeholder="Select…"
        />
      );
    },
    [dropdownContext, tabId],
  );

  const renderSectorEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions(
        WEB_EDITOR_SECTOR_NAME_COLUMN,
        dropdownContext,
      );
      if (enumEditModeRef.current === 'combobox') {
        return (
          <BulkEditorSectorCombobox
            {...props}
            sectorNames={sectorNames}
            onSectorBlur={markSectorTouched}
          />
        );
      }
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          placeholder="Select sector…"
          onRowChange={(nextRow, commit) => {
            props.onRowChange(nextRow, commit);
            if (commit) markSectorTouched(nextRow._rowId);
          }}
        />
      );
    },
    [dropdownContext, markSectorTouched, sectorNames],
  );

  const headOfficeCtx = useMemo((): HeadOfficeSectorColumnContext | undefined => {
    if (tabId !== 'head_office') return undefined;
    return {
      touchedSectorRowIds,
      renderSectorEditCell,
    };
  }, [renderSectorEditCell, tabId, touchedSectorRowIds]);

  const duplicateSiteCodeRowIds = useMemo(
    () => (tabId === 'sites' ? findDuplicateSiteCodeRowIds(rows) : new Set<string>()),
    [rows, tabId],
  );

  const renderSmEpfEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions('assigned_sm_epf', dropdownContext);
      if (
        enumEditModeRef.current === 'combobox' &&
        allowsBulkEditorDropdownCombobox('assigned_sm_epf', tabId)
      ) {
        return <BulkEditorComboboxEditor {...props} options={options} />;
      }
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          placeholder="Select SM EPF…"
        />
      );
    },
    [dropdownContext, tabId],
  );

  const sitesCtx = useMemo((): SitesColumnContext | undefined => {
    if (tabId !== 'sites') return undefined;
    return {
      smEpfOptions,
      duplicateSiteCodeRowIds,
      renderSectorEditCell,
      renderSmEpfEditCell,
    };
  }, [
    duplicateSiteCodeRowIds,
    renderSectorEditCell,
    renderSmEpfEditCell,
    smEpfOptions,
    tabId,
  ]);

  const renderGuardSmEpfEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions('assigned_sm_epf', dropdownContext);
      if (
        enumEditModeRef.current === 'combobox' &&
        allowsBulkEditorDropdownCombobox('assigned_sm_epf', tabId)
      ) {
        return <BulkEditorComboboxEditor {...props} options={options} />;
      }
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          placeholder="Select SM EPF…"
        />
      );
    },
    [dropdownContext, tabId],
  );

  const renderSiteCodeEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions('site_code', dropdownContext);
      if (
        enumEditModeRef.current === 'combobox' &&
        allowsBulkEditorDropdownCombobox('site_code', tabId)
      ) {
        return <BulkEditorComboboxEditor {...props} options={options} />;
      }
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          placeholder="Select site…"
        />
      );
    },
    [dropdownContext, tabId],
  );

  const guardCtx = useMemo((): GuardColumnContext | undefined => {
    if (tabId !== 'guard') return undefined;
    return {
      siteCodeOptions,
      siteRows,
      renderSiteCodeEditCell,
      renderSmEpfEditCell: renderGuardSmEpfEditCell,
    };
  }, [renderGuardSmEpfEditCell, renderSiteCodeEditCell, siteCodeOptions, siteRows, tabId]);

  const duplicateRankCodeRowIds = useMemo(
    () => (tabId === 'ranks' ? findDuplicateRankCodeRowIds(rows) : new Set<string>()),
    [rows, tabId],
  );

  const renderSalaryTypeEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions('salary_type', dropdownContext);
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          allowEmpty={false}
          placeholder="Type…"
        />
      );
    },
    [dropdownContext],
  );

  const renderOperationalGroupEditCell = useCallback(
    (props: RenderEditCellProps<BulkEditorRow>) => {
      const options = resolveBulkEditorDropdownOptions('operational_group', dropdownContext);
      return (
        <BulkEditorSelectEditor
          {...props}
          options={options}
          allowEmpty={false}
          placeholder="Group…"
        />
      );
    },
    [dropdownContext],
  );

  const ranksCtx = useMemo((): RanksColumnContext | undefined => {
    if (tabId !== 'ranks') return undefined;
    return {
      duplicateRankCodeRowIds,
      renderSalaryTypeEditCell,
      renderOperationalGroupEditCell,
    };
  }, [
    duplicateRankCodeRowIds,
    renderOperationalGroupEditCell,
    renderSalaryTypeEditCell,
    tabId,
  ]);

  const workforceDropdownCtx = useMemo(
    (): WorkforceDropdownColumnContext => ({
      renderDropdownEditCell,
    }),
    [renderDropdownEditCell],
  );

  const columns = useMemo(
    () =>
      buildGroupedColumns(
        tabId,
        columnKeys,
        readOnlySet,
        groupColors,
        selectionEnabled,
        headOfficeCtx,
        sitesCtx,
        guardCtx,
        ranksCtx,
        workforceDropdownCtx,
      ),
    [
      tabId,
      columnKeys,
      readOnlySet,
      groupColors,
      selectionEnabled,
      headOfficeCtx,
      sitesCtx,
      guardCtx,
      ranksCtx,
      workforceDropdownCtx,
    ],
  );

  useEffect(() => {
    if (!focusRequest || !gridRef.current) return;
    const columnKeysFlat = flattenColumnKeys(columns);
    let idx = columnKeysFlat.indexOf(focusRequest.columnKey);
    if (idx < 0) {
      idx = columnKeysFlat.findIndex((key) => !isBulkEditorNonPasteableColumnKey(key));
    }
    if (idx < 0) return;

    gridRef.current.scrollToCell({ rowIdx: focusRequest.rowIdx, idx });
    gridRef.current.selectCell({ rowIdx: focusRequest.rowIdx, idx });
  }, [columns, focusRequest]);

  const handleRowsChange = (nextRows: BulkEditorRow[], data: RowsChangeData<BulkEditorRow>) => {
    let normalized = nextRows;
    if (tabId === 'head_office') {
      normalized = applyHeadOfficeRowsChange(nextRows, data, rankRows);
    } else if (tabId === 'cafe') {
      normalized = applyCafeRowsChange(nextRows, data, rankRows);
    } else if (tabId === 'sites') {
      normalized = applySitesRowsChange(nextRows, data, headOfficeRows);
    } else if (tabId === 'guard') {
      normalized = applyGuardRowsChange(nextRows, data, siteRows, headOfficeRows, rankRows);
    } else if (tabId === 'ranks') {
      normalized = applyRanksRowsChange(nextRows, data);
    }
    onRowsChange(normalized);
  };

  const handleSelectedRowsChange = (next: Set<string>) => {
    onSelectedRowIdsChange?.(next);
  };

  const handleSelectedCellChange = useCallback(
    (args: { rowIdx: number; column: { key: string } }) => {
      selectedCellRef.current = {
        rowIdx: args.rowIdx,
        columnKey: args.column.key,
      };
    },
    [],
  );

  const isColumnEditable = useCallback((column: Column<BulkEditorRow>, row: BulkEditorRow) => {
    if (typeof column.editable === 'function') return column.editable(row);
    return Boolean(column.editable);
  }, []);

  const handleCellClick = useCallback(
    (args: CellMouseArgs<BulkEditorRow>, _event: CellMouseEvent) => {
      if (!isColumnEditable(args.column, args.row)) return;
      const columnKey = String(args.column.key);
      if (!isBulkEditorDropdownColumn(columnKey, tabId)) return;

      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        enumEditModeRef.current = 'select';
        args.selectCell(true);
      }, 220);
    },
    [isColumnEditable, tabId],
  );

  const handleCellDoubleClick = useCallback(
    (args: CellMouseArgs<BulkEditorRow>, event: CellMouseEvent) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }

      const columnKey = String(args.column.key);
      if (!allowsBulkEditorDropdownCombobox(columnKey, tabId)) return;
      if (!isColumnEditable(args.column, args.row)) return;

      enumEditModeRef.current = 'combobox';
      event.preventGridDefault();
      args.selectCell(true);
    },
    [isColumnEditable, tabId],
  );

  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const clipboardText = event.clipboardData.getData('text/plain');
      if (!clipboardText.trim()) return;

      const selected = selectedCellRef.current;
      const startRowIdx = resolveBulkEditorPasteStartRowIdx(
        rows,
        selectedRowIds ?? new Set(),
        selected?.rowIdx,
      );
      const startColumnKey =
        selected && !isBulkEditorNonPasteableColumnKey(selected.columnKey)
          ? selected.columnKey
          : columnKeys[0] ?? '';

      if (!startColumnKey) return;

      event.preventDefault();
      event.stopPropagation();

      const result = applyBulkEditorPaste({
        tabId,
        columnKeys,
        rows,
        startRowIdx,
        startColumnKey,
        clipboardText,
        createRow: () => createEditorRowForTab(tabId),
        headOfficeRows,
        siteRows,
      });

      if (result.pastedRows === 0 || result.pastedColumns === 0) return;

      onRowsChange(result.rows);
      const appended = startRowIdx >= rows.length;
      onPasteComplete?.(
        appended
          ? formatBulkEditorAppendPasteMessage(
              result.pastedRows,
              result.pastedColumns,
              true,
            )
          : formatBulkEditorPasteMessage(result.pastedRows, result.pastedColumns),
      );
    },
    [
      columnKeys,
      headOfficeRows,
      onPasteComplete,
      onRowsChange,
      rows,
      selectedRowIds,
      siteRows,
      tabId,
    ],
  );

  const handleCopyCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!selectionEnabled || !selectedRowIds || selectedRowIds.size === 0) return;

      const selected = rows.filter((row) => selectedRowIds.has(row._rowId));
      if (selected.length === 0) return;

      const tsv = serializeBulkEditorRowsToTsv(selected, columnKeys);
      event.clipboardData.setData('text/plain', tsv);
      event.preventDefault();
      onCopyComplete?.(formatBulkEditorCopyMessage(selected.length));
    },
    [columnKeys, onCopyComplete, rows, selectedRowIds, selectionEnabled],
  );

  return (
    <div
      className="bulk-editor-grid min-h-0 flex-1 overflow-hidden rounded-b-2xl outline-none"
      tabIndex={0}
      onPasteCapture={handlePasteCapture}
      onCopyCapture={handleCopyCapture}
    >
      <DataGrid
        ref={gridRef}
        className="rdg-light h-full"
        style={{ blockSize: '100%' }}
        columns={columns}
        rows={rows}
        rowKeyGetter={(row) => row._rowId}
        onRowsChange={handleRowsChange}
        onSelectedCellChange={handleSelectedCellChange}
        onCellClick={handleCellClick}
        onCellDoubleClick={handleCellDoubleClick}
        selectedRows={selectionEnabled ? selectedRowIds : undefined}
        onSelectedRowsChange={selectionEnabled ? handleSelectedRowsChange : undefined}
        defaultColumnOptions={{
          minWidth: 96,
          resizable: true,
          sortable: false,
        }}
      />
    </div>
  );
}
