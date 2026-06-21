'use client';

import type { ReactNode } from 'react';
import { Flame } from 'lucide-react';

import BrandWatermarkBackground from './BrandWatermarkBackground';

export default function ForgeGateShell({
  title,
  subtitle,
  children,
  logoUrl,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  logoUrl?: string | null;
}) {
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-slate-950 text-white antialiased">
      <BrandWatermarkBackground logoUrl={logoUrl ?? null} mode="sparse" />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10">
            <Flame className="h-8 w-8 text-indigo-300" />
          </div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.35em] text-indigo-400">
            Pearzen Forge
          </p>
          <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-md">
          {children}
        </div>
      </main>
    </div>
  );
}
