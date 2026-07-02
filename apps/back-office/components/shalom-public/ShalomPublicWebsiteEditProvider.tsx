'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, Check, Loader2, Upload, X } from 'lucide-react';

import {
  saveShalomPublicWebsiteContentAction,
  uploadShalomPublicWebsiteHeroImageAction,
  uploadShalomPublicWebsiteLogoImageAction,
} from '../../app/shalom-public/actions';
import { compressSecurityWebsiteImageFile } from '../../lib/security-website-image-compress-client';
import { HQ_HUB_PATH } from '../../lib/hq-hub';
import { resolveShalomPublicMediaPublicUrl } from '../../../../packages/supabase/shalom-public-media-storage';
import type { ShalomPublicWebsiteContent } from '../../lib/shalom-public-website-types';
import { useShalomPublicWebsite } from './ShalomPublicWebsiteContext';

type ShalomPublicWebsiteEditContextValue = {
  editing: boolean;
  setEditing: (editing: boolean) => void;
  draft: ShalomPublicWebsiteContent;
  content: ShalomPublicWebsiteContent;
  patch: (partial: Partial<ShalomPublicWebsiteContent>) => void;
  resetDraft: () => void;
  startEditing: () => void;
};

const ShalomPublicWebsiteEditContext = createContext<ShalomPublicWebsiteEditContextValue | null>(
  null,
);

export function useShalomPublicWebsiteEdit() {
  const ctx = useContext(ShalomPublicWebsiteEditContext);
  if (!ctx) {
    throw new Error('useShalomPublicWebsiteEdit must be used within ShalomPublicWebsiteEditProvider');
  }
  return ctx;
}

export function ShalomEditableField({
  label,
  value,
  editing,
  onChange,
  multiline,
  className = '',
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  if (!editing) {
    return <span className={className}>{value}</span>;
  }

  const shared =
    'w-full rounded-lg border border-teal-400/40 bg-teal-950/5 px-3 py-2 text-[color:var(--shalom-text)] shadow-sm outline-none ring-teal-400/30 focus:ring-2 placeholder:text-[color:var(--shalom-muted)]';

  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--shalom-accent)]">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          className={`${shared} resize-y min-h-[96px]`}
        />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={shared} />
      )}
    </label>
  );
}

function SiteImageUploadButton({
  label,
  imageUrl,
  onUploaded,
  uploadAction,
}: {
  label: string;
  imageUrl: string;
  onUploaded: (storageRef: string) => void;
  uploadAction: (
    dataUrl: string,
  ) => Promise<{ success: boolean; error?: string; heroImageUrl?: string; logoImageUrl?: string }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';

  const previewUrl = imageUrl
    ? resolveShalomPublicMediaPublicUrl(supabaseUrl, imageUrl) ??
      (imageUrl.startsWith('http') ? imageUrl : null)
    : null;

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      setUploadError('Choose a JPEG, PNG, WebP, or SVG image.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const dataUrl = await compressSecurityWebsiteImageFile(file);
      const result = await uploadAction(dataUrl);
      if (result.success) {
        const storageRef = result.heroImageUrl ?? result.logoImageUrl;
        if (storageRef) {
          onUploaded(storageRef);
          router.refresh();
        }
      } else {
        setUploadError(result.error ?? 'Upload failed.');
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--shalom-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--shalom-text)] disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : previewUrl ? (
          <Image
            src={previewUrl}
            alt={`${label} preview`}
            width={20}
            height={20}
            className="h-5 w-5 rounded object-cover"
            unoptimized
          />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {previewUrl ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      </button>
      {uploadError ? (
        <span className="max-w-[220px] text-[10px] font-semibold leading-snug text-rose-600">
          {uploadError}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </div>
  );
}

export function ShalomPublicWebsiteEditBar() {
  const router = useRouter();
  const { canEdit } = useShalomPublicWebsite();
  const { editing, draft, resetDraft, patch, startEditing, setEditing } = useShalomPublicWebsiteEdit();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const handleSave = () => {
    setSaveState('saving');
    setSaveError(null);
    startTransition(async () => {
      const result = await saveShalomPublicWebsiteContentAction(draft);
      if (result.success) {
        setSaveState('saved');
        setSaveError(null);
        setEditing(false);
        router.refresh();
        window.setTimeout(() => setSaveState('idle'), 2000);
      } else {
        setSaveState('error');
        setSaveError(result.error ?? 'Save failed. Try again.');
      }
    });
  };

  return (
    <div className="sticky top-0 z-[60] border-b border-teal-200/80 bg-teal-50/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
        <Link
          href={HQ_HUB_PATH}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--shalom-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--shalom-text)] hover:bg-[color:var(--shalom-accent-soft)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Master Hub
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {saveState === 'saved' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : null}
          {saveState === 'error' ? (
            <span className="max-w-xs text-xs font-semibold text-rose-600" title={saveError ?? undefined}>
              {saveError ?? 'Save failed'}
            </span>
          ) : null}
          {editing ? (
            <>
              <SiteImageUploadButton
                label="Cover image"
                imageUrl={draft.heroImageUrl}
                onUploaded={(heroImageUrl) => patch({ heroImageUrl })}
                uploadAction={uploadShalomPublicWebsiteHeroImageAction}
              />
              <SiteImageUploadButton
                label="Logo"
                imageUrl={draft.logoImageUrl}
                onUploaded={(logoImageUrl) => patch({ logoImageUrl })}
                uploadAction={uploadShalomPublicWebsiteLogoImageAction}
              />
              <Link
                href="/executive/shalom"
                className="rounded-lg border border-[color:var(--shalom-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--shalom-text)]"
              >
                Shalom calendars
              </Link>
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--shalom-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--shalom-text)]"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || saveState === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--shalom-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {pending || saveState === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Save changes
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg bg-[color:var(--shalom-accent)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white"
            >
              Edit website
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShalomPublicWebsiteEditProvider({ children }: { children: ReactNode }) {
  const { content: initialContent, canEdit } = useShalomPublicWebsite();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<ShalomPublicWebsiteContent>(initialContent);
  const [editing, setEditing] = useState(false);

  const content = editing ? draft : initialContent;

  useEffect(() => {
    if (!editing) setDraft(initialContent);
  }, [initialContent, editing]);

  useEffect(() => {
    if (canEdit && searchParams.get('edit') === '1') {
      setDraft(initialContent);
      setEditing(true);
    }
  }, [canEdit, initialContent, searchParams]);

  const value: ShalomPublicWebsiteEditContextValue = {
    editing,
    setEditing,
    draft,
    content,
    patch: (partial) => setDraft((prev) => ({ ...prev, ...partial })),
    resetDraft: () => {
      setDraft(initialContent);
      setEditing(false);
    },
    startEditing: () => {
      setDraft(initialContent);
      setEditing(true);
    },
  };

  return (
    <ShalomPublicWebsiteEditContext.Provider value={value}>
      {children}
    </ShalomPublicWebsiteEditContext.Provider>
  );
}
