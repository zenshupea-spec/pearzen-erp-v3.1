'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Info,
  Lock,
  ShieldCheck,
  Upload,
  Loader2,
  CheckCircle2,
  X,
} from 'lucide-react';

import {
  MIGRATION_SHEET_CAFE,
  MIGRATION_SHEET_GUARD,
  MIGRATION_SHEET_HEAD_OFFICE,
  MIGRATION_SHEET_INACTIVE,
  MIGRATION_SHEET_RESIGNED,
  MIGRATION_SHEET_SITES,
  MIGRATION_SHEET_SM,
  MIGRATION_SHEET_TEMP_GUARDS,
} from '../../../lib/bulk-data-workbook';
import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import { uploadBulkDataWorkbook } from './bulk-import-actions';

const MIGRATION_WORKBOOK_SHEETS: { name: string; description: string }[] = [
  { name: MIGRATION_SHEET_HEAD_OFFICE, description: 'Head office staff (MD/OD excluded — edit in MNR)' },
  { name: MIGRATION_SHEET_CAFE, description: 'Café branch staff (fixed group)' },
  { name: MIGRATION_SHEET_GUARD, description: 'Deployed guards — site_code + assigned SM' },
  { name: MIGRATION_SHEET_SM, description: 'Sector managers — feeds SM dropdown lists' },
  { name: MIGRATION_SHEET_SITES, description: 'Client sites, contracts, GPS, rate matrix' },
  { name: MIGRATION_SHEET_RESIGNED, description: 'Former staff — date_resigned required' },
  { name: MIGRATION_SHEET_INACTIVE, description: 'Reserve / inactive guards (e.g. bench r01)' },
  { name: MIGRATION_SHEET_TEMP_GUARDS, description: 'Temp pool (site t / TEMPORY) + parent EPF' },
];

const BULK_EXPORT_URL = '/api/executive/bulk-migration-workbook?mode=export';
const BULK_EDITOR_URL = '/executive/settings/bulk-editor';

