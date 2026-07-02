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
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Check, Loader2, Upload, X } from 'lucide-react';

import { saveSecurityWebsiteContent, uploadSecurityWebsiteSlotImage } from '../actions';
import { compressSecurityWebsiteImageFile } from '../../../lib/security-website-image-compress-client';
import {
  syncRankClientRatesWithGuardRanks,
  type SecurityWebsiteContent,
} from '../../../lib/security-website-types';
import { HQ_HUB_PATH } from '../../../lib/hq-hub';
import { useSecurityWebsite } from './SecurityWebsiteContext';

type SecurityWebsiteEditContextValue = {
  editing: boolean;
  setEditing: (editing: boolean) => void;
  draft: SecurityWebsiteContent;
  content: SecurityWebsiteContent;
  patch: (partial: Partial<SecurityWebsiteContent>) => void;
  patchStat: (index: number, field: 'value' | 'label', value: string) => void;
  patchService: (index: number, field: 'title' | 'description', value: string) => void;
  patchTech: (index: number, field: 'title' | 'description', value: string) => void;
  patchFaq: (index: number, field: 'question' | 'answer', value: string) => void;
  addFaq: () => void;
  removeFaq: (index: number) => void;
  patchRankClientRates: (rankClientRates: SecurityWebsiteContent['rateCard']['rankClientRates']) => void;
  resetDraft: () => void;
  startEditing: () => void;
};

const SecurityWebsiteEditContext = createContext<SecurityWebsiteEditContextValue | null>(null);

export function useSecurityWebsiteEdit() {
  const ctx = useContext(SecurityWebsiteEditContext);
  if (!ctx) throw new Error('useSecurityWebsiteEdit must be used within SecurityWebsiteEditProvider');
  return ctx;
}

function LogoUploadButton({
  logoUrl,
  onUploaded,
}: {
  logoUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const dataUrl = await compressSecurityWebsiteImageFile(file);
      const result = await uploadSecurityWebsiteSlotImage('logo', dataUrl);
      if (result.success && result.url) onUploaded(result.url);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : logoUrl ? (
          <Image
            src={logoUrl}
            alt="Logo preview"
            width={20}
            height={20}
            className="h-5 w-5 rounded object-contain"
            unoptimized={logoUrl.startsWith('data:') || logoUrl.includes('supabase')}
          />
        ) : (
          <Camera className="h-3.5 w-3.5" />
        )}
        {logoUrl ? 'Change logo' : 'Upload logo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </>
  );
}

export function SecurityWebsiteEditBar() {
  const router = useRouter();
  const { canEdit } = useSecurityWebsite();
  const { editing, draft, resetDraft, patch, startEditing, setEditing } = useSecurityWebsiteEdit();
  const { guardRanks } = useSecurityWebsite();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const handleSave = () => {
    setSaveState('saving');
    setSaveError(null);
    const toSave = {
      ...draft,
      rateCard: {
        ...draft.rateCard,
        rankClientRates: syncRankClientRatesWithGuardRanks(
          draft.rateCard.rankClientRates,
          guardRanks.map((r) => r.rankCode),
        ),
      },
    };
    startTransition(async () => {
      const result = await saveSecurityWebsiteContent(toSave);
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
    <div className="sticky top-0 z-[60] border-b border-amber-200/80 bg-amber-50/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <Link
          href={HQ_HUB_PATH}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Master Hub
        </Link>
        <div className="flex items-center gap-2">
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
              <LogoUploadButton logoUrl={draft.logoUrl} onUploaded={(logoUrl) => patch({ logoUrl })} />
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || saveState === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
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
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-950"
            >
              Edit website
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SecurityWebsiteEditProvider({ children }: { children: ReactNode }) {
  const { content: initialContent, guardRanks } = useSecurityWebsite();
  const [draft, setDraft] = useState(initialContent);
  const [editing, setEditing] = useState(false);

  const content = editing ? draft : initialContent;

  const resetDraft = () => {
    setDraft(initialContent);
    setEditing(false);
  };

  const startEditing = () => {
    setDraft({
      ...initialContent,
      rateCard: {
        ...initialContent.rateCard,
        rankClientRates: syncRankClientRatesWithGuardRanks(
          initialContent.rateCard.rankClientRates,
          guardRanks.map((r) => r.rankCode),
        ),
      },
    });
    setEditing(true);
  };

  const patch = (partial: Partial<SecurityWebsiteContent>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const patchStat = (index: number, field: 'value' | 'label', value: string) => {
    setDraft((prev) => {
      const stats = [...prev.stats];
      stats[index] = { ...stats[index], [field]: value };
      return { ...prev, stats };
    });
  };

  const patchService = (index: number, field: 'title' | 'description', value: string) => {
    setDraft((prev) => {
      const services = [...prev.services];
      services[index] = { ...services[index], [field]: value };
      return { ...prev, services };
    });
  };

  const patchTech = (index: number, field: 'title' | 'description', value: string) => {
    setDraft((prev) => {
      const techFeatures = [...prev.techFeatures];
      techFeatures[index] = { ...techFeatures[index], [field]: value };
      return { ...prev, techFeatures };
    });
  };

  const patchFaq = (index: number, field: 'question' | 'answer', value: string) => {
    setDraft((prev) => {
      const faq = [...prev.faq];
      faq[index] = { ...faq[index], [field]: value };
      return { ...prev, faq };
    });
  };

  const addFaq = () => {
    setDraft((prev) => ({
      ...prev,
      faq: [...prev.faq, { question: 'New question', answer: '' }],
    }));
  };

  const removeFaq = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      faq: prev.faq.filter((_, i) => i !== index),
    }));
  };

  const patchRankClientRates = (
    rankClientRates: SecurityWebsiteContent['rateCard']['rankClientRates'],
  ) => {
    setDraft((prev) => ({
      ...prev,
      rateCard: { ...prev.rateCard, rankClientRates },
    }));
  };

  useEffect(() => {
    if (!editing) setDraft(initialContent);
  }, [initialContent, editing]);

  const value: SecurityWebsiteEditContextValue = {
    editing,
    setEditing,
    draft,
    content,
    patch,
    patchStat,
    patchService,
    patchTech,
    patchFaq,
    addFaq,
    removeFaq,
    patchRankClientRates,
    resetDraft,
    startEditing,
  };

  return (
    <SecurityWebsiteEditContext.Provider value={value}>
      {children}
    </SecurityWebsiteEditContext.Provider>
  );
}
