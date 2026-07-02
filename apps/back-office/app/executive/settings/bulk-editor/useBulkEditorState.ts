'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  pushBulkEditorHistory,
  redoBulkEditorHistory,
  type BulkEditorHistoryStacks,
  undoBulkEditorHistory,
  rowsEqual,
} from '../../../../lib/bulk-editor-history';
import {
  appendBulkEditorRowsFromClipboard,
  formatBulkEditorAppendPasteMessage,
  formatBulkEditorCopyMessage,
  serializeBulkEditorRowsToTsv,
} from '../../../../lib/bulk-editor-row-clipboard';
import {
  WEB_EDITOR_TAB_META,
  WEB_EDITOR_TAB_ORDER,
  type BulkEditorRow,
  type BulkEditorSnapshot,
  type BulkEditorTabId,
} from '../../../../lib/bulk-roster-web-editor-spec';
import {
  collectSiteCodeOptions,
  collectSmEpfOptions,
} from '../../../../lib/bulk-editor-cross-sheet';
import {
  cloneBulkEditorSnapshot,
  createEditorRowForTab,
  isTabDirtyComparedToBaseline,
  rowCountForTab,
  rowsForTab,
  updateTabRows,
} from '../../../../lib/bulk-roster-web-editor-state';
import { loadBulkEditorSnapshot } from '../bulk-editor-actions';

function emptyHistory(): BulkEditorHistoryStacks {
  return { undo: [], redo: [] };
}

