'use client';

import { useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Info,
  Lock,
  Upload,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

import { ExecutiveGlassCard } from '../../../components/executive/ExecutiveVaultShell';
import {
  downloadBulkDataWorkbook,
  uploadBulkDataWorkbook,
  type BulkWorkbookMode,
} from './bulk-import-actions';

function triggerBrowserDownload(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkDataImportPanel() {
  const [downloading, setDownloading] = useState<BulkWorkbookMode | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownload = async (mode: BulkWorkbookMode) => {
    setDownloadError(null);
    setDownloading(mode);
    try {
      const result = await downloadBulkDataWorkbook(mode);
      triggerBrowserDownload(result.filename, result.base64);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMessage(null);
    setUploadErrors([]);
    setUploadSuccess(false);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const result = await uploadBulkDataWorkbook(fd);
      if (result.success) {
        setUploadSuccess(true);
        setUploadMessage(result.message);
      } else {
        setUploadSuccess(false);
        setUploadMessage(result.error);
        setUploadErrors(result.validationErrors ?? []);
      }
    } catch (err) {
      setUploadMessage(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <ExecutiveGlassCard className="overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/80">
            <FileSpreadsheet className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Bulk Data Import &amp; Export</h3>
            <p className="text-sm font-medium text-slate-600">
              Multi-sheet workbook for employees (full MNR), sites, SM guard links, and rank reference
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-1.5 text-xs font-bold text-indigo-800">
          <Lock className="h-3.5 w-3.5" />
          MD only
        </span>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-violet-200/80 bg-violet-50/60 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <p className="text-sm font-semibold text-violet-900">
            Download a pre-headed Excel file with one row per employee (all MNR columns on{' '}
            <strong>Employees</strong>), site master data on <strong>Sites</strong>, SM assignments on{' '}
            <strong>SM_Guard_Links</strong>, plus instructions and lookup values. Use the blank template for
            bulk onboarding; use the live export to edit existing records offline.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => void handleDownload('template')}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 text-left shadow-sm transition-all hover:border-violet-300 hover:shadow-md disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
              {downloading === 'template' ? (
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
              ) : (
                <Download className="h-4 w-4 text-violet-600" />
              )}
              Blank import template
            </span>
            <span className="text-xs font-medium text-slate-600">
              Headers + example rows on every sheet. No live data.
            </span>
          </button>

          <button
            type="button"
            disabled={downloading !== null}
            onClick={() => void handleDownload('export')}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800">
              {downloading === 'export' ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              ) : (
                <Download className="h-4 w-4 text-emerald-600" />
              )}
              Export live data
            </span>
            <span className="text-xs font-medium text-slate-600">
              Pre-filled with current employees, sites, and SM links from the system.
            </span>
          </button>
        </div>

        {downloadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {downloadError}
          </p>
        ) : null}

        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/60 px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="h-4 w-4 text-slate-500" />
                Upload edited workbook
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Restricted to Managing Director. Validates every sheet, then saves employees, sites,
                and SM guard links to the database.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 shadow-sm hover:bg-slate-50">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Choose file
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => void handleUpload(e)}
              />
            </label>
          </div>
          {uploadMessage ? (
            <div className="mt-3 space-y-2">
              <p
                className={`flex items-start gap-2 text-xs font-semibold ${
                  uploadSuccess ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {uploadMessage}
              </p>
              {uploadErrors.length > 0 ? (
                <ul className="max-h-40 overflow-y-auto rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 space-y-1">
                  {uploadErrors.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <ul className="grid grid-cols-1 gap-2 text-xs font-medium text-slate-600 sm:grid-cols-2">
          {[
            'Instructions — usage guide',
            'Employees — MNR personal, employment, bank, vetting',
            'Sites — geofence, SM assignment, headcount',
            'SM_Guard_Links — sector manager ↔ guard EPF',
            'Rank_Matrix — reference from MD rank pay settings',
            'Lookups — enums and allowed values',
          ].map((line) => (
            <li key={line} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </ExecutiveGlassCard>
  );
}
