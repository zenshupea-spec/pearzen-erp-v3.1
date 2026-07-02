'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText, FileUp, Loader2, Upload, X, ZoomIn } from 'lucide-react';

import {
  HR_DOCUMENT_META,
  type HrDocumentType,
} from '../../../../packages/supabase/employee-hr-documents';
import {
  compressHrDocumentFileClient,
  formatHrDocumentBytes,
  replaceFileInputFiles,
} from '../../lib/hr-document-compress-client';
import {
  clearPendingHrDocument,
  setPendingHrDocument,
} from '../../lib/hr-document-pending-registry';
import { OfficeCopyWatermarkOverlay } from '../../lib/identity-document-watermark-client';
import { shouldApplyOfficeCopyWatermark } from '../../lib/identity-document-watermark';
import { uploadEmployeeHrDocument } from './document-actions';

type Props = {
  employeeId: string;
  docType: HrDocumentType;
  documentUrl?: string | null;
  expiryDate?: string | null;
  canUpload?: boolean;
  /** Induction form: native file input name (no server round-trip until submit) */
  inductionMode?: boolean;
  /** Induction form: require file before submit */
  required?: boolean;
  onUploaded?: (url: string) => void;
};

type FileStatus = {
  storedBytes: number;
  originalBytes?: number;
  pending?: boolean;
};

function isImageDocumentUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url);
}

function isPdfDocumentUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url);
}

