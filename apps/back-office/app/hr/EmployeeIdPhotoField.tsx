'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { uploadEmployeeIdPhoto } from './id-photo-actions';

type Props = {
  employeeId: string;
  photoUrl?: string | null;
  canUpload?: boolean;
  onUploaded?: (url: string) => void;
};

export default function EmployeeIdPhotoField({
  employeeId,
  photoUrl,
  canUpload = false,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const url = localUrl ?? photoUrl ?? null;
  const hasPhoto = Boolean(url?.trim());

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
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
          {hasPhoto ? 'On file' : 'Not uploaded'}
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
              JPEG, PNG, or WebP (max 5MB)
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>
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
