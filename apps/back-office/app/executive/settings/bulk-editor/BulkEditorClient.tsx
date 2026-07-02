'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  ClipboardPaste,
  Download,
  Loader2,
  Plus,
  Redo2,
  Save,
  Table2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';

import BulkEditorApplyModal from '../../../../components/bulk-editor/BulkEditorApplyModal';
import BulkEditorGrid, {
  type BulkEditorFocusRequest,
} from '../../../../components/bulk-editor/BulkEditorGrid';
import BulkEditorTabs from '../../../../components/bulk-editor/BulkEditorTabs';
import BulkEditorValidationPanel from '../../../../components/bulk-editor/BulkEditorValidationPanel';
import { collectLiveSectorNames } from '../../../../lib/bulk-editor-head-office-grid';
import type { BulkEditorValidationIssue } from '../../../../lib/bulk-editor-validation';
import { parseBulkImportValidationError } from '../../../../lib/bulk-editor-validation';
import type { BulkImportSummary } from '../../../../lib/bulk-data-import';
import { BULK_IMPORT_INSTALMENT_PLAN_REMINDER } from '../../../../lib/bulk-data-import';
import {
  applyBulkEditorSnapshotAction,
  downloadBulkEditorWorkbookAction,
  validateBulkEditorSnapshotAction,
} from '../bulk-editor-actions';
import { snapshotDataSignature } from '../../../../lib/bulk-roster-web-editor-state';
import { useBulkEditorState } from './useBulkEditorState';