export default function EmployeeDocumentField({
  employeeId,
  docType,
  documentUrl,
  expiryDate,
  canUpload = true,
  inductionMode = false,
  required = false,
  onUploaded,
}: Props) {
  const meta = HR_DOCUMENT_META[docType];
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState<FileStatus | null>(null);
  const [remoteBytes, setRemoteBytes] = useState<number | null>(null);
  const [loadingRemoteSize, setLoadingRemoteSize] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [thumbLoadFailed, setThumbLoadFailed] = useState(false);

  const url = localUrl ?? documentUrl ?? null;
  const hasDoc = Boolean(url?.trim()) || Boolean(fileStatus?.pending);
  const showOfficeCopyWatermark = shouldApplyOfficeCopyWatermark(docType);
  const storedBytes = fileStatus?.storedBytes ?? remoteBytes;
  const isImage = url ? isImageDocumentUrl(url) : false;
  const isPdf = url ? isPdfDocumentUrl(url) : false;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      if (inductionMode) {
        clearPendingHrDocument(docType);
      }
    };
  }, [docType, inductionMode]);

  useEffect(() => {
    setThumbLoadFailed(false);
  }, [url]);

  useEffect(() => {
    setRemoteBytes(null);
    if (!documentUrl?.trim() || fileStatus?.storedBytes != null) {
      setLoadingRemoteSize(false);
      return;
    }

    let cancelled = false;
    setLoadingRemoteSize(true);
    fetch(documentUrl, { method: 'HEAD' })
      .then((res) => {
        const len = res.headers.get('content-length');
        if (cancelled || !len) return;
        const parsed = Number(len);
        if (Number.isFinite(parsed) && parsed > 0) {
          setRemoteBytes(parsed);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingRemoteSize(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentUrl, fileStatus?.storedBytes]);

  useEffect(() => {
    if (!fullPreviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullPreviewOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullPreviewOpen]);

  const setPreviewUrl = (next: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== next) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = next;
    setLocalUrl(next);
  };

  const processSelectedFile = async (file: File) => {
    setCompressing(true);
    setError('');
    try {
      const compressed = await compressHrDocumentFileClient(file, {
        officeCopyWatermark: showOfficeCopyWatermark,
      });
      if (inductionMode) {
        setPendingHrDocument(docType, compressed.file);
      } else if (inputRef.current) {
        replaceFileInputFiles(inputRef.current, compressed.file);
      }
      setPreviewUrl(compressed.previewUrl);
      setFileStatus({
        storedBytes: compressed.compressedBytes,
        originalBytes: compressed.originalBytes,
        pending: inductionMode,
      });

      if (!inductionMode && employeeId) {
        setUploading(true);
        const fd = new FormData();
        fd.append('file', compressed.file);
        const result = await uploadEmployeeHrDocument(employeeId, docType, fd);
        if (!result.success) {
          setError(result.error || 'Upload failed.');
          return;
        }
        if (result.url) {
          setFileStatus({
            storedBytes: result.storedBytes ?? compressed.compressedBytes,
            originalBytes: result.originalBytes ?? compressed.originalBytes,
            pending: false,
          });
          setPreviewUrl(result.url);
          onUploaded?.(result.url);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare file.');
      setFileStatus(null);
      setPreviewUrl(null);
      if (inductionMode) {
        clearPendingHrDocument(docType);
      }
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setCompressing(false);
      setUploading(false);
    }
  };

  const statusLabel = (() => {
    if (compressing) return 'Compressing…';
    if (uploading) return 'Uploading…';
    if (!hasDoc) return 'Not uploaded';
    if (storedBytes != null) {
      const saved =
        fileStatus?.originalBytes != null && fileStatus.originalBytes > storedBytes
          ? ` · from ${formatHrDocumentBytes(fileStatus.originalBytes)}`
          : '';
      return `${formatHrDocumentBytes(storedBytes)}${saved}`;
    }
    if (loadingRemoteSize) return 'On file · …';
    return 'On file';
  })();

  const sizeLine =
    storedBytes != null
      ? formatHrDocumentBytes(storedBytes)
      : loadingRemoteSize
        ? 'Loading size…'
        : hasDoc
          ? 'Size unknown'
          : null;

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      className="sr-only"
      required={inductionMode && required && !hasDoc}
      disabled={uploading || compressing}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void processSelectedFile(file);
      }}
    />
  );

  return (
    <>
      <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-600">
              {meta.label}
              {required && <span className="text-rose-600"> *</span>}
            </p>
            {meta.expiryColumn && (
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                Expiry: {expiryDate || 'Not recorded'}
              </p>
            )}
          </div>
          <span
            className={`shrink-0 max-w-[52%] text-right text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full border ${
              hasDoc
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {hasDoc && url && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setFullPreviewOpen(true)}
              className="group relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-left transition-colors hover:border-sky-300 hover:ring-2 hover:ring-sky-100"
            >
              <div className="flex h-28 items-center justify-center bg-slate-50 relative">
                {isImage && !thumbLoadFailed ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`${meta.label} preview`}
                      className="max-h-28 w-full object-contain"
                      onError={() => setThumbLoadFailed(true)}
                    />
                    {showOfficeCopyWatermark ? <OfficeCopyWatermarkOverlay /> : null}
                  </>
                ) : isPdf || thumbLoadFailed ? (
                  <div className="flex flex-col items-center gap-1 text-slate-500">
                    <FileText className="h-10 w-10" />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      {isPdf ? 'PDF document' : 'Document'}
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`${meta.label} preview`}
                    className="max-h-28 w-full object-contain"
                    onError={() => setThumbLoadFailed(true)}
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-900/75 to-transparent px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-white">
                  {sizeLine}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-sky-100">
                  <ZoomIn className="h-3 w-3" />
                  Preview
                </span>
              </div>
            </button>

            <div className="flex items-center justify-between gap-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-sky-700 hover:text-sky-900"
              >
                <ExternalLink className="w-3 h-3" />
                Open in new tab
              </a>
              {canUpload && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading || compressing}
                  className="text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-rose-700 disabled:opacity-50"
                >
                  Replace file
                </button>
              )}
            </div>
          </div>
        )}

        {hasDoc && fileStatus?.pending && url && (
          <p className="text-[10px] font-semibold text-emerald-800">
            Ready for induction — grayscale JPEG after compression ({formatHrDocumentBytes(fileStatus.storedBytes)}).
          </p>
        )}

        {canUpload && !hasDoc && (
          <div className="space-y-2">
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${
                uploading || compressing
                  ? 'border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
                  : 'border-slate-200 bg-slate-50 hover:border-rose-300 hover:bg-rose-50/30'
              }`}
            >
              {uploading || compressing ? (
                <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
              ) : (
                <Upload className="w-5 h-5 text-slate-400" />
              )}
              <span className="text-[10px] font-bold text-slate-500 text-center">
                PDF, JPEG, PNG, or WebP (max 2MB after compress)
              </span>
              <span className="text-[10px] font-medium text-slate-400 text-center">
                Auto-compressed to grayscale — text stays readable
              </span>
              {fileInput}
            </label>
            {!inductionMode && (
              <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <FileUp className="w-3 h-3" />
                Select a file — compressed automatically before upload
              </p>
            )}
          </div>
        )}

        {canUpload && hasDoc && fileInput}

        {error && (
          <p className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
            {error}
          </p>
        )}
      </div>

      {fullPreviewOpen && url && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setFullPreviewOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${meta.label} preview`}
        >
          <button
            type="button"
            onClick={() => setFullPreviewOpen(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative max-h-[90vh] max-w-[95vw] overflow-auto rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-700">{meta.label}</p>
                {sizeLine && (
                  <p className="text-[10px] font-bold text-slate-500">Stored size: {sizeLine}</p>
                )}
              </div>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 hover:text-sky-900"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                New tab
              </a>
            </div>
            <div className="flex max-h-[calc(90vh-56px)] min-h-[200px] items-center justify-center bg-slate-100 p-4">
              {isPdf && !isImage ? (
                <iframe
                  title={`${meta.label} preview`}
                  src={url}
                  className="h-[75vh] w-[min(90vw,720px)] rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${meta.label} full preview`}
                    className="max-h-[75vh] max-w-full object-contain"
                  />
                  {showOfficeCopyWatermark ? <OfficeCopyWatermarkOverlay /> : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