export function useBulkEditorState() {
  const [activeTab, setActiveTabState] = useState<BulkEditorTabId>('head_office');
  const [snapshot, setSnapshot] = useState<BulkEditorSnapshot | null>(null);
  const [baseline, setBaseline] = useState<BulkEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const historyRef = useRef<BulkEditorHistoryStacks>(emptyHistory());
  const [historyVersion, setHistoryVersion] = useState(0);

  const bumpHistory = useCallback(() => {
    setHistoryVersion((value) => value + 1);
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = emptyHistory();
    bumpHistory();
  }, [bumpHistory]);

  const setActiveTab = useCallback(
    (tabId: BulkEditorTabId) => {
      setActiveTabState(tabId);
      setSelectedRowIds(new Set());
      resetHistory();
    },
    [resetHistory],
  );

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedRowIds(new Set());
    resetHistory();

    const result = await loadBulkEditorSnapshot();
    if (result.success) {
      setSnapshot(result.snapshot);
      setBaseline(cloneBulkEditorSnapshot(result.snapshot));
    } else {
      setSnapshot(null);
      setBaseline(null);
      setError(result.error);
    }
    setLoading(false);
  }, [resetHistory]);

  const isTabDirty = useCallback(
    (tabId: BulkEditorTabId) => {
      if (!snapshot || !baseline) return false;
      return isTabDirtyComparedToBaseline(snapshot, baseline, tabId);
    },
    [snapshot, baseline],
  );

  const dirtyTabIds = useMemo(
    () => WEB_EDITOR_TAB_ORDER.filter((tabId) => isTabDirty(tabId)),
    [isTabDirty],
  );

  const hasUnsavedChanges = dirtyTabIds.length > 0;

  const activeMeta = WEB_EDITOR_TAB_META[activeTab];
  const activeRows = snapshot ? rowsForTab(snapshot, activeTab) : [];

  const commitActiveRows = useCallback(
    (rows: BulkEditorRow[], options?: { recordHistory?: boolean }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const current = rowsForTab(prev, activeTab);
        const recordHistory = options?.recordHistory !== false;
        if (recordHistory && !rowsEqual(current, rows)) {
          historyRef.current = pushBulkEditorHistory(historyRef.current, current);
          bumpHistory();
        }
        return updateTabRows(prev, activeTab, rows);
      });
    },
    [activeTab, bumpHistory],
  );

  const updateActiveRows = commitActiveRows;

  const undo = useCallback(() => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      const current = rowsForTab(prev, activeTab);
      const result = undoBulkEditorHistory(historyRef.current, current);
      if (!result.rows) return prev;
      historyRef.current = result.stacks;
      bumpHistory();
      return updateTabRows(prev, activeTab, result.rows);
    });
  }, [activeTab, bumpHistory]);

  const redo = useCallback(() => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      const current = rowsForTab(prev, activeTab);
      const result = redoBulkEditorHistory(historyRef.current, current);
      if (!result.rows) return prev;
      historyRef.current = result.stacks;
      bumpHistory();
      return updateTabRows(prev, activeTab, result.rows);
    });
  }, [activeTab, bumpHistory]);

  const canUndo = useMemo(
    () => historyRef.current.undo.length > 0,
    [historyVersion],
  );
  const canRedo = useMemo(
    () => historyRef.current.redo.length > 0,
    [historyVersion],
  );

  const copySelectedRows = useCallback(async (): Promise<string | null> => {
    const selected = activeRows.filter((row) => selectedRowIds.has(row._rowId));
    if (selected.length === 0) return null;
    const tsv = serializeBulkEditorRowsToTsv(selected, activeMeta.columns);
    await navigator.clipboard.writeText(tsv);
    return formatBulkEditorCopyMessage(selected.length);
  }, [activeMeta.columns, activeRows, selectedRowIds]);

  const pasteRowsFromClipboard = useCallback(
    async (options?: {
      clipboardText?: string;
      selectedRowIdx?: number | null;
    }): Promise<string | null> => {
      if (!snapshot) return null;

      let clipboardText = options?.clipboardText?.trim() ?? '';
      if (!clipboardText) {
        try {
          clipboardText = (await navigator.clipboard.readText()).trim();
        } catch {
          return 'Could not read clipboard. Allow paste access or use Ctrl+V in the grid.';
        }
      }
      if (!clipboardText) return null;

      const startRowIdx =
        options?.selectedRowIdx ??
        (selectedRowIds.size > 0
          ? activeRows.findIndex((row) => selectedRowIds.has(row._rowId))
          : activeRows.length);

      const result = appendBulkEditorRowsFromClipboard({
        tabId: activeTab,
        columnKeys: activeMeta.columns,
        rows: activeRows,
        clipboardText,
        createRow: () => createEditorRowForTab(activeTab),
        headOfficeRows: snapshot.headOffice,
        siteRows: snapshot.sites,
        selectedRowIds,
        selectedRowIdx: startRowIdx >= 0 ? startRowIdx : activeRows.length,
      });

      if (result.pastedRows === 0 || result.pastedColumns === 0) {
        return 'Nothing to paste — copy rows from Excel or select cells first.';
      }

      commitActiveRows(result.rows);
      const appended = startRowIdx >= activeRows.length;
      return formatBulkEditorAppendPasteMessage(
        result.pastedRows,
        result.pastedColumns,
        appended,
      );
    },
    [
      activeMeta.columns,
      activeRows,
      activeTab,
      commitActiveRows,
      selectedRowIds,
      snapshot,
    ],
  );

  const addRow = useCallback(() => {
    const blank = createEditorRowForTab(activeTab);
    commitActiveRows([...activeRows, blank]);
    setSelectedRowIds(new Set([blank._rowId]));
  }, [activeRows, activeTab, commitActiveRows]);

  const deleteSelectedRows = useCallback(() => {
    if (selectedRowIds.size === 0) return;
    const next = activeRows.filter((row) => !selectedRowIds.has(row._rowId));
    commitActiveRows(next);
    setSelectedRowIds(new Set());
  }, [activeRows, commitActiveRows, selectedRowIds]);

  const countRowsForTab = useCallback(
    (tabId: BulkEditorTabId) => (snapshot ? rowCountForTab(snapshot, tabId) : null),
    [snapshot],
  );

  const totalRows = useMemo(() => {
    if (!snapshot) return 0;
    return WEB_EDITOR_TAB_ORDER.reduce(
      (sum, tabId) => sum + rowCountForTab(snapshot, tabId),
      0,
    );
  }, [snapshot]);

  const smEpfOptions = useMemo(
    () => (snapshot ? collectSmEpfOptions(snapshot.headOffice) : []),
    [snapshot],
  );

  const siteCodeOptions = useMemo(
    () => (snapshot ? collectSiteCodeOptions(snapshot.sites) : []),
    [snapshot],
  );

  const markSnapshotSaved = useCallback(() => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      const saved = { ...prev, savedAt: new Date().toISOString() };
      setBaseline(cloneBulkEditorSnapshot(saved));
      return saved;
    });
    resetHistory();
  }, [resetHistory]);

  return {
    activeTab,
    setActiveTab,
    snapshot,
    loading,
    error,
    loadSnapshot,
    activeMeta,
    activeRows,
    updateActiveRows,
    isTabDirty,
    dirtyTabIds,
    hasUnsavedChanges,
    selectedRowIds,
    setSelectedRowIds,
    addRow,
    deleteSelectedRows,
    copySelectedRows,
    pasteRowsFromClipboard,
    undo,
    redo,
    canUndo,
    canRedo,
    countRowsForTab,
    totalRows,
    smEpfOptions,
    siteCodeOptions,
    markSnapshotSaved,
  };
}

export type BulkEditorState = ReturnType<typeof useBulkEditorState>;