function resetValidationState(setters: {
  setValidationPassed: (value: boolean) => void;
  setValidationChecked: (value: boolean) => void;
  setValidationIssues: (issues: BulkEditorValidationIssue[]) => void;
  setValidationError: (value: string | null) => void;
}) {
  setters.setValidationPassed(false);
  setters.setValidationChecked(false);
  setters.setValidationIssues([]);
  setters.setValidationError(null);
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function triggerBase64WorkbookDownload(base64: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function formatApplySummary(summary: BulkImportSummary): string {
  const parts = [
    summary.employeesInserted || summary.employeesUpdated
      ? `${summary.employeesInserted} added · ${summary.employeesUpdated} employees updated`
      : null,
    summary.sitesInserted || summary.sitesUpdated
      ? `${summary.sitesInserted} sites added · ${summary.sitesUpdated} sites updated`
      : null,
    summary.smLinksUpserted ? `${summary.smLinksUpserted} SM links saved` : null,
    summary.debtBalancesUpdated ? `${summary.debtBalancesUpdated} debt balances updated` : null,
    summary.debtLedgersSeeded ? `${summary.debtLedgersSeeded} debt ledgers seeded` : null,
    summary.employeesWithOutstandingDebt
      ? `${summary.employeesWithOutstandingDebt} with outstanding debt`
      : null,
  ].filter(Boolean);
  const base = parts.length > 0 ? parts.join(' · ') : 'No rows changed';
  if (summary.debtLedgersSeeded > 0 || summary.employeesWithOutstandingDebt > 0) {
    return `${base}. ${BULK_IMPORT_INSTALMENT_PLAN_REMINDER}`;
  }
  return base;
}

export default function BulkEditorClient() {
  const {
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
  } = useBulkEditorState();

  const [pasteToast, setPasteToast] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationIssues, setValidationIssues] = useState<BulkEditorValidationIssue[]>([]);
  const [validationPassed, setValidationPassed] = useState(false);
  const [validationChecked, setValidationChecked] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<BulkEditorFocusRequest | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyTotpCode, setApplyTotpCode] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);
  const [applySummaryLine, setApplySummaryLine] = useState<string | null>(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadExcelError, setDownloadExcelError] = useState<string | null>(null);
  const validatedSnapshotSigRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const invalidateValidation = useCallback(() => {
    resetValidationState({
      setValidationPassed,
      setValidationChecked,
      setValidationIssues,
      setValidationError,
    });
    validatedSnapshotSigRef.current = null;
  }, []);

  const handlePasteComplete = useCallback((message: string) => {
    setPasteToast(message);
  }, []);

  const handleCopyComplete = useCallback((message: string) => {
    setPasteToast(message);
  }, []);

  const handleCopyRows = useCallback(async () => {
    const message = await copySelectedRows();
    if (message) setPasteToast(message);
  }, [copySelectedRows]);

  const handlePasteRows = useCallback(async () => {
    const message = await pasteRowsFromClipboard();
    if (message) setPasteToast(message);
  }, [pasteRowsFromClipboard]);

  useEffect(() => {
    if (!snapshot) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        if (!canUndo) return;
        event.preventDefault();
        undo();
        return;
      }
      if (key === 'z' && event.shiftKey) {
        if (!canRedo) return;
        event.preventDefault();
        redo();
        return;
      }
      if (key === 'y') {
        if (!canRedo) return;
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canRedo, canUndo, redo, snapshot, undo]);

  useEffect(() => {
    if (loading) {
      initialLoadDoneRef.current = false;
      return;
    }
    if (!snapshot) return;
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
      invalidateValidation();
      setApplySuccessMessage(null);
      setApplySummaryLine(null);
      setDownloadExcelError(null);
    }
  }, [invalidateValidation, loading, snapshot]);

  useEffect(() => {
    if (!snapshot || !validatedSnapshotSigRef.current) return;
    const sig = snapshotDataSignature(snapshot);
    if (sig !== validatedSnapshotSigRef.current) {
      setValidationPassed(false);
      validatedSnapshotSigRef.current = null;
    }
  }, [snapshot]);

  const closeApplyModal = useCallback(() => {
    setApplyModalOpen(false);
    setApplyTotpCode('');
    setApplyError(null);
  }, []);

  const openApplyModal = useCallback(() => {
    setApplyTotpCode('');
    setApplyError(null);
    setApplyModalOpen(true);
  }, []);

  const handleConfirmApply = useCallback(async () => {
    if (!snapshot) return;
    if (applyTotpCode.length !== 6) {
      setApplyError('Enter your current 6-digit authenticator code.');
      return;
    }

    setApplying(true);
    setApplyError(null);

    const result = await applyBulkEditorSnapshotAction({
      snapshot,
      totpCode: applyTotpCode,
      dirtyTabIds,
    });

    setApplying(false);

    if (!result.success) {
      setApplyError(result.error);
      if (result.validationErrors?.length) {
        setValidationIssues(result.validationErrors.map(parseBulkImportValidationError));
        setValidationPassed(false);
        setValidationChecked(true);
      }
      return;
    }

    closeApplyModal();
    markSnapshotSaved();
    validatedSnapshotSigRef.current = null;
    invalidateValidation();
    setValidationPassed(true);
    setValidationChecked(true);
    setValidationIssues([]);
    setApplySuccessMessage(result.message);
    setApplySummaryLine(formatApplySummary(result.summary));
  }, [applyTotpCode, closeApplyModal, dirtyTabIds, invalidateValidation, markSnapshotSaved, snapshot]);

  const runValidation = useCallback(async (): Promise<boolean> => {
    if (!snapshot) return false;
    setValidating(true);
    setValidationError(null);

    const result = await validateBulkEditorSnapshotAction(snapshot);
    setValidating(false);
    setValidationChecked(true);

    if (!result.success) {
      setValidationError(result.error);
      setValidationPassed(false);
      setValidationIssues([]);
      validatedSnapshotSigRef.current = null;
      return false;
    }

    setValidationIssues(result.issues);
    const passed = result.issues.length === 0;
    setValidationPassed(passed);
    validatedSnapshotSigRef.current = passed ? snapshotDataSignature(snapshot) : null;
    return passed;
  }, [snapshot]);

  const handleValidate = useCallback(async () => {
    await runValidation();
  }, [runValidation]);

  const handleSave = useCallback(async () => {
    if (!snapshot || !hasUnsavedChanges || applying || validating) return;

    if (validationPassed && validatedSnapshotSigRef.current) {
      openApplyModal();
      return;
    }

    const passed = await runValidation();
    if (passed) {
      openApplyModal();
    }
  }, [
    applying,
    hasUnsavedChanges,
    openApplyModal,
    runValidation,
    snapshot,
    validating,
    validationPassed,
  ]);

  const handleDownloadExcel = useCallback(async () => {
    if (!snapshot) return;
    setDownloadingExcel(true);
    setDownloadExcelError(null);

    try {
      const result = await downloadBulkEditorWorkbookAction(snapshot);
      if (!result.success) {
        setDownloadExcelError(result.error);
        return;
      }
      triggerBase64WorkbookDownload(result.base64, result.filename);
    } catch (err) {
      setDownloadExcelError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloadingExcel(false);
    }
  }, [snapshot]);

  const handleJumpToIssue = useCallback(
    (issue: BulkEditorValidationIssue) => {
      if (issue.tabId == null || issue.rowIndex == null) return;
      setActiveTab(issue.tabId);
      setFocusRequest({
        rowIdx: issue.rowIndex,
        columnKey: issue.columnKey ?? 'full_name',
        token: Date.now(),
      });
    },
    [setActiveTab],
  );

  useEffect(() => {
    if (!downloadExcelError) return;
    const timer = window.setTimeout(() => setDownloadExcelError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [downloadExcelError]);

  useEffect(() => {
    if (!pasteToast) return;
    const timer = window.setTimeout(() => setPasteToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [pasteToast]);

  useEffect(() => {
    if (!applySuccessMessage) return;
    const timer = window.setTimeout(() => {
      setApplySuccessMessage(null);
      setApplySummaryLine(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [applySuccessMessage]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const leave = window.confirm(
        'You have unsaved changes on one or more sheets. Close anyway?',
      );
      if (!leave) return;
    }

    if (typeof window !== 'undefined' && window.history.length <= 1) {
      window.location.href = '/executive/settings';
      return;
    }
    window.close();
    window.setTimeout(() => {
      window.location.href = '/executive/settings';
    }, 200);
  };

  const selectedCount = selectedRowIds.size;

  const sectorNames = useMemo(
    () => (snapshot ? collectLiveSectorNames(snapshot) : []),
    [snapshot],
  );

  return (
    <div className="fixed inset-0 z-[240] flex flex-col bg-[#eef2f6] text-slate-900 antialiased">
      <header className="flex shrink-0 items-center gap-4 border-b border-slate-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-50 text-sky-700">
            <Table2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase tracking-widest text-slate-900 sm:text-base">
              Bulk roster editor
            </h1>
            <p className="truncate text-xs font-medium text-slate-500">
              {loading
                ? 'Loading live roster…'
                : snapshot
                  ? `${totalRows.toLocaleString()} rows · loaded ${formatSavedAt(snapshot.savedAt)}${
                      hasUnsavedChanges ? ' · unsaved changes' : ''
                    }`
                  : 'Could not load roster'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!snapshot || loading || downloadingExcel || applying}
            onClick={() => void handleDownloadExcel()}
            title="Download current grids as Excel (.xlsx) — archive before apply"
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider sm:px-4 ${
              snapshot && !loading && !downloadingExcel && !applying
                ? 'border-sky-300 bg-white text-sky-800 shadow-sm hover:bg-sky-50'
                : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {downloadingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Download as Excel</span>
          </button>
          <button
            type="button"
            disabled={!snapshot || !hasUnsavedChanges || applying || validating}
            onClick={() => void handleSave()}
            title={
              validationPassed
                ? 'Save validated changes to the live roster'
                : 'Validate all sheets, then save to the live roster'
            }
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-wider sm:px-4 ${
              snapshot && hasUnsavedChanges && !applying && !validating
                ? 'border-emerald-300 bg-emerald-600 text-white shadow-sm hover:bg-emerald-500'
                : 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {applying || validating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 sm:px-4"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Close</span>
          </button>
        </div>
      </header>

      <BulkEditorTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rowCountForTab={countRowsForTab}
        isTabDirty={isTabDirty}
      />

      {pasteToast ? (
        <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[260] -translate-x-1/2 px-3 sm:top-[4.5rem]">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900 shadow-lg">
            {pasteToast}
          </div>
        </div>
      ) : null}

      {applySuccessMessage ? (
        <div className="absolute left-1/2 top-[4.75rem] z-[260] -translate-x-1/2 px-3 sm:top-[4.5rem]">
          <div className="max-w-lg rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs shadow-lg">
            <p className="flex items-center gap-2 font-black uppercase tracking-wider text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Apply complete
            </p>
            <p className="mt-1 font-semibold text-emerald-800">{applySuccessMessage}</p>
            {applySummaryLine ? (
              <p className="mt-1 font-medium text-emerald-700">{applySummaryLine}</p>
            ) : null}
            <button
              type="button"
              disabled={downloadingExcel}
              onClick={() => void handleDownloadExcel()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {downloadingExcel ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download backup xlsx
            </button>
          </div>
        </div>
      ) : null}

      {downloadExcelError ? (
        <div className="pointer-events-none absolute left-1/2 top-[4.75rem] z-[260] -translate-x-1/2 px-3 sm:top-[4.5rem]">
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-900 shadow-lg">
            {downloadExcelError}
          </div>
        </div>
      ) : null}

      <BulkEditorApplyModal
        open={applyModalOpen}
        applying={applying}
        totpCode={applyTotpCode}
        confirmError={applyError}
        dirtyTabIds={dirtyTabIds}
        onTotpChange={(value) => {
          setApplyError(null);
          setApplyTotpCode(value);
        }}
        onClose={closeApplyModal}
        onConfirm={() => void handleConfirmApply()}
      />

      <main className="min-h-0 flex-1 overflow-hidden p-3 sm:p-5">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            <p className="text-sm font-semibold text-slate-700">Loading employees, sites, and ranks…</p>
            <p className="text-xs font-medium text-slate-500">Large rosters can take up to a minute.</p>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-6 py-10 text-center shadow-sm">
            <AlertTriangle className="h-10 w-10 text-rose-600" />
            <div className="max-w-md space-y-2">
              <p className="text-sm font-black uppercase tracking-wide text-rose-900">
                Could not open editor
              </p>
              <p className="text-sm font-medium text-rose-800">{error}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void loadSnapshot()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-rose-500"
              >
                Retry
              </button>
              <Link
                href="/executive/settings"
                className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-900 hover:bg-rose-50"
              >
                Back to settings
              </Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && snapshot ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_12px_48px_-14px_rgba(15,23,42,0.12)]">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 sm:px-5">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Active sheet</p>
                <p className="text-base font-black text-slate-900">{activeMeta.label}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isTabDirty(activeTab) ? (
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800">
                    Unsaved
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={addRow}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add row
                </button>
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Redo2 className="h-3.5 w-3.5" />
                  Redo
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyRows()}
                  disabled={selectedCount === 0}
                  title="Copy selected rows (Ctrl+C)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Clipboard className="h-3.5 w-3.5 text-sky-600" />
                  Copy rows{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePasteRows()}
                  title="Paste rows from clipboard (Ctrl+V in grid)"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
                >
                  <ClipboardPaste className="h-3.5 w-3.5 text-sky-600" />
                  Paste rows
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedRows}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!hasUnsavedChanges || applying || validating}
                  title={
                    validationPassed
                      ? 'Save validated changes to the live roster'
                      : 'Validate all sheets, then save to the live roster'
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-600 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100"
                >
                  {applying || validating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save
                </button>
                <p className="w-full text-right text-xs font-semibold text-slate-500 sm:w-auto sm:pl-2">
                  {activeRows.length.toLocaleString()} row{activeRows.length === 1 ? '' : 's'} ·{' '}
                  {activeMeta.columns.length} columns · validate & save when ready
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <BulkEditorGrid
                tabId={activeTab}
                columnKeys={activeMeta.columns}
                rows={activeRows}
                onRowsChange={updateActiveRows}
                selectedRowIds={selectedRowIds}
                onSelectedRowIdsChange={setSelectedRowIds}
                sectorNames={
                  activeTab === 'head_office' || activeTab === 'sites' ? sectorNames : undefined
                }
                smEpfOptions={
                  activeTab === 'sites' || activeTab === 'guard' ? smEpfOptions : undefined
                }
                headOfficeRows={
                  (activeTab === 'sites' || activeTab === 'guard') && snapshot
                    ? snapshot.headOffice
                    : undefined
                }
                siteCodeOptions={activeTab === 'guard' ? siteCodeOptions : undefined}
                siteRows={activeTab === 'guard' && snapshot ? snapshot.sites : undefined}
                rankRows={snapshot?.ranks ?? []}
                onPasteComplete={handlePasteComplete}
                onCopyComplete={handleCopyComplete}
                focusRequest={focusRequest}
              />
            </div>

            <BulkEditorValidationPanel
              validating={validating}
              issues={validationIssues}
              validated={validationChecked}
              onValidate={() => void handleValidate()}
              onJumpToIssue={handleJumpToIssue}
            />

            {validationError ? (
              <p className="shrink-0 border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800 sm:px-5">
                {validationError}
              </p>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