export default function BulkDataImportPanel() {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadHint, setDownloadHint] = useState<string | null>(null);
  const exportFrameRef = useRef<HTMLIFrameElement>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const clearUploadFeedback = () => {
    setUploadMessage(null);
    setUploadErrors([]);
    setUploadSuccess(false);
  };

  const handleExportClick = () => {
    setDownloadError(null);
    setDownloadHint(
      'Building export — large rosters can take up to a minute. Your browser should prompt to save the file shortly.',
    );
    setDownloading(true);

    const frame = exportFrameRef.current;
    if (!frame) {
      setDownloading(false);
      setDownloadError('Could not start export. Use the direct link below.');
      return;
    }

    frame.onload = () => {
      setDownloading(false);
      try {
        const bodyText = frame.contentDocument?.body?.innerText?.trim();
        if (bodyText?.startsWith('{')) {
          const payload = JSON.parse(bodyText) as { error?: string };
          if (payload.error) {
            setDownloadError(payload.error);
            setDownloadHint(null);
          }
        }
      } catch {
        // Binary workbook download — iframe stays blank.
      }
    };

    window.setTimeout(() => setDownloading(false), 120_000);
    frame.src = BULK_EXPORT_URL;
  };

  const closeConfirmModal = () => {
    setPendingFile(null);
    setTotpCode('');
    setConfirmError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearUploadFeedback();
    setPendingFile(file);
    setTotpCode('');
    setConfirmError(null);
  };

  const confirmUpload = async () => {
    if (!pendingFile) return;
    if (totpCode.length !== 6) {
      setConfirmError('Enter your current 6-digit authenticator code.');
      return;
    }

    setConfirmError(null);
    setUploading(true);
    clearUploadFeedback();

    try {
      const fd = new FormData();
      fd.set('file', pendingFile);
      fd.set('totpCode', totpCode);
      const result = await uploadBulkDataWorkbook(fd);
      if (result.success) {
        setUploadSuccess(true);
        setUploadMessage(result.message);
        closeConfirmModal();
      } else {
        setUploadSuccess(false);
        setUploadMessage(result.error);
        setUploadErrors(result.validationErrors ?? []);
        setConfirmError(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setUploadMessage(message);
      setConfirmError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
              <FileSpreadsheet className="h-5 w-5 text-violet-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Legacy migration workbook</h3>
              <p className="text-sm font-medium text-slate-600">
                One-time import from your old database — not for day-to-day roster edits
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-1.5 text-xs font-bold text-indigo-800">
            <Lock className="h-3.5 w-3.5" />
            MD only
          </span>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-violet-200/80 bg-violet-50/60 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
              <div className="text-sm font-semibold text-violet-900 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-violet-700">Phase A</p>
                <p>
                  Prepare bulk edits using either path:{' '}
                  <strong>Export live roster (Excel)</strong> — download current data and edit offline — or{' '}
                  <strong>Open bulk editor (browser)</strong> — edit in Pearzen with live dropdowns and
                  column paste. Both cover workforce, sites, and opening debt balances.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" />
              <div className="text-sm font-semibold text-indigo-950 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-indigo-700">Phase B</p>
                <p>
                  Upload the completed workbook <strong>once</strong> (you can migrate in batches).
                  After go-live, add or edit staff in <strong>MNR</strong> — do not use bulk upload for
                  routine changes.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            <div className="text-sm font-semibold text-emerald-950 space-y-2">
              <p>
                <strong>Merge-on-update.</strong> Matched employees are found by{' '}
                <strong>emp number</strong> or <strong>employee ID</strong>. Only filled workbook cells
                change stored data — blank cells leave existing MNR fields untouched.
              </p>
              <p className="font-medium">
                Staff omitted from the file are <strong>not deleted</strong>, so partial or additive
                migrations are safe.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-700" />
            <p className="text-sm font-semibold text-sky-950">
              <strong>Managing Director and Operations Director</strong> are never included in the
              export and are skipped on upload. MD and OD edit their own records in{' '}
              <strong>MNR</strong> only.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <p className="text-sm font-medium text-amber-950">
              <strong className="font-bold">Outstanding debts:</strong> Fill{' '}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">debt_notes</code> and
              the outstanding LKR columns when migrating legacy balances. After import, Finance opens{' '}
              <strong>FM → Payroll Register</strong> to see debt notes and must set up{' '}
              <strong>instalment plans</strong> on <strong>/fm</strong> (Deductions on each site row)
              before locking payroll.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <p className="text-sm font-medium text-amber-950">
              <strong className="font-bold">Compatibility:</strong> Older workbooks with a single{' '}
              <em>Roster</em> sheet or separate <em>Employees</em> / <em>Sites</em> tabs still upload.
              New templates and live exports use the eight structured sheets below. The in-browser bulk
              editor uses the same validation and merge rules — see{' '}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">
                audit-evidence/cvs/bulk-roster-web-editor-operator-note.md
              </code>{' '}
              and{' '}
              <code className="rounded bg-amber-100/80 px-1 py-0.5 text-[11px]">
                MIGRATION_MULTI_SHEET_WORKBOOK_STEPS.txt
              </code>
              .
            </p>
          </div>

          <iframe
            ref={exportFrameRef}
            title="Migration workbook export"
            className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
            tabIndex={-1}
            aria-hidden
          />

          <div className="grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleExportClick}
              className="flex w-full flex-col items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 text-left shadow-sm transition-all hover:border-sky-300 hover:shadow-md disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                ) : (
                  <Download className="h-4 w-4 text-sky-600" />
                )}
                Export live roster
              </span>
              <span className="text-xs font-medium text-slate-600">
                Current Pearzen data split across eight structured sheets — edit offline and re-upload, or
                keep as backup. Saves as{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">
                  pearzen-migration-export-YYYY-MM-DD.xlsx
                </code>
              </span>
            </button>

            <a
              href={BULK_EDITOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full flex-col items-start gap-2 rounded-2xl border border-violet-200/80 bg-white/90 px-5 py-4 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md"
            >
              <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
                <FileSpreadsheet className="h-4 w-4 text-violet-600" />
                Open bulk editor
              </span>
              <span className="text-xs font-medium text-slate-600">
                Edit roster in browser — live dropdowns, column paste, no Excel required. Opens in a new
                tab with current employees (MD / OD / FM excluded).
              </span>
            </a>
          </div>
          <p className="max-w-3xl text-xs font-medium text-slate-500">
              If nothing saves,{' '}
              <a
                href={BULK_EXPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-sky-700 underline underline-offset-2 hover:text-sky-900"
              >
                open the direct export link
              </a>{' '}
              in Safari or Chrome (Cursor&apos;s built-in browser often blocks file downloads).
          </p>

          {downloadHint ? (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
              {downloadHint}
            </p>
          ) : null}

          {downloadError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {downloadError}
            </p>
          ) : null}

          <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-slate-500" />
                  Upload migration workbook
                </p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  Validates all workforce and Sites tabs, then upserts sites, employees, debts, and SM
                  guard links. Requires your <strong>6-digit authenticator code</strong> before any data
                  is written.
                </p>
              </div>
              <label className="inline-flex flex-shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 shadow-sm hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                Choose file
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  disabled={uploading}
                  onChange={handleFileChosen}
                />
              </label>
            </div>

            {uploadMessage ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 ${
                  uploadSuccess
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-rose-200 bg-rose-50'
                }`}
              >
                <p
                  className={`flex items-start gap-2 text-sm font-semibold ${
                    uploadSuccess ? 'text-emerald-900' : 'text-rose-900'
                  }`}
                >
                  {uploadSuccess ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  {uploadMessage}
                </p>
                {uploadErrors.length > 0 ? (
                  <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-rose-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-rose-900">
                    {uploadErrors.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">
              Workbook sheets (8 tabs)
            </p>
            <ul className="grid grid-cols-1 gap-2 text-xs font-medium text-slate-600 sm:grid-cols-2">
              {MIGRATION_WORKBOOK_SHEETS.map(({ name, description }) => (
                <li key={name} className="flex items-start gap-2 rounded-lg border border-slate-200/60 bg-white/70 px-3 py-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
                  <span>
                    <strong className="font-bold text-slate-800">{name}</strong>
                    <span className="text-slate-500"> — {description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ExecutiveGlassCard>

      {pendingFile ? (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-upload-confirm-title"
            className="mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/[0.05]"
          >
            <div className="flex items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-6 py-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/80">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h2
                  id="bulk-upload-confirm-title"
                  className="text-base font-black uppercase tracking-widest text-slate-900"
                >
                  Confirm migration upload
                </h2>
                <p className="truncate text-sm font-medium text-slate-600">{pendingFile.name}</p>
              </div>
              <button
                type="button"
                onClick={closeConfirmModal}
                disabled={uploading}
                className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Cancel upload"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <ul className="space-y-2 text-sm font-semibold leading-relaxed text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                  Will merge into existing records matched by emp number or employee ID.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                  Will <strong>not</strong> delete staff missing from this file.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-500" />
                  Blank cells will <strong>not</strong> erase existing fields.
                </li>
              </ul>
              <p className="text-xs font-medium text-slate-500">
                Use MNR for routine edits after go-live.
              </p>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Authenticator code (required)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => {
                    setConfirmError(null);
                    setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="000000"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-black tracking-[0.45em] text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </label>

              {confirmError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                  {confirmError}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeConfirmModal}
                  disabled={uploading}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmUpload()}
                  disabled={uploading || totpCode.length !== 6}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-rose-600/25 hover:bg-rose-500 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  {uploading ? 'Importing…' : 'Confirm & import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
