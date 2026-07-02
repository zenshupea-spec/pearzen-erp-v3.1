'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Upload, X } from 'lucide-react';

import { savePearzenWebsiteContent } from '../actions';
import type { PearzenWebsiteContent } from '../../../lib/pearzen-website-types';
import { usePearzenWebsite } from './PearzenWebsiteContext';

type PearzenWebsiteEditContextValue = {
  editing: boolean;
  setEditing: (editing: boolean) => void;
  draft: PearzenWebsiteContent;
  content: PearzenWebsiteContent;
  patch: (partial: Partial<PearzenWebsiteContent>) => void;
  patchStat: (
    index: number,
    field: 'value' | 'label' | 'actionLabel' | 'actionHref',
    value: string,
  ) => void;
  patchProduct: (index: number, field: 'title' | 'description', value: string) => void;
  patchIndustry: (index: number, field: 'title' | 'description', value: string) => void;
  patchPlatformBullet: (index: number, value: string) => void;
  resetDraft: () => void;
  startEditing: () => void;
};

const PearzenWebsiteEditContext = createContext<PearzenWebsiteEditContextValue | null>(null);

export function usePearzenWebsiteEdit() {
  const ctx = useContext(PearzenWebsiteEditContext);
  if (!ctx) throw new Error('usePearzenWebsiteEdit must be used within PearzenWebsiteEditProvider');
  return ctx;
}

function Field({
  label,
  value,
  editing,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  if (!editing) return <>{value}</>;
  const shared =
    'w-full rounded-lg border border-indigo-400/40 bg-indigo-950/40 px-3 py-2 text-slate-100 shadow-sm outline-none ring-indigo-400/30 focus:ring-2 placeholder:text-slate-500';
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={`${shared} resize-y min-h-[96px]`}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={shared} />
      )}
    </label>
  );
}

export function PearzenWebsiteEditBar() {
  const router = useRouter();
  const { canEdit } = usePearzenWebsite();
  const { editing, draft, resetDraft, startEditing, setEditing } = usePearzenWebsiteEdit();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const handleSave = () => {
    setSaveState('saving');
    startTransition(async () => {
      const result = await savePearzenWebsiteContent(draft);
      if (result.success) {
        setSaveState('saved');
        setEditing(false);
        router.refresh();
        window.setTimeout(() => setSaveState('idle'), 2000);
      } else {
        setSaveState('error');
      }
    });
  };

  return (
    <div className="sticky top-0 z-[70] border-b border-pearzen-gold bg-[var(--pearzen-navy-deep)]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <Link
          href="/forge"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          SaaS Forge
        </Link>
        <div className="flex items-center gap-2">
          {saveState === 'saved' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          ) : null}
          {saveState === 'error' ? (
            <span className="text-xs font-semibold text-rose-400">Save failed</span>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                onClick={resetDraft}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending || saveState === 'saving'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pearzen-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
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
              className="rounded-lg bg-[var(--pearzen-gold)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--pearzen-navy-deep)]"
            >
              Edit website
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PearzenWebsiteEditProvider({ children }: { children: ReactNode }) {
  const { content, canEdit } = usePearzenWebsite();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  useEffect(() => {
    if (canEdit && searchParams.get('edit') === '1') {
      setDraft(content);
      setEditing(true);
    }
  }, [canEdit, content, searchParams]);

  const patch = (partial: Partial<PearzenWebsiteContent>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const patchStat = (
    index: number,
    field: 'value' | 'label' | 'actionLabel' | 'actionHref',
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      stats: prev.stats.map((stat, i) => (i === index ? { ...stat, [field]: value } : stat)),
    }));
  };

  const patchProduct = (index: number, field: 'title' | 'description', value: string) => {
    setDraft((prev) => ({
      ...prev,
      products: prev.products.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const patchIndustry = (index: number, field: 'title' | 'description', value: string) => {
    setDraft((prev) => ({
      ...prev,
      industries: prev.industries.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const patchPlatformBullet = (index: number, value: string) => {
    setDraft((prev) => ({
      ...prev,
      platformBullets: prev.platformBullets.map((bullet, i) =>
        i === index ? value : bullet,
      ),
    }));
  };

  const value: PearzenWebsiteEditContextValue = {
    editing,
    setEditing,
    draft,
    content,
    patch,
    patchStat,
    patchProduct,
    patchIndustry,
    patchPlatformBullet,
    resetDraft: () => {
      setDraft(content);
      setEditing(false);
    },
    startEditing: () => {
      setDraft(content);
      setEditing(true);
    },
  };

  return (
    <PearzenWebsiteEditContext.Provider value={value}>{children}</PearzenWebsiteEditContext.Provider>
  );
}

export { Field };
