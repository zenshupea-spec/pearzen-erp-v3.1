'use client';

import React, { useRef, useState } from 'react';
import { ExternalLink, FileUp, Loader2, Upload } from 'lucide-react';

import {
  HR_DOCUMENT_META,
  type HrDocumentType,
} from '../../../../packages/supabase/employee-hr-documents';
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
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const url = localUrl ?? documentUrl ?? null;
  const hasDoc = Boolean(url?.trim());

  const handleUpload = async (file: File) => {
    if (inductionMode || !employeeId) return;
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const result = await uploadEmployeeHrDocument(employeeId, docType, fd);
      if (!result.success) {
        setError(result.error || 'Upload failed.');
        return;
      }
      if (result.url) {
        setLocalUrl(result.url);
        onUploaded?.(result.url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
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
          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full border ${
            hasDoc
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          {hasDoc ? 'On file' : 'Not uploaded'}
        </span>
      </div>

      {hasDoc && (
        <a
          href={url!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-900"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View document
        </a>
      )}

      {canUpload && (
        <div className="space-y-2">
          <label
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 cursor-pointer transition-colors ${
              uploading
                ? 'border-slate-200 bg-slate-50 opacity-60 pointer-events-none'
                : 'border-slate-200 bg-slate-50 hover:border-rose-300 hover:bg-rose-50/30'
            }`}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-slate-400" />
            )}
            <span className="text-[10px] font-bold text-slate-500 text-center">
              PDF, JPEG, PNG, or WebP (max 5MB)
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              name={inductionMode ? `hr_doc_${docType}` : undefined}
              required={inductionMode && required}
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && !inductionMode) void handleUpload(file);
              }}
            />
          </label>
          {!inductionMode && (
            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <FileUp className="w-3 h-3" />
              Select a file to upload immediately
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
