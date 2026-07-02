import Link from 'next/link';
import type { ReactNode } from 'react';

type ForgeComingSoonProps = {
  title: string;
  subtitle: string;
  accent?: 'rose' | 'amber' | 'violet' | 'sky';
  backHref?: string;
  children?: ReactNode;
};

const ACCENT_BORDER: Record<NonNullable<ForgeComingSoonProps['accent']>, string> = {
  rose: 'border-rose-500/20',
  amber: 'border-amber-500/20',
  violet: 'border-violet-500/20',
  sky: 'border-sky-500/20',
};

const ACCENT_TEXT: Record<NonNullable<ForgeComingSoonProps['accent']>, string> = {
  rose: 'text-rose-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  sky: 'text-sky-400',
};

export default function ForgeComingSoon({
  title,
  subtitle,
  accent = 'violet',
  backHref = '/forge',
  children,
}: ForgeComingSoonProps) {
  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      <div
        className={`bg-[#111118] border-b ${ACCENT_BORDER[accent]} sticky top-0 z-50 px-6 py-4 flex items-center gap-4 shadow-lg`}
      >
        <Link
          href={backHref}
          className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">{title}</h1>
          <p className={`text-[10px] font-mono font-bold uppercase tracking-widest mt-0.5 ${ACCENT_TEXT[accent]}`}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-[#111118] border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
            Planned — Step A4
          </span>
          <p className="mt-6 text-slate-400 text-sm leading-relaxed">
            {children ??
              'This module is defined in SAAS_FORGE_ROADMAP.md and will ship in the Commerce phase. The Forge dashboard link is live so navigation structure stays stable.'}
          </p>
          <Link
            href="/forge"
            className="mt-8 inline-flex items-center text-xs font-bold uppercase tracking-wider text-indigo-400 hover:text-white transition-colors"
          >
            Back to Forge home
          </Link>
        </div>
      </div>
    </div>
  );
}
