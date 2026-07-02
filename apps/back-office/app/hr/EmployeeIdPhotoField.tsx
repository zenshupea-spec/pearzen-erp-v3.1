'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

import {
  ID_PHOTO_MAX_EDGE_PX,
  ID_PHOTO_TARGET_MAX_BYTES,
  ID_PHOTO_UPLOAD_MAX_BYTES,
} from '../../lib/hr-document-compress';
import {
  compressHrDocumentFileClient,
  formatHrDocumentBytes,
} from '../../lib/hr-document-compress-client';
import { uploadEmployeeIdPhoto } from './id-photo-actions';

type Props = {
  employeeId: string;
  photoUrl?: string | null;
  canUpload?: boolean;
  onUploaded?: (url: string) => void;
};

async function prepareIdPhotoFile(file: File): Promise<File> {
  if (file.size <= ID_PHOTO_UPLOAD_MAX_BYTES) {
    return file;
  }

  const compressed = await compressHrDocumentFileClient(file, {
    targetMaxBytes: ID_PHOTO_TARGET_MAX_BYTES,
    maxEdgePx: ID_PHOTO_MAX_EDGE_PX,
    grayscale: false,
  });
  return compressed.file;
}

export default function EmployeeIdPhotoField({
  employeeId,
  photoUrl,
  canUpload = false,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState('');
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');

  const url = localUrl ?? photoUrl ?? null;
  const hasPhoto = Boolean(url?.trim());
  const busy = uploading || compressing;

  const openFilePicker = () => {
    if (busy) return;
    inputRef.current?.click();
  };

  const handleUpload = async (file: File) => {
    setCompressing(true);
    setUploading(false);
    setError('');
    setStatusNote('');

    let prepared = file;
    try {
      if (file.size > ID_PHOTO_UPLOAD_MAX_BYTES) {
        setStatusNote(`Compressing ${formatHrDocumentBytes(file.size)} photo…`);
        prepared = await prepareIdPhotoFile(file);
        setStatusNote(
          `Compressed ${formatHrDocumentBytes(file.size)} → ${formatHrDocumentBytes(prepared.size)}`,
        );
      }

      setCompressing(false);
      setUploading(true);

      const fd = new FormData();
      fd.append('file', prepared);
      const result = await uploadEmployeeIdPhoto(employeeId, fd);
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
      setCompressing(false);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-slate-600">
            MNR ID Photo
          </p>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
            Used in OM verification and portal profile avatars
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full border ${
            hasPhoto
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          {compressing ? 'Compressing…' : uploading ? 'Uploading…' : hasPhoto ? 'On file' : 'Not uploaded'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {hasPhoto ? (
          <img
            src={url!}
            alt="MNR ID photo"
            className="h-16 w-16 rounded-xl border border-slate-200 object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-400">
            No photo
          </div>
        )}
      </div>

      {canUpload && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={busy}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 transition-colors ${
              busy
                ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                : 'border-slate-200 bg-slate-50 cursor-pointer hover:border-rose-300 hover:bg-rose-50/30'
            }`}
          >
            {busy ? (
              <Loader2 className="w-5 h-5 text-rose-600 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-slate-400" />
            )}
            <span className="text-[10px] font-bold text-slate-500 text-center">
              {hasPhoto ? 'Replace photo' : 'Choose photo'}
            </span>
            <span className="text-[10px] font-medium text-slate-400 text-center">
              JPEG, PNG, or WebP — over 2MB compressed automatically
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
        </div>
      )}

      {statusNote && !error && (
        <p className="text-[10px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1.5">
          {statusNote}
        </p>
      )}

      {error && (
        <p className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
